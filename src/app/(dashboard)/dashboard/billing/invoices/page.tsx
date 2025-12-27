"use client";

import { useOrganization } from "@clerk/nextjs";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/react";

const statusColors: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  paid: "default",
  open: "secondary",
  void: "outline",
  uncollectible: "destructive",
  draft: "outline",
};

export default function InvoicesPage() {
  const { organization } = useOrganization();

  // Fetch invoices from Stripe via tRPC
  const { data: invoicesData, isLoading } =
    trpc.subscription.getStripeInvoices.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Please select an organization to view invoices.
          </p>
        </div>
      </div>
    );
  }

  const invoices = invoicesData?.invoices ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground">
          View and download your billing history
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>All invoices from your subscription</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No invoices yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your invoices will appear here once you have an active
                subscription.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.number || invoice.id.slice(0, 12)}
                    </TableCell>
                    <TableCell>
                      {new Date(invoice.created).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>${(invoice.amount / 100).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          statusColors[invoice.status ?? "draft"] || "default"
                        }
                      >
                        {invoice.status ?? "draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {invoice.hostedInvoiceUrl && (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={invoice.hostedInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View invoice"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {invoice.pdfUrl && (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={invoice.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
