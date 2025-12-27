import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { router, publicProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";

type TenantWithAggregates = {
  id: string;
  externalId: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    usageEvents: number;
  };
};

export const customersRouter = router({
  // List all customers (tenants) for an organization
  list: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: {
        organizationId: string;
        status?: "ACTIVE" | "SUSPENDED" | "DELETED";
        OR?: Array<{
          name?: { contains: string; mode: "insensitive" };
          externalId?: { contains: string; mode: "insensitive" };
        }>;
      } = {
        organizationId: input.organizationId,
      };

      if (input.status) {
        where.status = input.status;
      }

      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { externalId: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const customers = await prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          _count: {
            select: { usageEvents: true },
          },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (customers.length > input.limit) {
        const nextItem = customers.pop();
        nextCursor = nextItem!.id;
      }

      return {
        customers: customers.map((customer: TenantWithAggregates) => ({
          id: customer.id,
          externalId: customer.externalId,
          name: customer.name,
          status: customer.status,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          totalEvents: customer._count.usageEvents,
        })),
        nextCursor,
      };
    }),

  // Get a single customer with usage stats
  get: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        customerId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const customer = await prisma.tenant.findFirst({
        where: {
          id: input.customerId,
          organizationId: input.organizationId,
        },
        include: {
          _count: {
            select: {
              usageEvents: true,
              invoices: true,
            },
          },
        },
      });

      if (!customer) {
        return null;
      }

      // Get usage for current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const monthlyUsage = await prisma.usageEvent.aggregate({
        where: {
          tenantId: customer.id,
          timestamp: { gte: startOfMonth },
        },
        _sum: { quantity: true },
        _count: { id: true },
      });

      // Get usage by event type
      const usageByType = await prisma.usageEvent.groupBy({
        by: ["eventType"],
        where: {
          tenantId: customer.id,
          timestamp: { gte: startOfMonth },
        },
        _sum: { quantity: true },
        _count: { id: true },
      });

      return {
        id: customer.id,
        externalId: customer.externalId,
        name: customer.name,
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        stats: {
          totalEvents: customer._count.usageEvents,
          totalInvoices: customer._count.invoices,
          monthlyUsage: Number(monthlyUsage._sum.quantity ?? 0),
          monthlyEventCount: monthlyUsage._count.id,
        },
        usageByType: usageByType.map(
          (item: {
            eventType: string;
            _sum: { quantity: Decimal | null };
            _count: { id: number };
          }) => ({
            eventType: item.eventType,
            quantity: Number(item._sum.quantity ?? 0),
            count: item._count.id,
          }),
        ),
      };
    }),

  // Get customer count and summary stats
  getSummary: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const [total, active, suspended] = await Promise.all([
        prisma.tenant.count({
          where: { organizationId: input.organizationId },
        }),
        prisma.tenant.count({
          where: { organizationId: input.organizationId, status: "ACTIVE" },
        }),
        prisma.tenant.count({
          where: { organizationId: input.organizationId, status: "SUSPENDED" },
        }),
      ]);

      // Get new customers this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const newThisMonth = await prisma.tenant.count({
        where: {
          organizationId: input.organizationId,
          createdAt: { gte: startOfMonth },
        },
      });

      return {
        total,
        active,
        suspended,
        deleted: total - active - suspended,
        newThisMonth,
      };
    }),

  // Update customer status
  updateStatus: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        customerId: z.string(),
        status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]),
      }),
    )
    .mutation(async ({ input }) => {
      const customer = await prisma.tenant.updateMany({
        where: {
          id: input.customerId,
          organizationId: input.organizationId,
        },
        data: {
          status: input.status,
          updatedAt: new Date(),
        },
      });

      return { success: customer.count > 0 };
    }),

  // Update customer name
  update: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        customerId: z.string(),
        name: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ input }) => {
      const customer = await prisma.tenant.updateMany({
        where: {
          id: input.customerId,
          organizationId: input.organizationId,
        },
        data: {
          name: input.name,
          updatedAt: new Date(),
        },
      });

      return { success: customer.count > 0 };
    }),
});
