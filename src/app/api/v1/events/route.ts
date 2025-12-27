import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { validateApiKey, hasPermission } from "@/server/services/apiKeys";
import { checkQuota, buildQuotaErrorResponse } from "@/server/services/quota";
import {
  checkRateLimit,
  checkIdempotencyKey,
  setIdempotencyKey,
  withRedisFallback,
  incrementRollingCounter,
} from "@/server/db/redis";

const eventSchema = z.object({
  event_type: z.string().min(1).max(100),
  tenant_id: z.string().min(1).max(100),
  quantity: z.number().positive().default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
  idempotency_key: z.string().max(255).optional(),
});

const batchEventSchema = z.object({
  events: z.array(eventSchema).min(1).max(1000),
});

type ParsedEvent = z.infer<typeof eventSchema>;

interface ProcessedEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  idempotency_key?: string;
  deduplicated?: boolean;
}

interface QuotaViolation {
  tenant_id: string;
  event_type: string;
  error: ReturnType<typeof buildQuotaErrorResponse>;
}

/**
 * Find or create tenants in batch to avoid N+1 queries
 */
async function findOrCreateTenants(
  organizationId: string,
  tenantExternalIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(tenantExternalIds)];

  // Batch lookup existing tenants
  const existingTenants = await prisma.tenant.findMany({
    where: {
      organizationId,
      externalId: { in: uniqueIds },
    },
    select: { id: true, externalId: true },
  });

  const tenantMap = new Map<string, string>();
  existingTenants.forEach((t: { id: string; externalId: string }) => tenantMap.set(t.externalId, t.id));

  // Find missing tenants
  const missingIds = uniqueIds.filter((id) => !tenantMap.has(id));

  // Create missing tenants in batch
  if (missingIds.length > 0) {
    const created = await prisma.$transaction(
      missingIds.map((externalId) =>
        prisma.tenant.upsert({
          where: {
            organizationId_externalId: {
              organizationId,
              externalId,
            },
          },
          create: {
            organizationId,
            externalId,
            name: externalId,
          },
          update: {},
          select: { id: true, externalId: true },
        })
      )
    );

    created.forEach((t: { id: string; externalId: string }) => tenantMap.set(t.externalId, t.id));
  }

  return tenantMap;
}

/**
 * Check idempotency for events
 * Returns map of idempotency_key -> existing event_id
 */
async function checkIdempotency(
  organizationId: string,
  events: ParsedEvent[]
): Promise<Map<string, string>> {
  const duplicates = new Map<string, string>();

  const eventsWithKeys = events.filter((e) => e.idempotency_key);
  if (eventsWithKeys.length === 0) return duplicates;

  // Check Redis cache first
  await Promise.all(
    eventsWithKeys.map(async (event) => {
      const existingId = await withRedisFallback(
        () => checkIdempotencyKey(organizationId, event.idempotency_key!),
        async () => null
      );
      if (existingId) {
        duplicates.set(event.idempotency_key!, existingId);
      }
    })
  );

  // For keys not in Redis, check database
  const uncachedKeys = eventsWithKeys
    .filter((e) => !duplicates.has(e.idempotency_key!))
    .map((e) => e.idempotency_key!);

  if (uncachedKeys.length > 0) {
    const existingEvents = await prisma.usageEvent.findMany({
      where: {
        organizationId,
        idempotencyKey: { in: uncachedKeys },
      },
      select: { id: true, idempotencyKey: true },
    });

    existingEvents.forEach((e: { id: string; idempotencyKey: string | null }) => {
      if (e.idempotencyKey) {
        duplicates.set(e.idempotencyKey, e.id);
        // Cache in Redis for future lookups
        setIdempotencyKey(organizationId, e.idempotencyKey, e.id).catch(() => {});
      }
    });
  }

  return duplicates;
}

/**
 * Check quotas for all events grouped by tenant/eventType
 */
async function checkQuotas(
  events: Array<ParsedEvent & { internalTenantId: string }>
): Promise<QuotaViolation[]> {
  const violations: QuotaViolation[] = [];

  // Group events by tenant + eventType to aggregate quantities
  const grouped = new Map<string, { tenantId: string; eventType: string; quantity: number; externalTenantId: string }>();

  for (const event of events) {
    const key = `${event.internalTenantId}:${event.event_type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += event.quantity;
    } else {
      grouped.set(key, {
        tenantId: event.internalTenantId,
        eventType: event.event_type,
        quantity: event.quantity,
        externalTenantId: event.tenant_id,
      });
    }
  }

  // Check quotas in parallel
  await Promise.all(
    Array.from(grouped.values()).map(async ({ tenantId, eventType, quantity, externalTenantId }) => {
      const result = await checkQuota({ tenantId, eventType, quantity });
      if (!result.allowed) {
        violations.push({
          tenant_id: externalTenantId,
          event_type: eventType,
          error: buildQuotaErrorResponse(result),
        });
      }
    })
  );

  return violations;
}

/**
 * Process a single event
 */
async function processSingleEvent(
  event: ParsedEvent,
  organizationId: string,
  tenantMap: Map<string, string>,
  duplicates: Map<string, string>
): Promise<ProcessedEvent> {
  // Check for duplicate
  if (event.idempotency_key && duplicates.has(event.idempotency_key)) {
    return {
      id: duplicates.get(event.idempotency_key)!,
      tenant_id: event.tenant_id,
      event_type: event.event_type,
      idempotency_key: event.idempotency_key,
      deduplicated: true,
    };
  }

  const tenantId = tenantMap.get(event.tenant_id)!;

  const usageEvent = await prisma.usageEvent.create({
    data: {
      tenantId,
      organizationId,
      eventType: event.event_type,
      quantity: event.quantity,
      metadata: (event.metadata ?? {}) as Record<string, string | number | boolean>,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      idempotencyKey: event.idempotency_key,
    },
  });

  // Cache idempotency key if provided
  if (event.idempotency_key) {
    setIdempotencyKey(organizationId, event.idempotency_key, usageEvent.id).catch(() => {});
  }

  // Update rolling counters (fire and forget)
  const now = event.timestamp ? new Date(event.timestamp) : new Date();
  const hourBucket = now.toISOString().slice(0, 13);
  const dayBucket = now.toISOString().slice(0, 10);

  withRedisFallback(
    async () => {
      await Promise.all([
        incrementRollingCounter(tenantId, event.event_type, event.quantity, "1h", hourBucket),
        incrementRollingCounter(tenantId, event.event_type, event.quantity, "24h", dayBucket),
      ]);
      return null;
    },
    async () => null
  ).catch(() => {});

  return {
    id: usageEvent.id,
    tenant_id: event.tenant_id,
    event_type: event.event_type,
    idempotency_key: event.idempotency_key,
    deduplicated: false,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Validate API key
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7);
    const keyValidation = await validateApiKey(apiKey);

    if (!keyValidation.valid) {
      return NextResponse.json(
        { error: keyValidation.reason },
        { status: 401 }
      );
    }

    if (!hasPermission(keyValidation, "events:write")) {
      return NextResponse.json(
        { error: "Insufficient permissions. Required: events:write" },
        { status: 403 }
      );
    }

    const organizationId = keyValidation.organizationId;

    // Check rate limits
    const rateLimit = await prisma.rateLimit.findFirst({
      where: { organizationId },
    });

    if (rateLimit) {
      const rateLimitResult = await withRedisFallback(
        () =>
          checkRateLimit(organizationId, {
            perSecond: rateLimit.requestsPerSecond ?? undefined,
            perMinute: rateLimit.requestsPerMinute ?? undefined,
            perHour: rateLimit.requestsPerHour ?? undefined,
          }),
        async () => ({ allowed: true, remaining: Infinity, limit: Infinity, resetAt: new Date(), retryAfter: undefined as number | undefined })
      );

      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            code: "RATE_LIMIT_EXCEEDED",
            details: {
              limit: rateLimitResult.limit,
              remaining: rateLimitResult.remaining,
              resetAt: rateLimitResult.resetAt.toISOString(),
              retryAfter: rateLimitResult.retryAfter,
            },
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(rateLimitResult.retryAfter || 1),
              "X-RateLimit-Limit": String(rateLimitResult.limit),
              "X-RateLimit-Remaining": String(rateLimitResult.remaining),
              "X-RateLimit-Reset": rateLimitResult.resetAt.toISOString(),
            },
          }
        );
      }
    }

    // Parse request body
    const body = await req.json();

    // Determine if batch or single event
    const isBatch = body.events && Array.isArray(body.events);
    let events: ParsedEvent[];

    if (isBatch) {
      const parsed = batchEventSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request body", details: parsed.error.errors },
          { status: 400 }
        );
      }
      events = parsed.data.events;
    } else {
      const parsed = eventSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request body", details: parsed.error.errors },
          { status: 400 }
        );
      }
      events = [parsed.data];
    }

    // Step 1: Find or create all tenants in batch (fixes N+1)
    const tenantExternalIds = events.map((e) => e.tenant_id);
    const tenantMap = await findOrCreateTenants(organizationId, tenantExternalIds);

    // Step 2: Check idempotency for all events
    const duplicates = await checkIdempotency(organizationId, events);

    // Step 3: Prepare events with internal tenant IDs (exclude duplicates from quota check)
    const newEvents = events
      .filter((e) => !e.idempotency_key || !duplicates.has(e.idempotency_key))
      .map((e) => ({
        ...e,
        internalTenantId: tenantMap.get(e.tenant_id)!,
      }));

    // Step 4: Check quotas for new events
    const quotaViolations = await checkQuotas(newEvents);

    if (quotaViolations.length > 0) {
      return NextResponse.json(
        {
          error: "Quota exceeded for one or more events",
          code: "QUOTA_EXCEEDED",
          violations: quotaViolations,
        },
        { status: 403 }
      );
    }

    // Step 5: Process all events
    const processedEvents = await Promise.all(
      events.map((event) =>
        processSingleEvent(event, organizationId, tenantMap, duplicates)
      )
    );

    // Build response
    const newCount = processedEvents.filter((e) => !e.deduplicated).length;
    const duplicateCount = processedEvents.filter((e) => e.deduplicated).length;

    if (isBatch) {
      return NextResponse.json({
        success: true,
        count: processedEvents.length,
        new_events: newCount,
        deduplicated: duplicateCount,
        event_ids: processedEvents.map((e) => e.id),
        events: processedEvents,
      });
    } else {
      const result = processedEvents[0];
      return NextResponse.json({
        success: true,
        event_id: result.id,
        deduplicated: result.deduplicated || false,
      });
    }
  } catch (error) {
    console.error("Error processing event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Validate API key
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7);
    const keyValidation = await validateApiKey(apiKey);

    if (!keyValidation.valid) {
      return NextResponse.json(
        { error: keyValidation.reason },
        { status: 401 }
      );
    }

    if (!hasPermission(keyValidation, "usage:read")) {
      return NextResponse.json(
        { error: "Insufficient permissions. Required: usage:read" },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenant_id");
    const eventType = searchParams.get("event_type");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);

    // Build where clause
    const where: Record<string, unknown> = {
      organizationId: keyValidation.organizationId,
    };

    if (tenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          organizationId: keyValidation.organizationId,
          externalId: tenantId,
        },
      });
      if (tenant) {
        where.tenantId = tenant.id;
      } else {
        return NextResponse.json({ events: [], total: 0 });
      }
    }

    if (eventType) {
      where.eventType = eventType;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        (where.timestamp as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.timestamp as Record<string, Date>).lte = new Date(endDate);
      }
    }

    const [events, total] = await Promise.all([
      prisma.usageEvent.findMany({
        where,
        include: { tenant: { select: { externalId: true } } },
        orderBy: { timestamp: "desc" },
        take: limit,
      }),
      prisma.usageEvent.count({ where }),
    ]);

    return NextResponse.json({
      events: events.map((e: typeof events[number]) => ({
        id: e.id,
        tenant_id: e.tenant.externalId,
        event_type: e.eventType,
        quantity: Number(e.quantity),
        metadata: e.metadata,
        timestamp: e.timestamp.toISOString(),
        idempotency_key: e.idempotencyKey,
      })),
      total,
      limit,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
