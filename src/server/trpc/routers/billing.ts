import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "@prisma/client";
import { router, tenantProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

type Invoice = {
  id: string;
  tenantId: string;
  organizationId: string;
  invoiceNumber: string;
  periodStart: Date;
  periodEnd: Date;
  status: "DRAFT" | "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  subtotal: Decimal;
  tax: Decimal;
  total: Decimal;
  dueDate: Date;
  paidAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type UsageSummaryItem = {
  eventType: string;
  _sum: { totalQuantity: Decimal | null };
};

type UsageSnapshot = {
  id: string;
  tenantId: string;
  organizationId: string;
  snapshotDate: Date;
  eventType: string;
  totalQuantity: Decimal;
  metadata: unknown;
  createdAt: Date;
};

type PricingTier = {
  id: string;
  organizationId: string;
  eventType: string;
  tierLevel: number;
  minQuantity: Decimal;
  maxQuantity: Decimal | null;
  unitPrice: Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export const billingRouter = router({
  generateInvoice: tenantProcedure
    .input(
      z.object({
        tenantId: z.string(),
        periodStart: z.date(),
        periodEnd: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId || ctx.tenantId !== input.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot generate invoice for different tenant",
        });
      }

      // Get tenant and organization
      const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        include: { organization: true },
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      // Get usage snapshots for the period
      const snapshots = await prisma.usageSnapshot.findMany({
        where: {
          tenantId: ctx.tenantId,
          snapshotDate: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
        },
      });

      // Get pricing tiers for the organization
      const pricingTiers = await prisma.pricingTier.findMany({
        where: {
          organizationId: tenant.organizationId,
          effectiveFrom: {
            lte: input.periodEnd,
          },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: input.periodStart } },
          ],
        },
        orderBy: {
          tierLevel: "asc",
        },
      });

      // Group snapshots by event type
      const usageByEventType = snapshots.reduce(
        (
          acc: Record<
            string,
            { totalQuantity: number; snapshots: UsageSnapshot[] }
          >,
          snapshot: UsageSnapshot
        ) => {
          if (!acc[snapshot.eventType]) {
            acc[snapshot.eventType] = {
              totalQuantity: 0,
              snapshots: [],
            };
          }
          acc[snapshot.eventType]!.totalQuantity += Number(
            snapshot.totalQuantity
          );
          acc[snapshot.eventType]!.snapshots.push(snapshot);
          return acc;
        },
        {} as Record<string, { totalQuantity: number; snapshots: UsageSnapshot[] }>
      );

      // Calculate line items with tiered pricing
      // Fixed: Proper tiered pricing calculation that tracks position through tiers
      const lineItems: Array<{
        eventType: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        tierBreakdown: Array<{
          tierLevel: number;
          quantity: number;
          unitPrice: number;
          subtotal: number;
        }>;
      }> = [];

      for (const [eventType, usage] of Object.entries(usageByEventType)) {
        const relevantTiers = pricingTiers
          .filter((tier: PricingTier) => tier.eventType === eventType)
          .sort((a: PricingTier, b: PricingTier) => a.tierLevel - b.tierLevel);

        const currentUsage = usageByEventType[eventType];
        if (!currentUsage || currentUsage.totalQuantity <= 0) continue;

        let processedQuantity = 0; // Track how much we've processed through tiers
        let totalPrice = 0;
        const tierBreakdown: Array<{
          tierLevel: number;
          quantity: number;
          unitPrice: number;
          subtotal: number;
        }> = [];

        for (const tier of relevantTiers) {
          const tierMin = Number(tier.minQuantity);
          const tierMax = tier.maxQuantity ? Number(tier.maxQuantity) : Infinity;
          const tierPrice = Number(tier.unitPrice);

          // Skip if we haven't reached this tier yet
          if (processedQuantity >= currentUsage.totalQuantity) break;

          // Calculate quantity that falls within this tier
          // Tier range: [tierMin, tierMax)
          const tierCapacity = tierMax - tierMin;
          const quantityToProcess = currentUsage.totalQuantity - processedQuantity;

          // If we're starting below tierMin, skip to the appropriate tier
          if (processedQuantity < tierMin) {
            // This tier starts at tierMin, we need to process from there
            const quantityInTier = Math.min(
              currentUsage.totalQuantity - tierMin,
              tierCapacity
            );

            if (quantityInTier > 0 && currentUsage.totalQuantity > tierMin) {
              const actualQuantity = Math.min(quantityInTier, currentUsage.totalQuantity - tierMin);
              if (actualQuantity > 0) {
                totalPrice += actualQuantity * tierPrice;
                tierBreakdown.push({
                  tierLevel: tier.tierLevel,
                  quantity: actualQuantity,
                  unitPrice: tierPrice,
                  subtotal: actualQuantity * tierPrice,
                });
                processedQuantity = tierMin + actualQuantity;
              }
            }
          } else {
            // We're within or past this tier's minimum
            const remainingInTier = Math.max(0, tierMax - processedQuantity);
            const quantityInTier = Math.min(quantityToProcess, remainingInTier);

            if (quantityInTier > 0) {
              totalPrice += quantityInTier * tierPrice;
              tierBreakdown.push({
                tierLevel: tier.tierLevel,
                quantity: quantityInTier,
                unitPrice: tierPrice,
                subtotal: quantityInTier * tierPrice,
              });
              processedQuantity += quantityInTier;
            }
          }
        }

        // If no tiers matched, use default pricing (first tier or zero)
        if (tierBreakdown.length === 0 && relevantTiers.length > 0) {
          const defaultTier = relevantTiers[0];
          const tierPrice = Number(defaultTier.unitPrice);
          totalPrice = currentUsage.totalQuantity * tierPrice;
          tierBreakdown.push({
            tierLevel: defaultTier.tierLevel,
            quantity: currentUsage.totalQuantity,
            unitPrice: tierPrice,
            subtotal: totalPrice,
          });
        }

        lineItems.push({
          eventType,
          quantity: currentUsage.totalQuantity,
          unitPrice: currentUsage.totalQuantity > 0 ? totalPrice / currentUsage.totalQuantity : 0,
          totalPrice,
          tierBreakdown,
        });
      }

      const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const tax = subtotal * 0.1; // 10% tax (configurable)
      const total = subtotal + tax;

      // Generate invoice number
      const invoiceCount = await prisma.invoice.count({
        where: { organizationId: tenant.organizationId },
      });
      const orgSlug = tenant.organization?.slug?.toUpperCase() ?? "ORG";
      const invoiceNumber = `INV-${orgSlug}-${String(invoiceCount + 1).padStart(6, "0")}`;

      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }

      const tenantId = ctx.tenantId;

      // Create invoice with audit trail linking events
      const invoice = await prisma.$transaction(async (tx: TransactionClient) => {
        // Create the invoice
        const newInvoice = await tx.invoice.create({
          data: {
            tenantId,
            organizationId: tenant.organizationId,
            invoiceNumber,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            subtotal,
            tax,
            total,
            dueDate: new Date(input.periodEnd.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days after period end
            status: "DRAFT",
            lineItems: {
              create: lineItems.map((item) => ({
                eventType: item.eventType,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                metadata: { tierBreakdown: item.tierBreakdown },
              })),
            },
          },
          include: {
            lineItems: true,
          },
        });

        // Link all usage events in the billing period to this invoice (audit trail)
        const billedAt = new Date();
        await tx.usageEvent.updateMany({
          where: {
            tenantId: ctx.tenantId,
            timestamp: {
              gte: input.periodStart,
              lte: input.periodEnd,
            },
            invoiceId: null, // Only link events not already billed
          },
          data: {
            invoiceId: newInvoice.id,
            billedAt,
          },
        });

        return newInvoice;
      });

      return invoice;
    }),

  getInvoice: tenantProcedure
    .input(
      z.object({
        invoiceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: input.invoiceId,
          tenantId: ctx.tenantId,
        },
        include: {
          lineItems: true,
          tenant: true,
        },
      });

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      return invoice;
    }),

  listInvoices: tenantProcedure
    .input(
      z.object({
        status: z.enum(["DRAFT", "PENDING", "PAID", "OVERDUE", "CANCELLED"]).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }

      const where: any = {
        tenantId: ctx.tenantId,
      };

      if (input.status) {
        where.status = input.status;
      }

      if (input.startDate || input.endDate) {
        where.periodStart = {};
        if (input.startDate) {
          where.periodStart.gte = input.startDate;
        }
        if (input.endDate) {
          where.periodStart.lte = input.endDate;
        }
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          lineItems: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      let nextCursor: string | undefined = undefined;
      if (invoices.length > input.limit) {
        const nextItem = invoices.pop();
        nextCursor = nextItem!.id;
      }

      return {
        invoices,
        nextCursor,
      };
    }),

  getBillingReport: tenantProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }

      const [invoices, usageSummary] = await Promise.all([
        prisma.invoice.findMany({
          where: {
            tenantId: ctx.tenantId,
            periodStart: {
              gte: input.startDate,
              lte: input.endDate,
            },
          },
          include: {
            lineItems: true,
          },
        }),
        prisma.usageSnapshot.groupBy({
          by: ["eventType"],
          where: {
            tenantId: ctx.tenantId,
            snapshotDate: {
              gte: input.startDate,
              lte: input.endDate,
            },
          },
          _sum: {
            totalQuantity: true,
          },
        }),
      ]);

      const totalBilled = invoices.reduce((sum: number, inv: Invoice) => sum + Number(inv.total), 0);
      const totalPaid = invoices
        .filter((inv: Invoice) => inv.status === "PAID")
        .reduce((sum: number, inv: Invoice) => sum + Number(inv.total), 0);
      const totalPending = invoices
        .filter((inv: Invoice) => inv.status === "PENDING" || inv.status === "DRAFT")
        .reduce((sum: number, inv: Invoice) => sum + Number(inv.total), 0);

      return {
        period: {
          start: input.startDate,
          end: input.endDate,
        },
        summary: {
          totalBilled,
          totalPaid,
          totalPending,
          invoiceCount: invoices.length,
        },
        usage: usageSummary.map((item: UsageSummaryItem) => ({
          eventType: item.eventType,
          totalQuantity: Number(item._sum.totalQuantity || 0),
        })),
        invoices: invoices.map((inv: Invoice) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          status: inv.status,
          total: Number(inv.total),
        })),
      };
    }),
});

