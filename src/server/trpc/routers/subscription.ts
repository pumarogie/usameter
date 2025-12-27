import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Decimal } from "@prisma/client/runtime/library";
import { router, publicProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";
import {
  stripe,
  createStripeCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  getInvoices as getStripeInvoices,
  getUpcomingInvoice,
} from "@/server/services/stripe";

type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  stripePriceId: string;
  basePrice: number;
  includedEvents: number;
  overageRate: number;
  features: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type UsageEventGroupBy = {
  eventType: string;
  _sum: { quantity: Decimal | null };
  _count: number;
};

export const subscriptionRouter = router({
  getPlans: publicProcedure.query(async () => {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { basePrice: "asc" },
    });

    return plans.map((plan: SubscriptionPlan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      basePrice: plan.basePrice,
      includedEvents: plan.includedEvents,
      overageRate: plan.overageRate,
      features: plan.features as Record<string, boolean>,
    }));
  }),

  getCurrentSubscription: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const subscription = await prisma.subscription.findFirst({
        where: {
          organizationId: input.organizationId,
          status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
        },
        include: {
          plan: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!subscription) {
        return null;
      }

      return {
        id: subscription.id,
        status: subscription.status,
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          basePrice: subscription.plan.basePrice,
          includedEvents: subscription.plan.includedEvents,
        },
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEnd: subscription.trialEnd,
      };
    }),

  createCheckoutSession: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        planId: z.string(),
        email: z.string().email(),
        organizationName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: input.planId },
      });

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plan not found",
        });
      }

      // Check for existing subscription
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          organizationId: input.organizationId,
          status: { in: ["ACTIVE", "TRIALING"] },
        },
      });

      let stripeCustomerId: string;

      if (existingSubscription) {
        stripeCustomerId = existingSubscription.stripeCustomerId;
      } else {
        // Create new Stripe customer
        const customer = await createStripeCustomer({
          email: input.email,
          name: input.organizationName,
          organizationId: input.organizationId,
        });
        stripeCustomerId = customer.id;
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const session = await createCheckoutSession({
        customerId: stripeCustomerId,
        priceId: plan.stripePriceId,
        organizationId: input.organizationId,
        successUrl: `${baseUrl}/dashboard/billing?success=true`,
        cancelUrl: `${baseUrl}/dashboard/billing/plans?canceled=true`,
      });

      return { sessionUrl: session.url };
    }),

  createPortalSession: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input }) => {
      const subscription = await prisma.subscription.findFirst({
        where: {
          organizationId: input.organizationId,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!subscription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No subscription found",
        });
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const session = await createBillingPortalSession({
        customerId: subscription.stripeCustomerId,
        returnUrl: `${baseUrl}/dashboard/billing`,
      });

      return { sessionUrl: session.url };
    }),

  getStripeInvoices: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: "desc" },
      });

      if (!subscription) {
        return { invoices: [] };
      }

      const stripeInvoices = await getStripeInvoices(
        subscription.stripeCustomerId,
        10
      );

      return {
        invoices: stripeInvoices.data.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          amount: invoice.amount_due,
          status: invoice.status,
          created: new Date(invoice.created * 1000),
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          pdfUrl: invoice.invoice_pdf,
        })),
      };
    }),

  getUpcomingInvoice: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const subscription = await prisma.subscription.findFirst({
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: "desc" },
      });

      if (!subscription) {
        return null;
      }

      const upcoming = await getUpcomingInvoice(subscription.stripeCustomerId);

      if (!upcoming) {
        return null;
      }

      return {
        amount: upcoming.amount_due,
        periodStart: new Date(upcoming.period_start * 1000),
        periodEnd: new Date(upcoming.period_end * 1000),
        lines: upcoming.lines.data.map((line: { description: string | null; amount: number; quantity: number | null }) => ({
          description: line.description,
          amount: line.amount,
          quantity: line.quantity,
        })),
      };
    }),

  getUsageForPeriod: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const subscription = await prisma.subscription.findFirst({
        where: {
          organizationId: input.organizationId,
          status: { in: ["ACTIVE", "TRIALING"] },
        },
        include: { plan: true },
      });

      if (!subscription) {
        return null;
      }

      // Get usage events for current period
      const usageEvents = await prisma.usageEvent.groupBy({
        by: ["eventType"],
        where: {
          organizationId: input.organizationId,
          timestamp: {
            gte: subscription.currentPeriodStart,
            lte: subscription.currentPeriodEnd,
          },
        },
        _sum: { quantity: true },
        _count: true,
      });

      const totalEvents = usageEvents.reduce(
        (sum: number, event: UsageEventGroupBy) => sum + Number(event._sum.quantity || 0),
        0
      );

      const includedEvents = subscription.plan.includedEvents;
      const overageEvents = Math.max(0, totalEvents - includedEvents);
      const overageCost =
        (overageEvents / 1000) * subscription.plan.overageRate;

      return {
        currentPeriod: {
          start: subscription.currentPeriodStart,
          end: subscription.currentPeriodEnd,
        },
        usage: {
          total: totalEvents,
          included: includedEvents,
          overage: overageEvents,
          percentUsed: Math.min(100, (totalEvents / includedEvents) * 100),
        },
        cost: {
          base: subscription.plan.basePrice,
          overage: Math.round(overageCost),
          estimated: subscription.plan.basePrice + Math.round(overageCost),
        },
        byEventType: usageEvents.map((event: UsageEventGroupBy) => ({
          eventType: event.eventType,
          count: event._count,
          quantity: Number(event._sum.quantity || 0),
        })),
      };
    }),
});
