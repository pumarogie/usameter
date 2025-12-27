import { httpBatchLink, createTRPCClient } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/root";

function getBaseUrl() {
  if (typeof window !== "undefined") {
    // Browser should use relative path
    return "";
  }
  if (process.env.VERCEL_URL) {
    // SSR should use vercel url
    return `https://${process.env.VERCEL_URL}`;
  }
  // dev SSR should use localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function createServerTRPCClient(opts?: {
  tenantId?: string;
  organizationId?: string;
  userId?: string;
}) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
        headers() {
          const headers: Record<string, string> = {};
          if (opts?.tenantId) {
            headers["x-tenant-id"] = opts.tenantId;
          }
          if (opts?.organizationId) {
            headers["x-organization-id"] = opts.organizationId;
          }
          if (opts?.userId) {
            headers["x-user-id"] = opts.userId;
          }
          return headers;
        },
      }),
    ],
  });
}
