"use client";

import { Activity, CreditCard, DollarSign, Users, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stats = [
  {
    title: "Total Events",
    value: "1,234,567",
    change: "+12.5%",
    trend: "up",
    icon: Activity,
    description: "This billing period",
  },
  {
    title: "Active Customers",
    value: "2,345",
    change: "+8.2%",
    trend: "up",
    icon: Users,
    description: "vs last month",
  },
  {
    title: "Revenue",
    value: "$45,231",
    change: "+20.1%",
    trend: "up",
    icon: DollarSign,
    description: "This month",
  },
  {
    title: "Usage Cost",
    value: "$12,234",
    change: "-4.3%",
    trend: "down",
    icon: CreditCard,
    description: "vs last month",
  },
];

const recentActivity = [
  { event: "API request", customer: "Acme Corp", count: 15234, time: "2 min ago" },
  { event: "Storage upload", customer: "TechStart", count: 892, time: "5 min ago" },
  { event: "Compute hours", customer: "DataFlow", count: 45, time: "12 min ago" },
  { event: "API request", customer: "CloudBase", count: 8721, time: "18 min ago" },
  { event: "Bandwidth", customer: "StreamCo", count: 2341, time: "25 min ago" },
];

export default function DashboardPage() {
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
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
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
                <span className={stat.trend === "up" ? "text-green-500" : "text-red-500"}>
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

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest usage events from your customers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{activity.customer}</p>
                    <p className="text-xs text-muted-foreground">{activity.event}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">{activity.count.toLocaleString()}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
