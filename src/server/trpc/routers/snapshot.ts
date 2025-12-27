import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Decimal } from "@prisma/client/runtime/library";
import { router, tenantProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";

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

type UsageGroupByItem = {
  eventType: string;
  _sum: { quantity: Decimal | null };
};

export const snapshotRouter = router({
  createSnapshot: tenantProcedure
    .input(
      z.object({
        snapshotDate: z.date(),
        eventType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }
      const tenantId = ctx.tenantId;

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      const startOfDay = new Date(input.snapshotDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(input.snapshotDate);
      endOfDay.setHours(23, 59, 59, 999);

      const where: any = {
        tenantId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
      };

      if (input.eventType) {
        where.eventType = input.eventType;
      }

      // Group usage by event type
      const usageByType = await prisma.usageEvent.groupBy({
        by: ["eventType"],
        where,
        _sum: {
          quantity: true,
        },
      });

      // Create or update snapshots
      const snapshots = await Promise.all(
        usageByType.map(async (item: UsageGroupByItem) => {
          const totalQuantity = Number(item._sum.quantity || 0);

          return prisma.usageSnapshot.upsert({
            where: {
              tenantId_snapshotDate_eventType: {
                tenantId,
                snapshotDate: input.snapshotDate,
                eventType: item.eventType,
              },
            },
            update: {
              totalQuantity,
            },
            create: {
              tenantId,
              organizationId: tenant.organizationId,
              snapshotDate: input.snapshotDate,
              eventType: item.eventType,
              totalQuantity,
            },
          });
        })
      );

      return {
        count: snapshots.length,
        snapshots: snapshots.map((s: UsageSnapshot) => ({
          id: s.id,
          eventType: s.eventType,
          totalQuantity: Number(s.totalQuantity),
          snapshotDate: s.snapshotDate,
        })),
      };
    }),

  getSnapshots: tenantProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        eventType: z.string().optional(),
        limit: z.number().min(1).max(1000).default(100),
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

      const allSnapshots = await prisma.usageSnapshot.findMany({
        where: {
          tenantId: ctx.tenantId,
          snapshotDate: {
            gte: input.startDate,
            lte: input.endDate,
          },
          ...(input.eventType ? { eventType: input.eventType } : {}),
        },
        orderBy: {
          snapshotDate: "desc",
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      let nextCursor: string | undefined = undefined;
      const snapshots = allSnapshots.length > input.limit
        ? (nextCursor = allSnapshots[input.limit]?.id, allSnapshots.slice(0, input.limit))
        : allSnapshots;

      return {
        snapshots: snapshots.map((s: UsageSnapshot) => ({
          id: s.id,
          eventType: s.eventType,
          totalQuantity: Number(s.totalQuantity),
          snapshotDate: s.snapshotDate,
          createdAt: s.createdAt,
        })),
        nextCursor,
      };
    }),

  aggregateSnapshots: tenantProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        eventType: z.string().optional(),
        granularity: z.enum(["day", "month"]).default("day"),
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
        snapshotDate: {
          gte: input.startDate,
          lte: input.endDate,
        },
      };

      if (input.eventType) {
        where.eventType = input.eventType;
      }

      // Get all snapshots in the range
      const snapshots = await prisma.usageSnapshot.findMany({
        where,
        orderBy: {
          snapshotDate: "asc",
        },
      });

      // Aggregate by granularity
      const aggregated: Record<string, Record<string, number>> = {};

      for (const snapshot of snapshots) {
        let key: string;
        if (input.granularity === "month") {
          key = snapshot.snapshotDate.toISOString().slice(0, 7); // YYYY-MM
        } else {
          key = snapshot.snapshotDate.toISOString().slice(0, 10); // YYYY-MM-DD
        }

        if (!aggregated[key]) {
          aggregated[key] = {};
        }

        if (!aggregated[key][snapshot.eventType]) {
          aggregated[key][snapshot.eventType] = 0;
        }

        aggregated[key][snapshot.eventType] += Number(snapshot.totalQuantity);
      }

      // Convert to array format
      const result = Object.entries(aggregated).map(([period, eventTypes]) => ({
        period,
        eventTypes: Object.entries(eventTypes).map(([eventType, quantity]) => ({
          eventType,
          quantity,
        })),
        totalQuantity: Object.values(eventTypes).reduce((sum, qty) => sum + qty, 0),
      }));

      return result.sort((a, b) => a.period.localeCompare(b.period));
    }),
});

