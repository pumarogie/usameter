"use client";

import { useOrganization } from "@clerk/nextjs";
import {
  Activity,
  CreditCard,
  DollarSign,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/react";

export default function DashboardPage() {
  const { organization } = useOrganization();

  // Fetch subscription and usage data
  const { data: subscriptionData, isLoading: subscriptionLoading } =
    trpc.subscription.getCurrentSubscription.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  const { data: usageData, isLoading: usageLoading } =
    trpc.subscription.getUsageForPeriod.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  const isLoading = subscriptionLoading || usageLoading;

  // Calculate stats from real data
  const totalEvents = usageData?.usage?.total ?? 0;
  const includedEvents = usageData?.usage?.included ?? 0;
  const percentUsed = usageData?.usage?.percentUsed ?? 0;
  const estimatedCost = usageData?.cost?.estimated ?? 0;
  const baseCost = usageData?.cost?.base ?? 0;
  const overageCost = usageData?.cost?.overage ?? 0;

  const stats = [
    {
      title: "Total Events",
      value: totalEvents.toLocaleString(),
      change: `${percentUsed.toFixed(1)}% used`,
      trend: percentUsed < 80 ? "up" : "down",
      icon: Activity,
      description: "This billing period",
    },
    {
      title: "Included Events",
      value: includedEvents.toLocaleString(),
      change: subscriptionData?.plan?.name ?? "No plan",
      trend: "up",
      icon: Users,
      description: "In your plan",
    },
    {
      title: "Estimated Cost",
      value: `$${(estimatedCost / 100).toFixed(0)}`,
      change:
        overageCost > 0
          ? `+$${(overageCost / 100).toFixed(0)} overage`
          : "On track",
      trend: overageCost > 0 ? "down" : "up",
      icon: DollarSign,
      description: "This month",
    },
    {
      title: "Base Price",
      value: `$${(baseCost / 100).toFixed(0)}`,
      change: subscriptionData?.status ?? "inactive",
      trend: "up",
      icon: CreditCard,
      description: "Monthly",
    },
  ];

  // Get usage by event type for recent activity
  const recentActivity =
    usageData?.byEventType?.map(
      (event: { eventType: string; count: number; quantity: number }) => ({
        event: event.eventType,
        customer: "All tenants",
        count: event.quantity,
        time: `${event.count} events`,
      }),
    ) ?? [];

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
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Please select an organization to view your dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s an overview of your usage metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {stat.trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3 text-green-500" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={
                    stat.trend === "up" ? "text-green-500" : "text-red-500"
                  }
                >
                  {stat.change}
                </span>
                <span>{stat.description}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Usage Overview</CardTitle>
            <CardDescription>
              Your usage metrics for the current billing period
              {usageData?.currentPeriod && (
                <span className="block text-xs mt-1">
                  {new Date(usageData.currentPeriod.start).toLocaleDateString()}{" "}
                  - {new Date(usageData.currentPeriod.end).toLocaleDateString()}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Usage Progress
                </span>
                <span className="text-sm font-medium">
                  {percentUsed.toFixed(1)}%
                </span>
              </div>
              <div className="h-4 w-full rounded-full bg-muted">
                <div
                  className={`h-4 rounded-full transition-all ${
                    percentUsed > 90
                      ? "bg-red-500"
                      : percentUsed > 70
                        ? "bg-yellow-500"
                        : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{totalEvents.toLocaleString()} used</span>
                <span>{includedEvents.toLocaleString()} included</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Usage by Event Type</CardTitle>
            <CardDescription>
              Breakdown of events this billing period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <div className="text-center py-4">
                  <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No usage events recorded yet
                  </p>
                </div>
              ) : (
                recentActivity.map(
                  (
                    activity: {
                      event: string;
                      customer: string;
                      count: number;
                      time: string;
                    },
                    index: number,
                  ) => (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {activity.event}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.time}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary">
                          {activity.count.toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
