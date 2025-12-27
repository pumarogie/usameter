import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Decimal } from "@prisma/client/runtime/library";
import { router, tenantProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";

type UsageGroupByItem = {
  eventType: string;
  _sum: { quantity: Decimal | null };
  _count: { id: number };
};
import {
  incrementRollingCounter,
  checkAndIncrementQuota,
  getCachedAggregation,
  setCachedAggregation,
  withRedisFallback,
} from "@/server/db/redis";

export const usageRouter = router({
  recordEvent: tenantProcedure
    .input(
      z.object({
        eventType: z.string(),
        quantity: z.number().positive().default(1),
        metadata: z.record(z.any()).optional(),
        timestamp: z.date().optional(),
        skipQuotaCheck: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }
      const tenantId = ctx.tenantId;

      // Get tenant info
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { organization: true },
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      // Check quota if not skipped
      if (!input.skipQuotaCheck) {
        const periodId = new Date().toISOString().slice(0, 7); // YYYY-MM format
        const quotaCheck = await withRedisFallback(
          async () => {
            const quotaLimit = await prisma.quotaLimit.findUnique({
              where: {
                tenantId_eventType: {
                  tenantId,
                  eventType: input.eventType,
                },
              },
            });

            if (quotaLimit) {
              return checkAndIncrementQuota(
                tenantId,
                input.eventType,
                input.quantity,
                periodId,
              );
            }
            return { allowed: true, current: 0, limit: Infinity };
          },
          async () => {
            // DB fallback for quota check
            const quotaLimit = await prisma.quotaLimit.findUnique({
              where: {
                tenantId_eventType: {
                  tenantId,
                  eventType: input.eventType,
                },
              },
            });

            if (quotaLimit) {
              const usage = await prisma.usageEvent.aggregate({
                where: {
                  tenantId,
                  eventType: input.eventType,
                  timestamp: {
                    gte: quotaLimit.resetAt,
                  },
                },
                _sum: {
                  quantity: true,
                },
              });

              const current = Number(usage._sum.quantity || 0);
              const limit = Number(quotaLimit.limitValue);
              return {
                allowed: current + input.quantity <= limit,
                current: current + input.quantity,
                limit,
              };
            }
            return { allowed: true, current: 0, limit: Infinity };
          },
        );

        if (!quotaCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Quota exceeded for event type ${input.eventType}. Current: ${quotaCheck.current}, Limit: ${quotaCheck.limit}`,
          });
        }
      }

      // Update Redis rolling counters
      const now = input.timestamp || new Date();
      const hourBucket = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const dayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD

      await withRedisFallback(
        async () => {
          await Promise.all([
            incrementRollingCounter(
              tenantId,
              input.eventType,
              input.quantity,
              "1h",
              hourBucket,
            ),
            incrementRollingCounter(
              tenantId,
              input.eventType,
              input.quantity,
              "24h",
              dayBucket,
            ),
          ]);
          return null;
        },
        async () => null,
      );

      // Create usage event in database (async for high throughput)
      const usageEvent = await prisma.usageEvent.create({
        data: {
          tenantId,
          organizationId: tenant.organizationId,
          eventType: input.eventType,
          quantity: input.quantity,
          metadata: input.metadata,
          timestamp: now,
        },
      });

      return {
        id: usageEvent.id,
        timestamp: usageEvent.timestamp,
      };
    }),

  getUsage: tenantProcedure
    .input(
      z.object({
        eventType: z.string().optional(),
        start: z.date(),
        end: z.date(),
        granularity: z.enum(["hour", "day", "month"]).default("day"),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }
      const tenantId = ctx.tenantId;

      const cacheKey = {
        tenantId,
        eventType: input.eventType || "all",
        granularity: input.granularity,
        start: input.start.toISOString(),
        end: input.end.toISOString(),
      };

      // Try Redis cache first
      const cached = await withRedisFallback(
        async () => {
          if (input.eventType) {
            return getCachedAggregation(
              tenantId,
              input.eventType,
              input.granularity,
              cacheKey.start,
              cacheKey.end,
            );
          }
          return null;
        },
        async () => null,
      );

      if (cached !== null) {
        return { total: cached, fromCache: true };
      }

      // Fallback to DB query
      const where: any = {
        tenantId,
        timestamp: {
          gte: input.start,
          lte: input.end,
        },
      };

      if (input.eventType) {
        where.eventType = input.eventType;
      }

      const result = await prisma.usageEvent.aggregate({
        where,
        _sum: {
          quantity: true,
        },
      });

      const total = Number(result._sum.quantity || 0);

      // Cache the result
      if (input.eventType) {
        await withRedisFallback(
          async () => {
            await setCachedAggregation(
              tenantId,
              input.eventType!,
              input.granularity,
              cacheKey.start,
              cacheKey.end,
              total,
            );
            return null;
          },
          async () => null,
        );
      }

      return { total, fromCache: false };
    }),

  getUsageByType: tenantProcedure
    .input(
      z.object({
        start: z.date(),
        end: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }

      const usageByType = await prisma.usageEvent.groupBy({
        by: ["eventType"],
        where: {
          tenantId: ctx.tenantId,
          timestamp: {
            gte: input.start,
            lte: input.end,
          },
        },
        _sum: {
          quantity: true,
        },
        _count: {
          id: true,
        },
      });

      return usageByType.map((item: UsageGroupByItem) => ({
        eventType: item.eventType,
        totalQuantity: Number(item._sum.quantity || 0),
        eventCount: item._count.id,
      }));
    }),

  checkQuota: tenantProcedure
    .input(
      z.object({
        eventType: z.string(),
        quantity: z.number().positive().default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }
      const tenantId = ctx.tenantId;

      const quotaLimit = await prisma.quotaLimit.findUnique({
        where: {
          tenantId_eventType: {
            tenantId,
            eventType: input.eventType,
          },
        },
      });

      if (!quotaLimit) {
        return {
          hasQuota: false,
          allowed: true,
          current: 0,
          limit: Infinity,
          remaining: Infinity,
        };
      }

      const periodId = new Date().toISOString().slice(0, 7);

      const quotaStatus = await withRedisFallback(
        async () => {
          return checkAndIncrementQuota(tenantId, input.eventType, 0, periodId);
        },
        async () => {
          // DB fallback
          const usage = await prisma.usageEvent.aggregate({
            where: {
              tenantId,
              eventType: input.eventType,
              timestamp: {
                gte: quotaLimit.resetAt,
              },
            },
            _sum: {
              quantity: true,
            },
          });

          const current = Number(usage._sum.quantity || 0);
          const limit = Number(quotaLimit.limitValue);
          return {
            allowed: current + input.quantity <= limit,
            current,
            limit,
          };
        },
      );

      return {
        hasQuota: true,
        allowed: quotaStatus.allowed,
        current: quotaStatus.current,
        limit: quotaStatus.limit,
        remaining: Math.max(0, quotaStatus.limit - quotaStatus.current),
      };
    }),
});
