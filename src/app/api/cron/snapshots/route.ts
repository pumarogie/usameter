import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

/**
 * Automated Daily Snapshot Creation
 *
 * This endpoint creates usage snapshots for all tenants for the previous day.
 * It should be called daily via a cron job (e.g., Vercel Cron, AWS CloudWatch).
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Usage:
 *   POST /api/cron/snapshots
 *   Headers: { Authorization: Bearer <CRON_SECRET> }
 *
 * Optional query params:
 *   - date: ISO date string to create snapshots for (defaults to yesterday)
 *   - organizationId: Limit to a specific organization
 */

export const maxDuration = 300; // 5 minutes max for serverless

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron endpoint not configured" },
        { status: 500 },
      );
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const organizationIdParam = searchParams.get("organizationId");

    // Determine the snapshot date (default: yesterday)
    let snapshotDate: Date;
    if (dateParam) {
      snapshotDate = new Date(dateParam);
    } else {
      snapshotDate = new Date();
      snapshotDate.setDate(snapshotDate.getDate() - 1);
    }

    // Normalize to start of day (UTC)
    snapshotDate.setUTCHours(0, 0, 0, 0);

    const startOfDay = new Date(snapshotDate);
    const endOfDay = new Date(snapshotDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    console.log(`Creating snapshots for date: ${snapshotDate.toISOString()}`);

    // Get all active tenants (optionally filtered by organization)
    const tenantsWhere: Record<string, unknown> = {
      status: "ACTIVE",
    };

    if (organizationIdParam) {
      tenantsWhere.organizationId = organizationIdParam;
    }

    const tenants = await prisma.tenant.findMany({
      where: tenantsWhere,
      select: {
        id: true,
        organizationId: true,
        externalId: true,
      },
    });

    console.log(`Processing ${tenants.length} tenants`);

    const results: {
      tenantId: string;
      externalId: string;
      snapshotsCreated: number;
      eventTypes: string[];
    }[] = [];

    let totalSnapshots = 0;
    let tenantsProcessed = 0;
    let errors: { tenantId: string; error: string }[] = [];

    // Process tenants in batches to avoid overwhelming the database
    const BATCH_SIZE = 50;
    for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
      const batch = tenants.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(
          async (tenant: {
            id: string;
            organizationId: string;
            externalId: string;
          }) => {
            try {
              // Aggregate usage events for this tenant on the snapshot date
              const usageByType = await prisma.usageEvent.groupBy({
                by: ["eventType"],
                where: {
                  tenantId: tenant.id,
                  timestamp: {
                    gte: startOfDay,
                    lte: endOfDay,
                  },
                },
                _sum: {
                  quantity: true,
                },
              });

              if (usageByType.length === 0) {
                tenantsProcessed++;
                return; // No usage for this tenant on this day
              }

              // Upsert snapshots for each event type
              const snapshots = await Promise.all(
                usageByType.map(
                  async (item: {
                    eventType: string;
                    _sum: { quantity: bigint | null };
                  }) => {
                    const totalQuantity = Number(item._sum.quantity || 0);

                    return prisma.usageSnapshot.upsert({
                      where: {
                        tenantId_snapshotDate_eventType: {
                          tenantId: tenant.id,
                          snapshotDate: snapshotDate,
                          eventType: item.eventType,
                        },
                      },
                      update: {
                        totalQuantity,
                      },
                      create: {
                        tenantId: tenant.id,
                        organizationId: tenant.organizationId,
                        snapshotDate: snapshotDate,
                        eventType: item.eventType,
                        totalQuantity,
                      },
                    });
                  },
                ),
              );

              results.push({
                tenantId: tenant.id,
                externalId: tenant.externalId,
                snapshotsCreated: snapshots.length,
                eventTypes: usageByType.map(
                  (u: { eventType: string }) => u.eventType,
                ),
              });

              totalSnapshots += snapshots.length;
              tenantsProcessed++;
            } catch (error) {
              console.error(`Error processing tenant ${tenant.id}:`, error);
              errors.push({
                tenantId: tenant.id,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          },
        ),
      );

      console.log(
        `Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tenants.length / BATCH_SIZE)}`,
      );
    }

    // Create audit log for the cron job run
    await prisma.auditLog.create({
      data: {
        action: "CRON_SNAPSHOT_CREATED",
        resourceType: "snapshot",
        changes: {
          snapshotDate: snapshotDate.toISOString(),
          tenantsProcessed,
          totalSnapshots,
          errorsCount: errors.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      snapshotDate: snapshotDate.toISOString(),
      summary: {
        tenantsProcessed,
        totalSnapshots,
        tenantsWithUsage: results.length,
        errors: errors.length,
      },
      results: results.length <= 100 ? results : undefined, // Only include details for smaller runs
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error in snapshot cron job:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Support GET for health checks and Vercel Cron
export async function GET(req: NextRequest) {
  // For Vercel Cron, it sends a GET request
  // Check if this is a cron trigger by verifying the header
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // This is a valid cron trigger, process it
    return POST(req);
  }

  // Otherwise, return health check info
  return NextResponse.json({
    status: "healthy",
    endpoint: "/api/cron/snapshots",
    description: "Automated daily snapshot creation endpoint",
    usage: "POST with Authorization: Bearer <CRON_SECRET>",
  });
}
