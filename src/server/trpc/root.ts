import { router } from "./trpc";

// Import routers
import { usageRouter } from "./routers/usage";
import { billingRouter } from "./routers/billing";
import { adminRouter } from "./routers/admin";
import { snapshotRouter } from "./routers/snapshot";
import { subscriptionRouter } from "./routers/subscription";
import { apiKeysRouter } from "./routers/apiKeys";
import { teamRouter } from "./routers/team";

export const appRouter = router({
  usage: usageRouter,
  billing: billingRouter,
  admin: adminRouter,
  snapshot: snapshotRouter,
  subscription: subscriptionRouter,
  apiKeys: apiKeysRouter,
  team: teamRouter,
});

export type AppRouter = typeof appRouter;
