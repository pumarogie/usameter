"use client";

import { useOrganization } from "@clerk/nextjs";
import {
  CreditCard,
  Plus,
  Loader2,
  ExternalLink,
  Building2,
  AlertCircle,
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
import { trpc } from "@/lib/trpc/react";

export default function PaymentMethodsPage() {
  const { organization, isLoaded } = useOrganization();

  // Check subscription status
  const { data: subscriptionData, isLoading: subscriptionLoading } =
    trpc.subscription.getCurrentSubscription.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  // Create portal session to manage payment methods
  const createPortalSession = trpc.subscription.createPortalSession.useMutation(
    {
      onSuccess: (data) => {
        if (data.sessionUrl) {
          window.location.href = data.sessionUrl;
        }
      },
    },
  );

  const isLoading = !isLoaded || subscriptionLoading;

  const handleManagePaymentMethods = () => {
    if (!organization?.id) return;
    createPortalSession.mutate({ organizationId: organization.id });
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Payment Methods</h1>
          <p className="text-muted-foreground">
            Please select an organization to manage payment methods.
          </p>
        </div>
      </div>
    );
  }

  const hasActiveSubscription = subscriptionData?.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Methods</h1>
          <p className="text-muted-foreground">
            Manage your payment methods and billing information
          </p>
        </div>
        {hasActiveSubscription && (
          <Button
            onClick={handleManagePaymentMethods}
            disabled={createPortalSession.isPending}
          >
            {createPortalSession.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Payment Method
              </>
            )}
          </Button>
        )}
      </div>

      {!hasActiveSubscription ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              No Active Subscription
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              Subscribe to a plan to add payment methods. Payment methods are
              managed through our secure payment processor, Stripe.
            </p>
            <Button className="mt-4" asChild>
              <a href="/dashboard/billing/plans">View Plans</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Methods
              </CardTitle>
              <CardDescription>
                Your saved payment methods for subscription billing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-4">
                    <div className="rounded-md bg-muted p-2">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-medium">Card on File</p>
                      <p className="text-sm text-muted-foreground">
                        Managed through Stripe
                      </p>
                    </div>
                  </div>
                  <Badge>Default</Badge>
                </div>

                <p className="text-sm text-muted-foreground">
                  For security, payment method details are managed directly
                  through Stripe&apos;s secure portal.
                </p>

                <Button
                  variant="outline"
                  onClick={handleManagePaymentMethods}
                  disabled={createPortalSession.isPending}
                  className="w-full"
                >
                  {createPortalSession.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Manage in Stripe Portal
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Billing Information
              </CardTitle>
              <CardDescription>
                Your billing details for invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Organization
                    </p>
                    <p className="font-medium">{organization.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="font-medium">
                      {subscriptionData?.plan?.name ?? "Unknown"}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  To update your billing address or other billing details, use
                  the Stripe customer portal.
                </p>

                <Button
                  variant="outline"
                  onClick={handleManagePaymentMethods}
                  disabled={createPortalSession.isPending}
                >
                  {createPortalSession.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Update Billing Info
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

