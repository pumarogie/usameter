export interface Context {
  tenantId?: string;
  organizationId?: string;
  userId?: string;
}

export function createContext(opts: {
  tenantId?: string;
  organizationId?: string;
  userId?: string;
}): Context {
  return {
    tenantId: opts.tenantId,
    organizationId: opts.organizationId,
    userId: opts.userId,
  };
}

