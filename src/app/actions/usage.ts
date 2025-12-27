"use server";

import { createServerTRPCClient } from "@/lib/trpc/client";
import { revalidatePath } from "next/cache";

export async function recordUsageEvent(
  tenantId: string,
  data: {
    eventType: string;
    quantity?: number;
    metadata?: Record<string, any>;
    timestamp?: Date;
  }
) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.usage.recordEvent.mutate({
      eventType: data.eventType,
      quantity: data.quantity ?? 1,
      metadata: data.metadata,
      timestamp: data.timestamp,
    });

    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch (error) {
    console.error("Error recording usage event:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getTenantUsage(
  tenantId: string,
  options: {
    eventType?: string;
    start: Date;
    end: Date;
    granularity?: "hour" | "day" | "month";
  }
) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.usage.getUsage.query({
      eventType: options.eventType,
      start: options.start,
      end: options.end,
      granularity: options.granularity ?? "day",
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error getting tenant usage:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getTenantUsageByType(
  tenantId: string,
  options: {
    start: Date;
    end: Date;
  }
) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.usage.getUsageByType.query({
      start: options.start,
      end: options.end,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error getting usage by type:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkTenantQuota(
  tenantId: string,
  eventType: string,
  quantity: number = 1
) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.usage.checkQuota.query({
      eventType,
      quantity,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error checking quota:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

