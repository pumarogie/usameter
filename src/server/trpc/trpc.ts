import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { type Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        code: error.code,
        httpStatus: error.cause instanceof Error ? (error.cause as any).status : 500,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware to enforce tenant isolation
const enforceTenantIsolation = t.middleware(async ({ ctx, next }) => {
  if (!ctx.tenantId && !ctx.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant or organization context is required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    },
  });
});

// Procedure that requires tenant context
export const tenantProcedure = publicProcedure.use(enforceTenantIsolation);

// Middleware for admin operations (requires organization context)
const enforceOrgAccess = t.middleware(async ({ ctx, next }) => {
  if (!ctx.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization context is required for this operation",
    });
  }

  return next({
    ctx: {
      ...ctx,
      organizationId: ctx.organizationId,
    },
  });
});

export const orgProcedure = tenantProcedure.use(enforceOrgAccess);

