"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import {
  Activity,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
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
import { trpc } from "@/lib/trpc/react";
import Link from "next/link";

type UsageEvent = {
  id: string;
  eventType: string;
  quantity: number;
  metadata: unknown;
  timestamp: Date;
  billedAt: Date | null;
  tenant: {
    id: string;
    externalId: string;
    name: string | null;
  };
};

export default function EventsPage() {
  const { organization } = useOrganization();
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  // Fetch events from database
  const { data, isLoading, isFetching } =
    trpc.usage.listEventsByOrganization.useQuery(
      {
        organizationId: organization?.id ?? "",
        eventType: eventTypeFilter || undefined,
        limit: 25,
        cursor,
      },
      { enabled: !!organization?.id },
    );

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
          <h1 className="text-3xl font-bold tracking-tight">Usage Events</h1>
          <p className="text-muted-foreground">
            Please select an organization to view events.
          </p>
        </div>
      </div>
    );
  }

  const events = data?.events ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Events</h1>
          <p className="text-muted-foreground">
            View all recorded usage events for your organization
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/usage">
            <Activity className="mr-2 h-4 w-4" />
            Back to Usage Overview
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Log</CardTitle>
          <CardDescription>
            All usage events recorded from your API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter by event type..."
                  value={eventTypeFilter}
                  onChange={(e) => setEventTypeFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="secondary">
                Filter
              </Button>
              {eventTypeFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEventTypeFilter("");
                    setCursor(undefined);
                    setCursorHistory([]);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </form>

          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No events found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {eventTypeFilter
                  ? `No events found for type "${eventTypeFilter}"`
                  : "Start sending events to see them here."}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event: UsageEvent) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <code className="rounded bg-muted px-2 py-1 text-sm">
                            {event.eventType}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">
                              {event.tenant.name || event.tenant.externalId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {event.tenant.externalId}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {event.quantity.toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {new Date(event.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.billedAt ? (
                            <Badge variant="default">Billed</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {events.length} events
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
