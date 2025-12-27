import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { validateApiKey, hasPermission } from "@/server/services/apiKeys";

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
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const groupBy = searchParams.get("group_by") || "event_type"; // event_type, tenant, day

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
        return NextResponse.json({
          usage: [],
          period: {
            start: startDate || null,
            end: endDate || null,
          },
        });
      }
    }

    // Default to current month if no dates provided
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const periodStart = startDate ? new Date(startDate) : defaultStart;
    const periodEnd = endDate ? new Date(endDate) : defaultEnd;

    where.timestamp = {
      gte: periodStart,
      lte: periodEnd,
    };

    if (groupBy === "event_type") {
      const usage = await prisma.usageEvent.groupBy({
        by: ["eventType"],
        where,
        _sum: { quantity: true },
        _count: true,
      });

      return NextResponse.json({
        usage: usage.map((u: typeof usage[number]) => ({
          event_type: u.eventType,
          total_quantity: Number(u._sum.quantity || 0),
          event_count: u._count,
        })),
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
      });
    } else if (groupBy === "tenant") {
      const usage = await prisma.usageEvent.groupBy({
        by: ["tenantId"],
        where,
        _sum: { quantity: true },
        _count: true,
      });

      // Get tenant external IDs
      const tenantIds = usage.map((u: typeof usage[number]) => u.tenantId);
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, externalId: true },
      });
      const tenantMap = new Map(tenants.map((t: { id: string; externalId: string }) => [t.id, t.externalId]));

      return NextResponse.json({
        usage: usage.map((u: typeof usage[number]) => ({
          tenant_id: tenantMap.get(u.tenantId) || u.tenantId,
          total_quantity: Number(u._sum.quantity || 0),
          event_count: u._count,
        })),
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
      });
    } else if (groupBy === "day") {
      // For daily grouping, we need raw SQL or a different approach
      // Here we'll fetch events and aggregate in code
      const events = await prisma.usageEvent.findMany({
        where,
        select: {
          timestamp: true,
          quantity: true,
        },
      });

      type DailyUsage = Record<string, { total_quantity: number; event_count: number }>;
      const dailyUsage = events.reduce((acc: DailyUsage, event: typeof events[number]) => {
        const day = event.timestamp.toISOString().split("T")[0]!;
        if (!acc[day]) {
          acc[day] = { total_quantity: 0, event_count: 0 };
        }
        acc[day].total_quantity += Number(event.quantity);
        acc[day].event_count += 1;
        return acc;
      }, {} as DailyUsage);

      return NextResponse.json({
        usage: (Object.entries(dailyUsage) as [string, { total_quantity: number; event_count: number }][])
          .map(([date, data]) => ({
            date,
            ...data,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
      });
    }

    return NextResponse.json(
      { error: "Invalid group_by parameter. Use: event_type, tenant, or day" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
