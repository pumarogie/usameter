import { prisma } from "@/server/db/prisma";
import {
  checkQuotaEnhanced,
  withRedisFallback,
  type QuotaCheckResult,
} from "@/server/db/redis";

export interface QuotaCheckOptions {
  tenantId: string;
  eventType: string;
  quantity: number;
}

export interface EnhancedQuotaResult extends QuotaCheckResult {
  quotaExists: boolean;
}

/**
 * Check quota for a tenant/event type combination
 * Supports soft limits, grace periods, and different enforcement modes
 */
export async function checkQuota(
  options: QuotaCheckOptions
): Promise<EnhancedQuotaResult> {
  const { tenantId, eventType, quantity } = options;

  // Fetch quota limit from database
  const quotaLimit = await prisma.quotaLimit.findUnique({
    where: {
      tenantId_eventType: {
        tenantId,
        eventType,
      },
    },
  });

  // No quota configured - allow everything
  if (!quotaLimit) {
    return {
      quotaExists: false,
      allowed: true,
      current: 0,
      limit: Infinity,
      enforcementMode: "DISABLED",
    };
  }

  const periodId = new Date().toISOString().slice(0, 7); // YYYY-MM format

  const result = await withRedisFallback(
    async () => {
      return checkQuotaEnhanced(tenantId, eventType, quantity, periodId, {
        hardLimit: Number(quotaLimit.limitValue),
        softLimit: quotaLimit.softLimitValue
          ? Number(quotaLimit.softLimitValue)
          : undefined,
        enforcementMode: quotaLimit.enforcementMode,
        gracePeriodEnd: quotaLimit.gracePeriodEnd ?? undefined,
        overageAllowed: quotaLimit.overageAllowed
          ? Number(quotaLimit.overageAllowed)
          : undefined,
        resetAt: quotaLimit.resetAt,
      });
    },
    async () => {
      // Database fallback - aggregate usage since reset
      const usage = await prisma.usageEvent.aggregate({
        where: {
          tenantId,
          eventType,
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
      const softLimit = quotaLimit.softLimitValue
        ? Number(quotaLimit.softLimitValue)
        : undefined;
      const projectedUsage = current + quantity;

      const inGracePeriod =
        quotaLimit.gracePeriodEnd && new Date() < quotaLimit.gracePeriodEnd;

      let allowed = true;
      if (quotaLimit.enforcementMode === "HARD") {
        allowed = projectedUsage <= limit || !!inGracePeriod;
      } else if (quotaLimit.enforcementMode === "SOFT") {
        const maxAllowed =
          limit + (quotaLimit.overageAllowed ? Number(quotaLimit.overageAllowed) : 0);
        allowed = projectedUsage <= maxAllowed || !!inGracePeriod;
      }

      return {
        allowed,
        current: projectedUsage,
        limit,
        softLimit,
        warning: softLimit ? projectedUsage > softLimit : false,
        enforcementMode: quotaLimit.enforcementMode,
        resetAt: quotaLimit.resetAt,
        gracePeriodEnd: quotaLimit.gracePeriodEnd ?? undefined,
      };
    }
  );

  return {
    ...result,
    quotaExists: true,
  };
}

/**
 * Build quota error response with reset time information
 */
export function buildQuotaErrorResponse(result: EnhancedQuotaResult) {
  return {
    error: "Quota exceeded",
    code: "QUOTA_EXCEEDED",
    details: {
      current: result.current,
      limit: result.limit,
      softLimit: result.softLimit,
      enforcementMode: result.enforcementMode,
      resetAt: result.resetAt?.toISOString(),
      gracePeriodEnd: result.gracePeriodEnd?.toISOString(),
    },
  };
}
