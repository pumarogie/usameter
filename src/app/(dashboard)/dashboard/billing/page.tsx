"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useOrganization } from "@clerk/nextjs";
import {
  CreditCard,
  TrendingUp,
  Calendar,
  ArrowRight,
  CheckCircle,
  Loader2,
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
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

function BillingContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  useEffect(() => {
    if (success) {
      // Could show a toast or notification here
      console.log("Subscription successful!");
    }
  }, [success]);

  // Mock data - in production, fetch from tRPC
  const subscription = {
    plan: "Growth",
    status: "active",
    currentPeriodEnd: new Date("2025-01-27"),
    basePrice: 99,
  };

  const usage = {
    total: 456789,
    included: 500000,
    percentUsed: 91.4,
    overage: 0,
    estimatedCost: 99,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription and billing information
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/billing/plans">
            View Plans
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {success && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-green-800 dark:text-green-200">
              Your subscription has been updated successfully!
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{subscription.plan}</span>
              <Badge variant="secondary" className="capitalize">
                {subscription.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ${subscription.basePrice}/month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Usage This Period
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.total.toLocaleString()}
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {usage.percentUsed.toFixed(1)}% of{" "}
              {usage.included.toLocaleString()} included
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Next Billing Date
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscription.currentPeriodEnd.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Estimated: ${usage.estimatedCost}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscription Details</CardTitle>
            <CardDescription>
              Your current plan and billing cycle
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">{subscription.plan}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="secondary" className="capitalize">
                {subscription.status}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Billing Period</span>
              <span className="font-medium">Monthly</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base Price</span>
              <span className="font-medium">${subscription.basePrice}/mo</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Included Events</span>
              <span className="font-medium">
                {usage.included.toLocaleString()}
              </span>
            </div>
            <div className="pt-4">
              <Button className="w-full" variant="outline">
                Manage Subscription
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common billing tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/dashboard/billing/plans">
                <CreditCard className="mr-2 h-4 w-4" />
                Change Plan
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/dashboard/billing/invoices">
                <Calendar className="mr-2 h-4 w-4" />
                View Invoices
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <TrendingUp className="mr-2 h-4 w-4" />
              Download Usage Report
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BillingLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingLoading />}>
      <BillingContent />
    </Suspense>
  );
}
