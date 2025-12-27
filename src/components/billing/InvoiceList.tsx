"use client";

import { trpc } from "@/lib/trpc/react";
import Link from "next/link";

interface InvoiceListProps {
  tenantId: string;
}

export function InvoiceList({ tenantId }: InvoiceListProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.billing.listInvoices.useInfiniteQuery(
      {
        limit: 20,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const invoices = data?.pages.flatMap((page) => page.invoices) ?? [];

  if (isLoading) {
    return <div className="text-gray-500">Loading invoices...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Invoices</h2>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center text-gray-500">
          No invoices found
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/billing/invoice/${invoice.id}`}
                className="block bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-lg">
                      {invoice.invoiceNumber}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {new Date(invoice.periodStart).toLocaleDateString()} -{" "}
                      {new Date(invoice.periodEnd).toLocaleDateString()}
                    </div>
                    <div className="text-sm text-gray-500">
                      Due: {new Date(invoice.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      ${Number(invoice.total).toFixed(2)}
                    </div>
                    <div
                      className={`mt-2 px-3 py-1 rounded-full text-sm font-medium ${
                        invoice.status === "PAID"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : invoice.status === "PENDING"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          : invoice.status === "OVERDUE"
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {invoice.status}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {hasNextPage && (
            <div className="text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isFetchingNextPage ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

