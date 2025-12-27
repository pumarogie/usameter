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
import { trpc } from "@/lib/trpc/react";

function BillingContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const { organization } = useOrganization();

  useEffect(() => {
    if (success) {
      // Could show a toast or notification here
      console.log("Subscription successful!");
    }
  }, [success]);

  // Fetch subscription data
  const { data: subscriptionData, isLoading: subscriptionLoading } =
    trpc.subscription.getCurrentSubscription.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  // Fetch usage data for current period
  const { data: usageData, isLoading: usageLoading } =
    trpc.subscription.getUsageForPeriod.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  // Create portal session mutation
  const createPortalSession = trpc.subscription.createPortalSession.useMutation(
    {
      onSuccess: (data) => {
        if (data.sessionUrl) {
          window.location.href = data.sessionUrl;
        }
      },
    },
  );

  const isLoading = subscriptionLoading || usageLoading;

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
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">
            Please select an organization to view billing information.
          </p>
        </div>
      </div>
    );
  }

  // Extract data from tRPC responses
  const subscription = {
    plan: subscriptionData?.plan?.name ?? "No plan",
    status: subscriptionData?.status ?? "inactive",
    currentPeriodEnd: subscriptionData?.currentPeriodEnd
      ? new Date(subscriptionData.currentPeriodEnd)
      : null,
    basePrice: subscriptionData?.plan?.basePrice
      ? subscriptionData.plan.basePrice / 100
      : 0,
    includedEvents: subscriptionData?.plan?.includedEvents ?? 0,
    cancelAtPeriodEnd: subscriptionData?.cancelAtPeriodEnd ?? false,
  };

  const usage = {
    total: usageData?.usage?.total ?? 0,
    included: usageData?.usage?.included ?? 0,
    percentUsed: usageData?.usage?.percentUsed ?? 0,
    overage: usageData?.usage?.overage ?? 0,
    estimatedCost: usageData?.cost?.estimated
      ? usageData.cost.estimated / 100
      : 0,
    baseCost: usageData?.cost?.base ? usageData.cost.base / 100 : 0,
    overageCost: usageData?.cost?.overage ? usageData.cost.overage / 100 : 0,
  };

  const handleManageSubscription = () => {
    if (!organization?.id) return;
    createPortalSession.mutate({ organizationId: organization.id });
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

      {subscription.cancelAtPeriodEnd && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <CardContent className="flex items-center gap-3 py-4">
            <Calendar className="h-5 w-5 text-yellow-600" />
            <p className="text-yellow-800 dark:text-yellow-200">
              Your subscription will be canceled at the end of the current
              billing period.
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
              <Badge
                variant={
                  subscription.status === "ACTIVE" ? "default" : "secondary"
                }
                className="capitalize"
              >
                {subscription.status.toLowerCase()}
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
                className={`h-2 rounded-full ${
                  usage.percentUsed > 100
                    ? "bg-red-500"
                    : usage.percentUsed > 90
                      ? "bg-yellow-500"
                      : "bg-primary"
                }`}
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
              {subscription.currentPeriodEnd
                ? subscription.currentPeriodEnd.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Estimated: ${usage.estimatedCost.toFixed(0)}
              {usage.overageCost > 0 && (
                <span className="text-red-500">
                  {" "}
                  (+${usage.overageCost.toFixed(0)} overage)
                </span>
              )}
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
              <Badge
                variant={
                  subscription.status === "ACTIVE" ? "default" : "secondary"
                }
                className="capitalize"
              >
                {subscription.status.toLowerCase()}
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
                {subscription.includedEvents.toLocaleString()}
              </span>
            </div>
            {subscriptionData && (
              <div className="pt-4">
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={createPortalSession.isPending}
                >
                  {createPortalSession.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Manage Subscription"
                  )}
                </Button>
              </div>
            )}
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
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/dashboard/usage">
                <TrendingUp className="mr-2 h-4 w-4" />
                View Usage Details
              </Link>
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
