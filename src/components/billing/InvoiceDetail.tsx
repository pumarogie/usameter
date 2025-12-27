"use client";

import { trpc } from "@/lib/trpc/react";

interface InvoiceDetailProps {
  tenantId: string;
  invoiceId: string;
}

export function InvoiceDetail({ tenantId, invoiceId }: InvoiceDetailProps) {
  const { data: invoice, isLoading } = trpc.billing.getInvoice.useQuery({
    invoiceId,
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading invoice...</div>;
  }

  if (!invoice) {
    return <div className="text-red-500">Invoice not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{invoice.invoiceNumber}</h2>
          <div className="text-gray-500 mt-1">
            Period: {new Date(invoice.periodStart).toLocaleDateString()} -{" "}
            {new Date(invoice.periodEnd).toLocaleDateString()}
          </div>
        </div>
        <div
          className={`px-4 py-2 rounded-full font-medium ${
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

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Line Items</h3>
        <div className="space-y-4">
          {invoice.lineItems.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center border-b pb-4"
            >
              <div>
                <div className="font-medium">{item.eventType}</div>
                <div className="text-sm text-gray-500">
                  {Number(item.quantity).toLocaleString()} units @ $
                  {Number(item.unitPrice).toFixed(6)} per unit
                </div>
              </div>
              <div className="text-lg font-bold">
                ${Number(item.totalPrice).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium">
              ${Number(invoice.subtotal).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax:</span>
            <span className="font-medium">
              ${Number(invoice.tax).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-xl font-bold border-t pt-2">
            <span>Total:</span>
            <span>${Number(invoice.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Due Date:</span>{" "}
            {new Date(invoice.dueDate).toLocaleDateString()}
          </div>
          {invoice.paidAt && (
            <div>
              <span className="font-medium">Paid At:</span>{" "}
              {new Date(invoice.paidAt).toLocaleDateString()}
            </div>
          )}
          <div>
            <span className="font-medium">Created:</span>{" "}
            {new Date(invoice.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
