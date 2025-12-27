import Redis from "ioredis";

// Redis client singleton with connection pooling
let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on("error", (err: Error) => {
      console.error("Redis Client Error:", err);
    });

    redis.on("connect", () => {
      console.log("Redis Client Connected");
    });
  }

  return redis;
}

// Circuit breaker state
let circuitBreakerOpen = false;
let circuitBreakerFailures = 0;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIME = 30000; // 30 seconds

export async function withRedisFallback<T>(
  redisOp: () => Promise<T>,
  dbFallback: () => Promise<T>
): Promise<T> {
  if (circuitBreakerOpen) {
    console.warn("Circuit breaker open, using DB fallback");
    return dbFallback();
  }

  try {
    const client = getRedisClient();
    if (client.status !== "ready") {
      await client.connect();
    }
    const result = await redisOp();
    circuitBreakerFailures = 0;
    circuitBreakerOpen = false;
    return result;
  } catch (error) {
    circuitBreakerFailures++;
    console.error("Redis operation failed:", error);
    
    if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreakerOpen = true;
      setTimeout(() => {
        circuitBreakerOpen = false;
        circuitBreakerFailures = 0;
      }, CIRCUIT_BREAKER_RESET_TIME);
    }

    return dbFallback();
  }
}

// Redis key pattern helpers

export function getRollingCounterKey(
  tenantId: string,
  eventType: string,
  window: "1h" | "24h" | "7d" | "30d",
  bucket: string
): string {
  return `usage:tenant:${tenantId}:event:${eventType}:rolling:${window}:${bucket}`;
}

export function getHotTenantKey(tenantId: string, metric: string): string {
  return `hot:tenant:${tenantId}:${metric}`;
}

export function getHotOrgKey(organizationId: string, metric: string): string {
  return `hot:org:${organizationId}:${metric}`;
}

export function getHotTenantsSortedSetKey(): string {
  return "hot:tenants:by_events";
}

export function getQuotaKey(
  tenantId: string,
  eventType: string,
  periodId: string
): string {
  return `quota:tenant:${tenantId}:event:${eventType}:period:${periodId}`;
}

export function getQuotaLimitKey(tenantId: string, eventType: string): string {
  return `quota:tenant:${tenantId}:event:${eventType}:limit`;
}

export function getQuotaResetKey(tenantId: string, eventType: string): string {
  return `quota:tenant:${tenantId}:event:${eventType}:reset_at`;
}

export function getAggregationKey(
  tenantId: string,
  eventType: string,
  granularity: "hour" | "day" | "month",
  start: string,
  end: string
): string {
  return `agg:tenant:${tenantId}:event:${eventType}:${granularity}:${start}:${end}`;
}

export function getOrgAggregationKey(
  organizationId: string,
  eventType: string,
  granularity: "hour" | "day" | "month",
  start: string,
  end: string
): string {
  return `agg:org:${organizationId}:event:${eventType}:${granularity}:${start}:${end}`;
}

// Helper functions for common Redis operations

export async function incrementRollingCounter(
  tenantId: string,
  eventType: string,
  quantity: number,
  window: "1h" | "24h" | "7d" | "30d",
  bucket: string
): Promise<number> {
  const key = getRollingCounterKey(tenantId, eventType, window, bucket);
  const client = getRedisClient();
  
  const pipeline = client.pipeline();
  pipeline.incrbyfloat(key, quantity);
  
  // Set TTL based on window
  const ttlMap = {
    "1h": 7200, // 2 hours
    "24h": 90000, // 25 hours
    "7d": 604800, // 7 days + buffer
    "30d": 2592000, // 30 days + buffer
  };
  pipeline.expire(key, ttlMap[window]);
  
  const results = await pipeline.exec();
  const value = results?.[0]?.[1];
  return typeof value === "number" ? value : (typeof value === "string" ? parseFloat(value) : 0);
}

export async function getRollingCounter(
  tenantId: string,
  eventType: string,
  window: "1h" | "24h" | "7d" | "30d",
  bucket: string
): Promise<number> {
  const key = getRollingCounterKey(tenantId, eventType, window, bucket);
  const client = getRedisClient();
  const value = await client.get(key);
  return value ? parseFloat(value) : 0;
}

export async function updateHotTenantMetrics(
  tenantId: string,
  eventsPerMin: number,
  costPerHour: number,
  quotaUsagePct: number
): Promise<void> {
  const client = getRedisClient();
  const pipeline = client.pipeline();
  
  pipeline.setex(getHotTenantKey(tenantId, "events_per_min"), 300, eventsPerMin.toString());
  pipeline.setex(getHotTenantKey(tenantId, "cost_per_hour"), 300, costPerHour.toString());
  pipeline.setex(getHotTenantKey(tenantId, "quota_usage_pct"), 300, quotaUsagePct.toString());
  
  // Update sorted set for top tenants
  pipeline.zadd(getHotTenantsSortedSetKey(), eventsPerMin, tenantId);
  pipeline.expire(getHotTenantsSortedSetKey(), 300);
  
  await pipeline.exec();
}

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  softLimit?: number;
  warning?: boolean;
  enforcementMode: "HARD" | "SOFT" | "DISABLED";
  resetAt?: Date;
  gracePeriodEnd?: Date;
}

export async function checkAndIncrementQuota(
  tenantId: string,
  eventType: string,
  quantity: number,
  periodId: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const client = getRedisClient();

  const quotaKey = getQuotaKey(tenantId, eventType, periodId);
  const limitKey = getQuotaLimitKey(tenantId, eventType);

  const pipeline = client.pipeline();
  pipeline.get(limitKey);
  pipeline.incrbyfloat(quotaKey, quantity);
  pipeline.get(quotaKey);

  const results = await pipeline.exec();
  const limitValue = results?.[0]?.[1];
  const currentValue = results?.[2]?.[1];
  const limit = limitValue ? parseFloat(String(limitValue)) : Infinity;
  const current = currentValue ? parseFloat(String(currentValue)) : quantity;

  return {
    allowed: current <= limit,
    current,
    limit,
  };
}

// Enhanced quota check with soft limits and grace periods
export async function checkQuotaEnhanced(
  tenantId: string,
  eventType: string,
  quantity: number,
  periodId: string,
  options: {
    softLimit?: number;
    hardLimit: number;
    enforcementMode: "HARD" | "SOFT" | "DISABLED";
    gracePeriodEnd?: Date;
    overageAllowed?: number;
    resetAt?: Date;
  }
): Promise<QuotaCheckResult> {
  const client = getRedisClient();

  const quotaKey = getQuotaKey(tenantId, eventType, periodId);

  // Get current usage without incrementing first
  const currentUsageStr = await client.get(quotaKey);
  const currentUsage = currentUsageStr ? parseFloat(currentUsageStr) : 0;
  const projectedUsage = currentUsage + quantity;

  const result: QuotaCheckResult = {
    allowed: true,
    current: currentUsage,
    limit: options.hardLimit,
    softLimit: options.softLimit,
    warning: false,
    enforcementMode: options.enforcementMode,
    resetAt: options.resetAt,
    gracePeriodEnd: options.gracePeriodEnd,
  };

  // Check enforcement mode
  if (options.enforcementMode === "DISABLED") {
    // Just track, don't enforce
    await client.incrbyfloat(quotaKey, quantity);
    result.current = projectedUsage;
    return result;
  }

  // Check grace period
  const inGracePeriod = options.gracePeriodEnd && new Date() < options.gracePeriodEnd;

  // Check soft limit warning
  if (options.softLimit && projectedUsage > options.softLimit) {
    result.warning = true;
  }

  // Check hard limit
  if (options.enforcementMode === "HARD") {
    if (projectedUsage > options.hardLimit && !inGracePeriod) {
      result.allowed = false;
      return result;
    }
  } else if (options.enforcementMode === "SOFT") {
    // Allow up to hardLimit + overageAllowed
    const maxAllowed = options.hardLimit + (options.overageAllowed || 0);
    if (projectedUsage > maxAllowed && !inGracePeriod) {
      result.allowed = false;
      return result;
    }
  }

  // Increment if allowed
  if (result.allowed) {
    await client.incrbyfloat(quotaKey, quantity);
    result.current = projectedUsage;
  }

  return result;
}

// Rate limiting using sliding window algorithm
export function getRateLimitKey(
  identifier: string,
  window: "second" | "minute" | "hour"
): string {
  const now = new Date();
  let bucket: string;

  switch (window) {
    case "second":
      bucket = now.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
      break;
    case "minute":
      bucket = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
      break;
    case "hour":
      bucket = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      break;
  }

  return `ratelimit:${identifier}:${window}:${bucket}`;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter?: number; // seconds until they can retry
}

export async function checkRateLimit(
  identifier: string, // e.g., apiKeyId or organizationId
  limits: {
    perSecond?: number;
    perMinute?: number;
    perHour?: number;
  }
): Promise<RateLimitResult> {
  const client = getRedisClient();
  const pipeline = client.pipeline();
  const now = new Date();

  // Check all configured limits
  const checks: Array<{
    window: "second" | "minute" | "hour";
    limit: number;
    ttl: number;
  }> = [];

  if (limits.perSecond) {
    checks.push({ window: "second", limit: limits.perSecond, ttl: 2 });
  }
  if (limits.perMinute) {
    checks.push({ window: "minute", limit: limits.perMinute, ttl: 120 });
  }
  if (limits.perHour) {
    checks.push({ window: "hour", limit: limits.perHour, ttl: 7200 });
  }

  if (checks.length === 0) {
    return { allowed: true, remaining: Infinity, limit: Infinity, resetAt: now };
  }

  // Get current counts for all windows
  for (const check of checks) {
    const key = getRateLimitKey(identifier, check.window);
    pipeline.get(key);
  }

  const results = await pipeline.exec();

  // Find the most restrictive limit
  let mostRestrictive: RateLimitResult = {
    allowed: true,
    remaining: Infinity,
    limit: Infinity,
    resetAt: now,
  };

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const currentCount = results?.[i]?.[1] ? parseInt(String(results[i]![1]), 10) : 0;
    const remaining = Math.max(0, check.limit - currentCount - 1);

    if (currentCount >= check.limit) {
      // Calculate reset time
      const resetAt = new Date();
      switch (check.window) {
        case "second":
          resetAt.setSeconds(resetAt.getSeconds() + 1, 0);
          break;
        case "minute":
          resetAt.setMinutes(resetAt.getMinutes() + 1, 0, 0);
          break;
        case "hour":
          resetAt.setHours(resetAt.getHours() + 1, 0, 0, 0);
          break;
      }

      return {
        allowed: false,
        remaining: 0,
        limit: check.limit,
        resetAt,
        retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
      };
    }

    // Track most restrictive remaining
    if (remaining < mostRestrictive.remaining) {
      const resetAt = new Date();
      switch (check.window) {
        case "second":
          resetAt.setSeconds(resetAt.getSeconds() + 1, 0);
          break;
        case "minute":
          resetAt.setMinutes(resetAt.getMinutes() + 1, 0, 0);
          break;
        case "hour":
          resetAt.setHours(resetAt.getHours() + 1, 0, 0, 0);
          break;
      }

      mostRestrictive = {
        allowed: true,
        remaining,
        limit: check.limit,
        resetAt,
      };
    }
  }

  // Increment all counters if allowed
  const incrPipeline = client.pipeline();
  for (const check of checks) {
    const key = getRateLimitKey(identifier, check.window);
    incrPipeline.incr(key);
    incrPipeline.expire(key, check.ttl);
  }
  await incrPipeline.exec();

  return mostRestrictive;
}

// Check idempotency key exists
export async function checkIdempotencyKey(
  organizationId: string,
  idempotencyKey: string
): Promise<string | null> {
  const client = getRedisClient();
  const key = `idempotency:${organizationId}:${idempotencyKey}`;
  return client.get(key);
}

// Set idempotency key with event ID
export async function setIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
  eventId: string,
  ttl: number = 86400 // 24 hours default
): Promise<void> {
  const client = getRedisClient();
  const key = `idempotency:${organizationId}:${idempotencyKey}`;
  await client.setex(key, ttl, eventId);
}

export async function getCachedAggregation(
  tenantId: string,
  eventType: string,
  granularity: "hour" | "day" | "month",
  start: string,
  end: string
): Promise<number | null> {
  const key = getAggregationKey(tenantId, eventType, granularity, start, end);
  const client = getRedisClient();
  const value = await client.get(key);
  return value ? parseFloat(value) : null;
}

export async function setCachedAggregation(
  tenantId: string,
  eventType: string,
  granularity: "hour" | "day" | "month",
  start: string,
  end: string,
  value: number,
  ttl: number = 900 // 15 minutes default
): Promise<void> {
  const key = getAggregationKey(tenantId, eventType, granularity, start, end);
  const client = getRedisClient();
  await client.setex(key, ttl, value.toString());
}

export async function getTopHotTenants(limit: number = 10): Promise<string[]> {
  const client = getRedisClient();
  const tenantIds = await client.zrevrange(getHotTenantsSortedSetKey(), 0, limit - 1);
  return tenantIds;
}

