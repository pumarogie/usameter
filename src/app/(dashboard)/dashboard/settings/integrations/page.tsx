"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import {
  CheckCircle,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  Webhook,
  Key,
  CreditCard,
  FileText,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/react";

export default function IntegrationsPage() {
  const { organization, isLoaded } = useOrganization();
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);

  // Check if organization has an active subscription (indicates Stripe is connected)
  const { data: subscriptionData, isLoading: subscriptionLoading } =
    trpc.subscription.getCurrentSubscription.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  const copyToClipboard = (text: string, type: "webhook" | "api") => {
    navigator.clipboard.writeText(text);
    if (type === "webhook") {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedApi(true);
      setTimeout(() => setCopiedApi(false), 2000);
    }
  };

  const isLoading = !isLoaded || subscriptionLoading;

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
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Please select an organization to view integrations.
          </p>
        </div>
      </div>
    );
  }

  const hasActiveSubscription = subscriptionData?.status === "ACTIVE";
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/stripe`
      : "/api/webhooks/stripe";
  const apiBaseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1`
      : "/api/v1";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">
          Connect and configure external services
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Stripe
              </CardTitle>
              <CardDescription>Payment processing</CardDescription>
            </div>
            <Badge
              variant={hasActiveSubscription ? "default" : "secondary"}
              className="ml-2"
            >
              {hasActiveSubscription ? (
                <>
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Connected
                </>
              ) : (
                "Not Connected"
              )}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {hasActiveSubscription
                ? "Stripe is configured and processing payments for your subscription."
                : "Subscribe to a plan to connect Stripe for payment processing."}
            </p>
            {hasActiveSubscription && (
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Stripe Dashboard
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Clerk
              </CardTitle>
              <CardDescription>Authentication</CardDescription>
            </div>
            <Badge variant="default">
              <CheckCircle className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Clerk is managing authentication and organization membership for
              your account.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <a
                href="https://dashboard.clerk.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Clerk Dashboard
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Configure webhooks to receive real-time events from Stripe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook Endpoint URL</Label>
            <div className="flex items-center gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, "webhook")}
              >
                {copiedWebhook ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL to your Stripe webhook settings to receive payment
              events
            </p>
          </div>

          <div className="rounded-md bg-muted p-4">
            <h4 className="text-sm font-medium mb-2">Required Events</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• checkout.session.completed</li>
              <li>• customer.subscription.created</li>
              <li>• customer.subscription.updated</li>
              <li>• customer.subscription.deleted</li>
              <li>• invoice.paid</li>
              <li>• invoice.payment_failed</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            API Reference
          </CardTitle>
          <CardDescription>
            Access the Usameter API to send usage events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Base URL</Label>
            <div className="flex items-center gap-2">
              <Input value={apiBaseUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(apiBaseUrl, "api")}
              >
                {copiedApi ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-md bg-muted p-4">
            <h4 className="text-sm font-medium mb-2">Available Endpoints</h4>
            <ul className="text-xs text-muted-foreground space-y-2 font-mono">
              <li>
                <span className="text-green-600 dark:text-green-400">POST</span>{" "}
                /api/v1/events — Record usage events
              </li>
              <li>
                <span className="text-blue-600 dark:text-blue-400">GET</span>{" "}
                /api/v1/events — Query recorded events
              </li>
              <li>
                <span className="text-blue-600 dark:text-blue-400">GET</span>{" "}
                /api/v1/usage — Get usage summary
              </li>
            </ul>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" asChild>
              <a href="/dashboard/api-keys">
                <Key className="mr-2 h-4 w-4" />
                Manage API Keys
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

