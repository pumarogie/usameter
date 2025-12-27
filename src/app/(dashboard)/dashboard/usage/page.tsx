"use client";

import { Activity, TrendingUp, Clock, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock data - in production, fetch from tRPC
const stats = [
  {
    title: "Total Events",
    value: "456,789",
    change: "+12.5%",
    trend: "up",
    icon: Activity,
  },
  {
    title: "Events Today",
    value: "15,234",
    change: "+8.2%",
    trend: "up",
    icon: Zap,
  },
  {
    title: "Avg. Events/Hour",
    value: "634",
    change: "-2.1%",
    trend: "down",
    icon: Clock,
  },
  {
    title: "Peak Events/Min",
    value: "142",
    change: "+15.3%",
    trend: "up",
    icon: TrendingUp,
  },
];

const eventTypes = [
  { name: "api_request", count: 234567, percentage: 51.3 },
  { name: "storage_upload", count: 89234, percentage: 19.5 },
  { name: "compute_hours", count: 67890, percentage: 14.9 },
  { name: "bandwidth_gb", count: 45678, percentage: 10.0 },
  { name: "webhook_calls", count: 19420, percentage: 4.3 },
];

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usage Overview</h1>
        <p className="text-muted-foreground">
          Monitor your usage metrics and trends
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
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
                </span>{" "}
                from last period
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="by-type">By Event Type</TabsTrigger>
          <TabsTrigger value="by-customer">By Customer</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage Trend</CardTitle>
              <CardDescription>
                Your usage over the last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center rounded-md border border-dashed">
                <div className="text-center">
                  <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Usage chart will be displayed here
                  </p>
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
              <div className="space-y-4">
                {eventTypes.map((event) => (
                  <div key={event.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-2 py-1 text-sm">
                          {event.name}
                        </code>
                        <Badge variant="secondary">
                          {event.count.toLocaleString()}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {event.percentage}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${event.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-customer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage by Customer</CardTitle>
              <CardDescription>
                Top customers by event volume
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center rounded-md border border-dashed">
                <div className="text-center">
                  <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Customer usage breakdown will be displayed here
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
