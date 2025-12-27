import { createHash } from "crypto";
import { prisma } from "@/server/db/prisma";

export interface ValidatedApiKey {
  valid: true;
  organizationId: string;
  permissions: string[];
}

export interface InvalidApiKey {
  valid: false;
  reason: string;
}

export type ApiKeyValidationResult = ValidatedApiKey | InvalidApiKey;

export async function validateApiKey(key: string): Promise<ApiKeyValidationResult> {
  if (!key || !key.startsWith("usa_")) {
    return { valid: false, reason: "Invalid key format" };
  }

  const hash = createHash("sha256").update(key).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
  });

  if (!apiKey) {
    return { valid: false, reason: "Invalid key" };
  }

  if (apiKey.revokedAt) {
    return { valid: false, reason: "Key has been revoked" };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, reason: "Key has expired" };
  }

  // Update last used timestamp (fire and forget)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {
    // Ignore errors updating last used
  });

  return {
    valid: true,
    organizationId: apiKey.organizationId,
    permissions: apiKey.permissions as string[],
  };
}

export function hasPermission(
  result: ApiKeyValidationResult,
  permission: string
): boolean {
  if (!result.valid) return false;
  return result.permissions.includes(permission);
}
