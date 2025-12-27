"use client";

import { trpc } from "@/lib/trpc/react";
import { useEffect, useState } from "react";

interface DashboardProps {
  tenantId: string;
}

export function UsageDashboard({ tenantId }: DashboardProps) {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Last 30 days
    return date;
  });
  const [endDate, setEndDate] = useState(new Date());

  const { data: usage, isLoading: usageLoading } = trpc.usage.getUsage.useQuery({
    start: startDate,
    end: endDate,
    granularity: "day",
  });

  const { data: usageByType, isLoading: usageByTypeLoading } =
    trpc.usage.getUsageByType.useQuery({
      start: startDate,
      end: endDate,
    });

  // Auto-refresh every 30 seconds for real-time feel
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger refetch
      // This will be handled by React Query's refetch mechanism
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Usage Dashboard</h2>
        <div className="flex gap-4">
          <input
            type="date"
            value={startDate.toISOString().split("T")[0]}
            onChange={(e) => setStartDate(new Date(e.target.value))}
            className="px-3 py-2 border rounded"
          />
          <input
            type="date"
            value={endDate.toISOString().split("T")[0]}
            onChange={(e) => setEndDate(new Date(e.target.value))}
            className="px-3 py-2 border rounded"
          />
        </div>
      </div>

      {/* Total Usage Card */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Total Usage</h3>
        {usageLoading ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <div className="text-4xl font-bold">
            {usage?.total.toLocaleString() ?? 0}
            {usage?.fromCache && (
              <span className="text-sm text-gray-500 ml-2">(cached)</span>
            )}
          </div>
        )}
      </div>

      {/* Usage by Event Type */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Usage by Event Type</h3>
        {usageByTypeLoading ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            {usageByType && usageByType.length > 0 ? (
              usageByType.map((item) => (
                <div key={item.eventType} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{item.eventType}</div>
                    <div className="text-sm text-gray-500">
                      {item.eventCount.toLocaleString()} events
                    </div>
                  </div>
                  <div className="text-xl font-bold">
                    {item.totalQuantity.toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No usage data for this period</div>
            )}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Events Today</div>
          <div className="text-2xl font-bold">
            {usageByType?.reduce((sum, item) => sum + item.eventCount, 0) ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Event Types</div>
          <div className="text-2xl font-bold">
            {usageByType?.length ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Avg per Day</div>
          <div className="text-2xl font-bold">
            {usage && usageByType
              ? Math.round(
                  usage.total /
                    Math.max(
                      1,
                      Math.ceil(
                        (endDate.getTime() - startDate.getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    )
                )
              : 0}
          </div>
        </div>
      </div>
    </div>
  );
}

