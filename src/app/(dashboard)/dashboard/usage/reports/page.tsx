"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import {
  FileText,
  Download,
  Calendar,
  Loader2,
  Activity,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/react";

export default function ReportsPage() {
  const { organization, isLoaded } = useOrganization();
  const [selectedPeriod, setSelectedPeriod] = useState<"current" | "previous">(
    "current",
  );

  // Fetch usage data
  const { data: usageData, isLoading: usageLoading } =
    trpc.subscription.getUsageForPeriod.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  // Fetch subscription data for plan info
  const { data: subscriptionData, isLoading: subscriptionLoading } =
    trpc.subscription.getCurrentSubscription.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  const isLoading = !isLoaded || usageLoading || subscriptionLoading;

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
          <h1 className="text-3xl font-bold tracking-tight">Usage Reports</h1>
          <p className="text-muted-foreground">
            Please select an organization to view reports.
          </p>
        </div>
      </div>
    );
  }

  const totalEvents = usageData?.usage?.total ?? 0;
  const includedEvents = usageData?.usage?.included ?? 0;
  const overageEvents = usageData?.usage?.overage ?? 0;
  const percentUsed = usageData?.usage?.percentUsed ?? 0;

  const eventTypes =
    usageData?.byEventType?.map(
      (event: { eventType: string; count: number; quantity: number }) => ({
        name: event.eventType,
        events: event.count,
        quantity: event.quantity,
      }),
    ) ?? [];

  const handleExportCSV = () => {
    if (eventTypes.length === 0) return;

    const headers = ["Event Type", "Event Count", "Total Quantity"];
    const rows = eventTypes.map(
      (e: { name: string; events: number; quantity: number }) => [
        e.name,
        e.events,
        e.quantity,
      ],
    );

    const csvContent = [
      headers.join(","),
      ...rows.map((row: (string | number)[]) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-report-${organization.slug || organization.id}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Reports</h1>
          <p className="text-muted-foreground">
            Generate and download usage reports for your organization
          </p>
        </div>
        <Button onClick={handleExportCSV} disabled={eventTypes.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalEvents.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              This billing period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Quota Utilization
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{percentUsed.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {includedEvents.toLocaleString()} included in plan
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Overage Events
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overageEvents.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {overageEvents > 0 ? "Additional charges apply" : "Within quota"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Period Report
              </CardTitle>
              <CardDescription>
                Detailed breakdown of usage for the selected period
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="period" className="text-sm">
                Period:
              </Label>
              <select
                id="period"
                value={selectedPeriod}
                onChange={(e) =>
                  setSelectedPeriod(e.target.value as "current" | "previous")
                }
                className="rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="current">Current Period</option>
                <option value="previous" disabled>
                  Previous Period
                </option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {usageData?.currentPeriod && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {new Date(usageData.currentPeriod.start).toLocaleDateString()} -{" "}
                {new Date(usageData.currentPeriod.end).toLocaleDateString()}
              </span>
              <Badge variant="outline" className="ml-2">
                {subscriptionData?.plan?.name ?? "No Plan"}
              </Badge>
            </div>
          )}

          {eventTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No data available</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Start sending usage events to generate reports.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead className="text-right">Event Count</TableHead>
                    <TableHead className="text-right">Total Quantity</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventTypes.map(
                    (event: {
                      name: string;
                      events: number;
                      quantity: number;
                    }) => {
                      const percentage =
                        totalEvents > 0
                          ? ((event.quantity / totalEvents) * 100).toFixed(1)
                          : "0";
                      return (
                        <TableRow key={event.name}>
                          <TableCell>
                            <code className="rounded bg-muted px-2 py-1 text-sm">
                              {event.name}
                            </code>
                          </TableCell>
                          <TableCell className="text-right">
                            {event.events.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {event.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{percentage}%</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    },
                  )}
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium">
                      {eventTypes
                        .reduce(
                          (
                            sum: number,
                            e: {
                              name: string;
                              events: number;
                              quantity: number;
                            },
                          ) => sum + e.events,
                          0,
                        )
                        .toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {totalEvents.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge>100%</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report History</CardTitle>
          <CardDescription>
            Previously generated reports (coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Automated monthly reports will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

