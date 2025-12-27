"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useOrganizationList } from "@clerk/nextjs";
import { Activity, Building2, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { createOrganization, isLoaded } = useOrganizationList();
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateOrg = async () => {
    if (!orgName.trim() || !createOrganization) return;

    setLoading(true);
    try {
      await createOrganization({ name: orgName });
      setStep(3);
    } catch (error) {
      console.error("Failed to create organization:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    router.push("/dashboard");
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/50 p-4">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="h-5 w-5" />
        </div>
        <span className="text-2xl font-bold">Usameter</span>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle>
            {step === 1 && `Welcome, ${user?.firstName || "there"}!`}
            {step === 2 && "Create your organization"}
            {step === 3 && "You're all set!"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Let's get you set up with Usameter"}
            {step === 2 && "Organizations help you manage teams and billing"}
            {step === 3 && "Your workspace is ready to use"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium">Account created</p>
                    <p className="text-sm text-muted-foreground">
                      Your account is ready to go
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Create an organization</p>
                    <p className="text-sm text-muted-foreground">
                      Set up your first workspace
                    </p>
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={() => setStep(2)}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  id="orgName"
                  placeholder="Acme Inc."
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This is your company or team name
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreateOrg}
                  disabled={!orgName.trim() || loading}
                >
                  {loading ? "Creating..." : "Create organization"}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Your organization <strong>{orgName}</strong> has been created.
                  You can now start tracking usage and billing.
                </p>
              </div>
              <Button className="w-full" onClick={handleComplete}>
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-2 rounded-full ${
              s <= step ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
