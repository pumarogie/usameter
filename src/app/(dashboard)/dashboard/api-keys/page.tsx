"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Key, Plus, Copy, Check, Trash2, RotateCw, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

// Mock data - in production, fetch from tRPC
const mockApiKeys = [
  {
    id: "1",
    name: "Production",
    keyPrefix: "usa_abc12345",
    permissions: ["events:write", "usage:read"],
    lastUsedAt: new Date("2024-12-26"),
    createdAt: new Date("2024-10-15"),
  },
  {
    id: "2",
    name: "Development",
    keyPrefix: "usa_dev98765",
    permissions: ["events:write", "usage:read"],
    lastUsedAt: new Date("2024-12-25"),
    createdAt: new Date("2024-11-20"),
  },
  {
    id: "3",
    name: "Testing",
    keyPrefix: "usa_test1234",
    permissions: ["events:write"],
    lastUsedAt: null,
    createdAt: new Date("2024-12-01"),
  },
];

export default function ApiKeysPage() {
  const { user } = useUser();
  const [apiKeys, setApiKeys] = useState(mockApiKeys);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);

  const handleCreateKey = () => {
    // In production, call tRPC mutation
    const mockNewKey = `usa_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setNewKey(mockNewKey);
    setApiKeys([
      {
        id: String(apiKeys.length + 1),
        name: newKeyName,
        keyPrefix: mockNewKey.substring(0, 12),
        permissions: ["events:write", "usage:read"],
        lastUsedAt: null,
        createdAt: new Date(),
      },
      ...apiKeys,
    ]);
    setNewKeyName("");
    setShowCreateDialog(false);
    setShowKeyDialog(true);
  };

  const handleCopyKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeleteKey = (id: string) => {
    setApiKeys(apiKeys.filter((key) => key.id !== id));
  };

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
                Create a new API key to access the Usameter API. The key will only be shown once.
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
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateKey} disabled={!newKeyName.trim()}>
                Create Key
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
              Make sure to copy your API key now. You won&apos;t be able to see it again!
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
          {apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No API keys yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create an API key to start integrating with Usameter.
              </p>
              <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
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
                        {key.permissions.map((perm) => (
                          <Badge key={perm} variant="secondary" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt
                        ? key.lastUsedAt.toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>{key.createdAt.toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" title="Rotate key">
                          <RotateCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Delete key"
                          onClick={() => handleDeleteKey(key.id)}
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
          <CardDescription>
            Learn how to use the Usameter API
          </CardDescription>
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
