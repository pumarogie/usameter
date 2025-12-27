import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { createContext } from "@/server/trpc/context";

const handler = (req: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (opts) => {
      // Extract tenant/organization context from headers or auth
      // In production, this would come from JWT token or session
      const tenantId = req.headers.get("x-tenant-id") || undefined;
      const organizationId = req.headers.get("x-organization-id") || undefined;
      const userId = req.headers.get("x-user-id") || undefined;

      return createContext({
        tenantId,
        organizationId,
        userId,
      });
    },
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });
};

export { handler as GET, handler as POST };
