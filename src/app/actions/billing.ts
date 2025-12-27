"use server";

import { createServerTRPCClient } from "@/lib/trpc/client";
import { revalidatePath } from "next/cache";

export async function generateInvoice(
  tenantId: string,
  data: {
    periodStart: Date;
    periodEnd: Date;
  }
) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.billing.generateInvoice.mutate({
      tenantId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });

    revalidatePath("/billing");
    revalidatePath(`/billing/invoice/${result.id}`);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error generating invoice:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getInvoice(tenantId: string, invoiceId: string) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.billing.getInvoice.query({
      invoiceId,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error getting invoice:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function listInvoices(
  tenantId: string,
  options: {
    status?: "DRAFT" | "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    cursor?: string;
  } = {}
) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.billing.listInvoices.query({
      status: options.status,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit ?? 20,
      cursor: options.cursor,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error listing invoices:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getBillingReport(
  tenantId: string,
  options: {
    startDate: Date;
    endDate: Date;
  }
) {
  const trpc = createServerTRPCClient({ tenantId });

  try {
    const result = await trpc.billing.getBillingReport.query({
      startDate: options.startDate,
      endDate: options.endDate,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Error getting billing report:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

