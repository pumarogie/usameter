import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Decimal } from "@prisma/client/runtime/library";
import { router, orgProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";

type Tenant = {
  id: string;
  organizationId: string;
  externalId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  createdAt: Date;
  updatedAt: Date;
};

type TenantWithCount = Tenant & {
  _count: { usageEvents: number };
};

type UsageGroupByItem = {
  eventType: string;
  _sum: { quantity: Decimal | null };
  _count: { id: number };
};
import { getRedisClient, getTopHotTenants } from "@/server/db/redis";

export const adminRouter = router({
  getHotTenants: orgProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        metric: z.enum(["events_per_min", "cost_per_hour", "quota_usage_pct"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Organization context is required",
        });
      }

      try {
        const redis = getRedisClient();
        const hotTenantIds = await getTopHotTenants(input.limit);

        const tenants = await prisma.tenant.findMany({
          where: {
            id: { in: hotTenantIds },
            organizationId: ctx.organizationId,
          },
          include: {
            _count: {
              select: {
                usageEvents: true,
              },
            },
          },
        });

        // Get metrics from Redis for each tenant
        const tenantsWithMetrics = await Promise.all(
          tenants.map(async (tenant: TenantWithCount) => {
            const metrics: Record<string, number> = {};
            
            try {
              const [eventsPerMin, costPerHour, quotaUsagePct] = await Promise.all([
                redis.get(`hot:tenant:${tenant.id}:events_per_min`),
                redis.get(`hot:tenant:${tenant.id}:cost_per_hour`),
                redis.get(`hot:tenant:${tenant.id}:quota_usage_pct`),
              ]);

              metrics.eventsPerMin = eventsPerMin ? parseFloat(eventsPerMin) : 0;
              metrics.costPerHour = costPerHour ? parseFloat(costPerHour) : 0;
              metrics.quotaUsagePct = quotaUsagePct ? parseFloat(quotaUsagePct) : 0;
            } catch (error) {
              console.error(`Error fetching metrics for tenant ${tenant.id}:`, error);
            }

            return {
              id: tenant.id,
              name: tenant.name,
              externalId: tenant.externalId,
              status: tenant.status,
              metrics,
              eventCount: tenant._count.usageEvents,
            };
          })
        );

        return tenantsWithMetrics;
      } catch (error) {
        // Fallback to DB query if Redis fails
        const tenants = await prisma.tenant.findMany({
          where: {
            organizationId: ctx.organizationId,
            status: "ACTIVE",
          },
          include: {
            _count: {
              select: {
                usageEvents: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: input.limit,
        });

        return tenants.map((tenant: TenantWithCount) => ({
          id: tenant.id,
          name: tenant.name,
          externalId: tenant.externalId,
          status: tenant.status,
          metrics: {
            eventsPerMin: 0,
            costPerHour: 0,
            quotaUsagePct: 0,
          },
          eventCount: tenant._count.usageEvents,
        }));
      }
    }),

  getOrgStats: orgProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Organization context is required",
        });
      }

      const where: any = {
        organizationId: ctx.organizationId,
      };

      if (input.startDate || input.endDate) {
        where.timestamp = {};
        if (input.startDate) {
          where.timestamp.gte = input.startDate;
        }
        if (input.endDate) {
          where.timestamp.lte = input.endDate;
        }
      }

      const [tenantCount, usageStats, invoiceStats] = await Promise.all([
        prisma.tenant.count({
          where: {
            organizationId: ctx.organizationId,
            status: "ACTIVE",
          },
        }),
        prisma.usageEvent.aggregate({
          where,
          _sum: {
            quantity: true,
          },
          _count: {
            id: true,
          },
        }),
        prisma.invoice.aggregate({
          where: {
            organizationId: ctx.organizationId,
            ...(input.startDate || input.endDate
              ? {
                  periodStart: {
                    ...(input.startDate ? { gte: input.startDate } : {}),
                    ...(input.endDate ? { lte: input.endDate } : {}),
                  },
                }
              : {}),
          },
          _sum: {
            total: true,
          },
          _count: {
            id: true,
          },
        }),
      ]);

      const usageByType = await prisma.usageEvent.groupBy({
        by: ["eventType"],
        where,
        _sum: {
          quantity: true,
        },
        _count: {
          id: true,
        },
      });

      return {
        tenantCount,
        usage: {
          totalQuantity: Number(usageStats._sum.quantity || 0),
          totalEvents: usageStats._count.id,
          byType: usageByType.map((item: UsageGroupByItem) => ({
            eventType: item.eventType,
            quantity: Number(item._sum.quantity || 0),
            eventCount: item._count.id,
          })),
        },
        billing: {
          totalRevenue: Number(invoiceStats._sum.total || 0),
          invoiceCount: invoiceStats._count.id,
        },
      };
    }),

  getSystemHealth: orgProcedure.query(async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Organization context is required",
      });
    }

    const health = {
      database: "unknown" as "healthy" | "degraded" | "unhealthy" | "unknown",
      redis: "unknown" as "healthy" | "degraded" | "unhealthy" | "unknown",
      timestamp: new Date(),
    };

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
      health.database = "healthy";
    } catch (error) {
      console.error("Database health check failed:", error);
      health.database = "unhealthy";
    }

    // Check Redis
    try {
      const redis = getRedisClient();
      if (redis.status === "ready") {
        await redis.ping();
        health.redis = "healthy";
      } else {
        health.redis = "degraded";
      }
    } catch (error) {
      console.error("Redis health check failed:", error);
      health.redis = "unhealthy";
    }

    return health;
  }),

  bulkGenerateInvoices: orgProcedure
    .input(
      z.object({
        tenantIds: z.array(z.string()).optional(),
        periodStart: z.date(),
        periodEnd: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Organization context is required",
        });
      }

      const where: any = {
        organizationId: ctx.organizationId,
        status: "ACTIVE",
      };

      if (input.tenantIds && input.tenantIds.length > 0) {
        where.id = { in: input.tenantIds };
      }

      const tenants = await prisma.tenant.findMany({
        where,
      });

      const results = await Promise.allSettled(
        tenants.map(async (tenant: Tenant) => {
          // Import billing router procedure logic here or refactor to shared function
          // For now, we'll use a simplified version
          const snapshots = await prisma.usageSnapshot.findMany({
            where: {
              tenantId: tenant.id,
              snapshotDate: {
                gte: input.periodStart,
                lte: input.periodEnd,
              },
            },
          });

          if (snapshots.length === 0) {
            return { tenantId: tenant.id, status: "skipped", reason: "No usage data" };
          }

          // Generate invoice (simplified - in production, use the full logic from billing router)
          const invoiceCount = await prisma.invoice.count({
            where: { organizationId: ctx.organizationId },
          });
          const organization = await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
          });
          const orgSlug = organization?.slug?.toUpperCase() ?? "ORG";
          const invoiceNumber = `INV-${orgSlug}-${String(invoiceCount + 1).padStart(6, "0")}`;

          const invoice = await prisma.invoice.create({
            data: {
              tenantId: tenant.id,
              organizationId: ctx.organizationId,
              invoiceNumber,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              subtotal: 0,
              tax: 0,
              total: 0,
              dueDate: new Date(input.periodEnd.getTime() + 30 * 24 * 60 * 60 * 1000),
              status: "DRAFT",
            },
          });

          return { tenantId: tenant.id, status: "success", invoiceId: invoice.id };
        })
      );

      return {
        total: tenants.length,
        succeeded: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
        results: results.map((r) =>
          r.status === "fulfilled" ? r.value : { status: "error", error: String(r.reason) }
        ),
      };
    }),
});

