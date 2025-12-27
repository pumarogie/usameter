"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import {
  Users,
  Search,
  MoreHorizontal,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  Loader2,
  TrendingUp,
  UserPlus,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/react";

const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  ACTIVE: "default",
  SUSPENDED: "secondary",
  DELETED: "destructive",
};

type Customer = {
  id: string;
  externalId: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  totalEvents: number;
};

export default function CustomersPage() {
  const { organization } = useOrganization();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const utils = trpc.useUtils();

  // Fetch customer summary stats
  const { data: summaryData, isLoading: summaryLoading } =
    trpc.customers.getSummary.useQuery(
      { organizationId: organization?.id ?? "" },
      { enabled: !!organization?.id },
    );

  // Fetch customers list
  const { data, isLoading, isFetching } = trpc.customers.list.useQuery(
    {
      organizationId: organization?.id ?? "",
      status:
        statusFilter !== "all"
          ? (statusFilter as "ACTIVE" | "SUSPENDED" | "DELETED")
          : undefined,
      search: search || undefined,
      limit: 25,
      cursor,
    },
    { enabled: !!organization?.id },
  );

  // Update status mutation
  const updateStatusMutation = trpc.customers.updateStatus.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      utils.customers.getSummary.invalidate();
    },
  });

  const handleNextPage = () => {
    if (data?.nextCursor) {
      setCursorHistory([...cursorHistory, cursor ?? ""]);
      setCursor(data.nextCursor);
    }
  };

  const handlePreviousPage = () => {
    if (cursorHistory.length > 0) {
      const newHistory = [...cursorHistory];
      const previousCursor = newHistory.pop();
      setCursorHistory(newHistory);
      setCursor(previousCursor || undefined);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCursor(undefined);
    setCursorHistory([]);
  };

  const handleStatusChange = (customerId: string, newStatus: string) => {
    if (!organization?.id) return;
    updateStatusMutation.mutate({
      organizationId: organization.id,
      customerId,
      status: newStatus as "ACTIVE" | "SUSPENDED" | "DELETED",
    });
  };

  if (isLoading || summaryLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">
            Please select an organization to view customers.
          </p>
        </div>
      </div>
    );
  }

  const customers = data?.customers ?? [];
  const summary = summaryData ?? {
    total: 0,
    active: 0,
    suspended: 0,
    deleted: 0,
    newThisMonth: 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
        <p className="text-muted-foreground">
          Manage your customers and view their usage
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Customers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <p className="text-xs text-muted-foreground">
              {summary.active} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.active}</div>
            <p className="text-xs text-muted-foreground">
              {summary.total > 0
                ? ((summary.active / summary.total) * 100).toFixed(0)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.suspended}</div>
            <p className="text-xs text-muted-foreground">Quota exceeded</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New This Month</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.newThisMonth}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline h-3 w-3 mr-1" />
              Recent signups
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
          <CardDescription>
            Customers are automatically created when you record events with
            their tenant ID
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or external ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                className="w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCursor(undefined);
                  setCursorHistory([]);
                }}
              >
                <option value="all">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DELETED">Deleted</option>
              </select>
              <Button type="submit" variant="secondary">
                Search
              </Button>
              {(search || statusFilter !== "all") && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setCursor(undefined);
                    setCursorHistory([]);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </form>

          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No customers found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Customers will appear here when you start recording usage events"}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>External ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total Events</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer: Customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          {customer.name || "-"}
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-2 py-1 text-sm">
                            {customer.externalId}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[customer.status]}>
                            {customer.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {customer.totalEvents.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {new Date(customer.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {customer.status !== "ACTIVE" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusChange(customer.id, "ACTIVE")
                                  }
                                >
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                              {customer.status !== "SUSPENDED" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusChange(customer.id, "SUSPENDED")
                                  }
                                >
                                  <UserX className="mr-2 h-4 w-4" />
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {customer.status !== "DELETED" && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    handleStatusChange(customer.id, "DELETED")
                                  }
                                >
                                  <UserX className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {customers.length} customers
                  {isFetching && (
                    <Loader2 className="inline ml-2 h-4 w-4 animate-spin" />
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={cursorHistory.length === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!data?.nextCursor}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
