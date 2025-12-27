"use client";

import { useState } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  RotateCw,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/react";

export default function ApiKeysPage() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);

  const utils = trpc.useUtils();

  // Fetch API keys from database
  const { data: apiKeys, isLoading } = trpc.apiKeys.list.useQuery(
    { organizationId: organization?.id ?? "" },
    { enabled: !!organization?.id },
  );

  // Create API key mutation
  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key);
      setNewKeyName("");
      setShowCreateDialog(false);
      setShowKeyDialog(true);
      utils.apiKeys.list.invalidate();
    },
  });

  // Revoke API key mutation
  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
    },
  });

  // Rotate API key mutation
  const rotateMutation = trpc.apiKeys.rotate.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key);
      setShowKeyDialog(true);
      utils.apiKeys.list.invalidate();
    },
  });

  const handleCreateKey = () => {
    if (!organization?.id || !user?.id) return;

    createMutation.mutate({
      organizationId: organization.id,
      name: newKeyName,
      createdBy: user.id,
      permissions: ["events:write", "usage:read"],
    });
  };

  const handleCopyKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeleteKey = (id: string) => {
    if (!organization?.id) return;
    revokeMutation.mutate({ id, organizationId: organization.id });
  };

  const handleRotateKey = (id: string) => {
    if (!organization?.id || !user?.id) return;
    rotateMutation.mutate({
      id,
      organizationId: organization.id,
      createdBy: user.id,
    });
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
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">
            Please select an organization to manage API keys.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">
            Manage your API keys for accessing the Usameter API
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key to access the Usameter API. The key will
                only be shown once.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Production, Development"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Key"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* New Key Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. You won&apos;t be able to see
              it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-muted p-4">
              <code className="break-all text-sm">{newKey}</code>
            </div>
            <Button className="w-full" onClick={handleCopyKey}>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowKeyDialog(false);
                setNewKey(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            API keys are used to authenticate requests to the Usameter API
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!apiKeys || apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No API keys yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create an API key to start integrating with Usameter.
              </p>
              <Button
                className="mt-4"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create API Key
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-1 text-sm">
                        {key.keyPrefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.permissions.map((perm: string) => (
                          <Badge
                            key={perm}
                            variant="secondary"
                            className="text-xs"
                          >
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {new Date(key.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Rotate key"
                          onClick={() => handleRotateKey(key.id)}
                          disabled={rotateMutation.isPending}
                        >
                          <RotateCw
                            className={`h-4 w-4 ${rotateMutation.isPending ? "animate-spin" : ""}`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Delete key"
                          onClick={() => handleDeleteKey(key.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
          <CardDescription>Learn how to use the Usameter API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Authentication</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Include your API key in the Authorization header:
            </p>
            <div className="rounded-md bg-muted p-4">
              <code className="text-sm">
                Authorization: Bearer usa_your_api_key_here
              </code>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Example: Track an Event</h4>
            <div className="rounded-md bg-muted p-4 overflow-x-auto">
              <pre className="text-sm">
                {`curl -X POST https://api.usameter.io/v1/events \\
  -H "Authorization: Bearer usa_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "api_request",
    "tenant_id": "cust_123",
    "quantity": 1,
    "metadata": {
      "endpoint": "/users",
      "method": "GET"
    }
  }'`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
