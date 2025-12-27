import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/server/services/stripe";
import { prisma } from "@/server/db/prisma";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  const organizationId = session.metadata?.organizationId;
  const subscriptionId = session.subscription as string;

  if (!organizationId || !subscriptionId) {
    console.error("Missing organizationId or subscriptionId in session");
    return;
  }

  // The subscription will be created/updated by the subscription.created event
  console.log(
    `Checkout completed for org ${organizationId}, subscription ${subscriptionId}`
  );
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organizationId;

  if (!organizationId) {
    console.error("Missing organizationId in subscription metadata");
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;

  // Find the plan by Stripe price ID
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { stripePriceId: priceId },
  });

  if (!plan) {
    console.error(`No plan found for price ${priceId}`);
    return;
  }

  // Map Stripe status to our status
  const statusMap: Record<string, "ACTIVE" | "CANCELED" | "PAST_DUE" | "TRIALING" | "UNPAID"> = {
    active: "ACTIVE",
    canceled: "CANCELED",
    past_due: "PAST_DUE",
    trialing: "TRIALING",
    unpaid: "UNPAID",
  };

  const status = statusMap[subscription.status] || "ACTIVE";

  // Access billing cycle dates through items or default to now
  const periodStart = subscription.items.data[0]?.billing_thresholds
    ? new Date()
    : new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      organizationId,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      planId: plan.id,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
    update: {
      stripePriceId: priceId,
      planId: plan.id,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
  });

  console.log(`Subscription ${subscription.id} updated for org ${organizationId}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
    },
  });

  console.log(`Subscription ${subscription.id} deleted`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // @ts-expect-error - Stripe types may vary by API version
  const sub = invoice.subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id;

  if (subscriptionId) {
    // Update subscription status to active if it was past_due
    await prisma.subscription.updateMany({
      where: {
        stripeSubscriptionId: subscriptionId,
        status: "PAST_DUE",
      },
      data: { status: "ACTIVE" },
    });
  }

  console.log(`Invoice ${invoice.id} paid`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // @ts-expect-error - Stripe types may vary by API version
  const sub = invoice.subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id;

  if (subscriptionId) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: "PAST_DUE" },
    });
  }

  console.log(`Invoice ${invoice.id} payment failed`);
}
