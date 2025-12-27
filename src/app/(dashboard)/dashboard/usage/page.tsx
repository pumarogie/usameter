"use client";

import { useOrganization } from "@clerk/nextjs";
import { Activity, TrendingUp, Clock, Zap, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc/react";

export default function UsagePage() {
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
  const overageEvents = usageData?.usage?.overage ?? 0;

  // Calculate events per day average
  const periodStart = usageData?.currentPeriod?.start
    ? new Date(usageData.currentPeriod.start)
    : new Date();
  const now = new Date();
  const daysInPeriod = Math.max(
    1,
    Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const avgEventsPerDay = Math.round(totalEvents / daysInPeriod);
  const avgEventsPerHour = Math.round(totalEvents / (daysInPeriod * 24));

  const stats = [
    {
      title: "Total Events",
      value: totalEvents.toLocaleString(),
      change: `${percentUsed.toFixed(1)}% of quota`,
      trend: percentUsed < 80 ? "up" : "down",
      icon: Activity,
    },
    {
      title: "Events Today",
      value: avgEventsPerDay.toLocaleString(),
      change: "Daily average",
      trend: "up",
      icon: Zap,
    },
    {
      title: "Avg. Events/Hour",
      value: avgEventsPerHour.toLocaleString(),
      change: "Hourly average",
      trend: "up",
      icon: Clock,
    },
    {
      title: "Overage Events",
      value: overageEvents.toLocaleString(),
      change: overageEvents > 0 ? "Over quota" : "Within quota",
      trend: overageEvents > 0 ? "down" : "up",
      icon: TrendingUp,
    },
  ];

  // Get usage by event type
  const eventTypes =
    usageData?.byEventType?.map(
      (event: { eventType: string; count: number; quantity: number }) => {
        const percentage =
          totalEvents > 0 ? (event.quantity / totalEvents) * 100 : 0;
        return {
          name: event.eventType,
          count: event.quantity,
          events: event.count,
          percentage,
        };
      },
    ) ?? [];

  // Sort by count descending
  eventTypes.sort(
    (
      a: { name: string; count: number; events: number; percentage: number },
      b: { name: string; count: number; events: number; percentage: number },
    ) => b.count - a.count,
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
          <h1 className="text-3xl font-bold tracking-tight">Usage Overview</h1>
          <p className="text-muted-foreground">
            Please select an organization to view usage data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usage Overview</h1>
        <p className="text-muted-foreground">
          Monitor your usage metrics and trends
          {usageData?.currentPeriod && (
            <span className="block text-xs mt-1">
              Billing period:{" "}
              {new Date(usageData.currentPeriod.start).toLocaleDateString()} -{" "}
              {new Date(usageData.currentPeriod.end).toLocaleDateString()}
            </span>
          )}
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
              <p className="text-xs text-muted-foreground">
                <span
                  className={
                    stat.trend === "up" ? "text-green-500" : "text-red-500"
                  }
                >
                  {stat.change}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="by-type">By Event Type</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage Progress</CardTitle>
              <CardDescription>
                Your usage towards quota this billing period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Events Used</span>
                    <span className="font-medium">
                      {totalEvents.toLocaleString()} /{" "}
                      {includedEvents.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-4 w-full rounded-full bg-muted">
                    <div
                      className={`h-4 rounded-full transition-all ${
                        percentUsed > 100
                          ? "bg-red-500"
                          : percentUsed > 90
                            ? "bg-yellow-500"
                            : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(percentUsed, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{percentUsed.toFixed(1)}% used</span>
                    <span>
                      {Math.max(
                        0,
                        includedEvents - totalEvents,
                      ).toLocaleString()}{" "}
                      remaining
                    </span>
                  </div>
                </div>

                {overageEvents > 0 && (
                  <div className="rounded-md bg-red-50 dark:bg-red-950 p-4">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      You have exceeded your included events by{" "}
                      <strong>{overageEvents.toLocaleString()}</strong> events.
                      Overage charges will apply.
                    </p>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="text-lg font-medium">
                      {subscriptionData?.plan?.name ?? "No plan"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Included Events
                    </p>
                    <p className="text-lg font-medium">
                      {includedEvents.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Days Left</p>
                    <p className="text-lg font-medium">
                      {usageData?.currentPeriod?.end
                        ? Math.max(
                            0,
                            Math.ceil(
                              (new Date(usageData.currentPeriod.end).getTime() -
                                now.getTime()) /
                                (1000 * 60 * 60 * 24),
                            ),
                          )
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-type" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage by Event Type</CardTitle>
              <CardDescription>
                Breakdown of events by type this billing period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">
                    No events recorded
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Start sending events to see them broken down by type.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {eventTypes.map(
                    (event: {
                      name: string;
                      count: number;
                      events: number;
                      percentage: number;
                    }) => (
                      <div key={event.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-muted px-2 py-1 text-sm">
                              {event.name}
                            </code>
                            <Badge variant="secondary">
                              {event.count.toLocaleString()} qty
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ({event.events} events)
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {event.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${event.percentage}%` }}
                          />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
