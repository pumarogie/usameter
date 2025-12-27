"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useOrganization, useUser, useOrganizationList } from "@clerk/nextjs";
import {
  Plus,
  Mail,
  MoreHorizontal,
  UserMinus,
  Shield,
  Loader2,
  Users,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/react";

const roleColors: Record<string, "default" | "secondary" | "outline"> = {
  "org:admin": "default",
  admin: "secondary",
  member: "outline",
  viewer: "outline",
};

const roleLabels: Record<string, string> = {
  "org:admin": "Admin",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export default function TeamPage() {
  const { user } = useUser();
  const { organization, memberships, isLoaded } = useOrganization({
    memberships: {
      infinite: true,
    },
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">(
    "member",
  );
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const utils = trpc.useUtils();

  // Fetch pending invitations from our database
  const { data: invitationsData, isLoading: invitationsLoading } =
    trpc.team.getInvitations.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  // Create invitation mutation
  const inviteMutation = trpc.team.invite.useMutation({
    onSuccess: () => {
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteDialog(false);
      utils.team.getInvitations.invalidate();
    },
  });

  // Cancel invitation mutation
  const cancelMutation = trpc.team.cancelInvitation.useMutation({
    onSuccess: () => {
      utils.team.getInvitations.invalidate();
    },
  });

  // Resend invitation mutation
  const resendMutation = trpc.team.resendInvitation.useMutation({
    onSuccess: () => {
      utils.team.getInvitations.invalidate();
    },
  });

  const handleInvite = () => {
    if (!organization?.id || !user?.id) return;
    inviteMutation.mutate({
      organizationId: organization.id,
      email: inviteEmail,
      role: inviteRole,
      invitedBy: user.id,
    });
  };

  const handleCancelInvitation = (id: string) => {
    if (!organization?.id) return;
    cancelMutation.mutate({ id, organizationId: organization.id });
  };

  const handleResendInvitation = (id: string) => {
    if (!organization?.id) return;
    resendMutation.mutate({ id, organizationId: organization.id });
  };

  if (!isLoaded || invitationsLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-muted-foreground">
            Please select an organization to manage team members.
          </p>
        </div>
      </div>
    );
  }

  const members = memberships?.data ?? [];
  const invitations = invitationsData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-muted-foreground">
            Manage your organization&apos;s team members and permissions
          </p>
        </div>
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your organization
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(
                      e.target.value as "admin" | "member" | "viewer",
                    )
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {inviteRole === "admin" &&
                    "Can manage team members and billing"}
                  {inviteRole === "member" && "Can view and manage usage data"}
                  {inviteRole === "viewer" && "Can only view usage data"}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowInviteDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
              >
                {inviteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Invitation
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            People with access to this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No team members</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Invite team members to collaborate on your organization.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((membership) => {
                  const memberUser = membership.publicUserData;
                  const isOwner = membership.role === "org:admin";
                  const role = membership.role;

                  return (
                    <TableRow key={membership.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={memberUser?.imageUrl || undefined}
                            />
                            <AvatarFallback>
                              {(memberUser?.firstName?.[0] ?? "") +
                                (memberUser?.lastName?.[0] ?? "") ||
                                memberUser?.identifier
                                  ?.slice(0, 2)
                                  .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {memberUser?.firstName} {memberUser?.lastName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {memberUser?.identifier}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={roleColors[role] ?? "outline"}
                          className="capitalize"
                        >
                          {roleLabels[role] ?? role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {membership.createdAt
                          ? new Date(membership.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={
                                isOwner ||
                                membership.publicUserData?.userId === user?.id
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Shield className="mr-2 h-4 w-4" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <UserMinus className="mr-2 h-4 w-4" />
                              Remove Member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              Invitations waiting to be accepted
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map(
                  (invitation: {
                    id: string;
                    email: string;
                    role: string;
                    createdAt: Date;
                    expiresAt: Date;
                  }) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">
                        {invitation.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {invitation.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(invitation.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleResendInvitation(invitation.id)
                            }
                            disabled={resendMutation.isPending}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleCancelInvitation(invitation.id)
                            }
                            disabled={cancelMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
