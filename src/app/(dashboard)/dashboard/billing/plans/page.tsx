"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useOrganization, useUser } from "@clerk/nextjs";
import { Check, Zap, Building2, Rocket, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/react";

// Plan display data with icons
const planIcons: Record<string, typeof Zap> = {
  Starter: Zap,
  Growth: Rocket,
  Enterprise: Building2,
};

const planFeatures: Record<string, string[]> = {
  Starter: [
    "100,000 events/month",
    "Basic analytics",
    "Email support",
    "API access",
    "1 team member",
  ],
  Growth: [
    "500,000 events/month",
    "Advanced analytics",
    "Priority support",
    "API access",
    "5 team members",
    "Custom event types",
    "Webhook integrations",
  ],
  Enterprise: [
    "5,000,000 events/month",
    "Enterprise analytics",
    "24/7 dedicated support",
    "API access",
    "Unlimited team members",
    "Custom event types",
    "Webhook integrations",
    "SLA guarantee",
    "Custom contracts",
  ],
};

interface Plan {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  includedEvents: number;
  overageRate: number;
  features: Record<string, boolean>;
}

function PlansContent() {
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { organization } = useOrganization();
  const { user } = useUser();

  // Fetch plans from database
  const { data: plans, isLoading: plansLoading } =
    trpc.subscription.getPlans.useQuery();

  // Fetch current subscription
  const { data: currentSubscription } =
    trpc.subscription.getCurrentSubscription.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  // Create checkout session mutation
  const createCheckoutSession =
    trpc.subscription.createCheckoutSession.useMutation({
      onSuccess: (data) => {
        if (data.sessionUrl) {
          window.location.href = data.sessionUrl;
        }
      },
      onError: (err) => {
        setError(err.message);
        setLoading(null);
      },
    });

  const currentPlanId = currentSubscription?.plan?.id;

  const handleSelectPlan = async (planId: string) => {
    if (planId === currentPlanId) return;
    if (!organization?.id || !user?.primaryEmailAddress?.emailAddress) {
      setError(
        "Please ensure you have an organization selected and email verified",
      );
      return;
    }

    setError(null);
    setLoading(planId);

    createCheckoutSession.mutate({
      organizationId: organization.id,
      planId: planId,
      email: user.primaryEmailAddress.emailAddress,
      organizationName: organization.name ?? "Organization",
    });
  };

  if (plansLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pricing Plans</h1>
        <p className="text-muted-foreground">
          Choose the plan that best fits your needs
        </p>
      </div>

      {canceled && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <CardContent className="py-4">
            <p className="text-yellow-800 dark:text-yellow-200">
              Checkout was canceled. No changes were made to your subscription.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardContent className="py-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {plans?.map((plan: Plan, index: number) => {
          const Icon = planIcons[plan.name] ?? Zap;
          const features = planFeatures[plan.name] ?? [];
          const isCurrent = plan.id === currentPlanId;
          const isPopular = index === 1; // Growth plan is popular

          return (
            <Card
              key={plan.id}
              className={`relative ${
                isPopular ? "border-primary shadow-lg" : ""
              }`}
            >
              {isPopular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    {isCurrent && (
                      <Badge variant="secondary" className="mt-1">
                        Current Plan
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-4xl font-bold">
                    ${(plan.basePrice / 100).toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{plan.includedEvents.toLocaleString()} events included</p>
                  <p>
                    ${(plan.overageRate / 100).toFixed(2)} per 1,000 overage
                    events
                  </p>
                </div>
                <ul className="space-y-2">
                  {features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={
                    isCurrent ? "outline" : isPopular ? "default" : "secondary"
                  }
                  disabled={isCurrent || loading === plan.id}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {loading === plan.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrent ? (
                    "Current Plan"
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Need a custom plan?</CardTitle>
          <CardDescription>
            Contact our sales team for custom pricing and features tailored to
            your needs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline">Contact Sales</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PlansLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<PlansLoading />}>
      <PlansContent />
    </Suspense>
  );
}
