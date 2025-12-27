import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { JsonValue } from "@prisma/client/runtime/library";
import { randomBytes, createHash } from "crypto";
import { router, publicProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";

type ApiKey = {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  organizationId: string;
  createdBy: string;
  permissions: JsonValue;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `usa_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 12);
  return { key, hash, prefix };
}

export const apiKeysRouter = router({
  list: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const apiKeys = await prisma.apiKey.findMany({
        where: {
          organizationId: input.organizationId,
          revokedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });

      return apiKeys.map((key: ApiKey) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions as string[],
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      }));
    }),

  create: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1).max(100),
        permissions: z.array(z.string()).default(["events:write", "usage:read"]),
        expiresAt: z.date().optional(),
        createdBy: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { key, hash, prefix } = generateApiKey();

      const apiKey = await prisma.apiKey.create({
        data: {
          name: input.name,
          keyHash: hash,
          keyPrefix: prefix,
          organizationId: input.organizationId,
          createdBy: input.createdBy,
          permissions: input.permissions,
          expiresAt: input.expiresAt,
        },
      });

      // Return the full key only once - this is the only time it's visible
      return {
        id: apiKey.id,
        key, // Full key - show to user only once
        name: apiKey.name,
        keyPrefix: prefix,
        permissions: apiKey.permissions as string[],
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      };
    }),

  revoke: publicProcedure
    .input(
      z.object({
        id: z.string(),
        organizationId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const apiKey = await prisma.apiKey.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          revokedAt: null,
        },
      });

      if (!apiKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        });
      }

      await prisma.apiKey.update({
        where: { id: input.id },
        data: { revokedAt: new Date() },
      });

      return { success: true };
    }),

  rotate: publicProcedure
    .input(
      z.object({
        id: z.string(),
        organizationId: z.string(),
        createdBy: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const existingKey = await prisma.apiKey.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          revokedAt: null,
        },
      });

      if (!existingKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        });
      }

      // Revoke old key and create new one
      const { key, hash, prefix } = generateApiKey();

      const [, newKey] = await prisma.$transaction([
        prisma.apiKey.update({
          where: { id: input.id },
          data: { revokedAt: new Date() },
        }),
        prisma.apiKey.create({
          data: {
            name: existingKey.name,
            keyHash: hash,
            keyPrefix: prefix,
            organizationId: input.organizationId,
            createdBy: input.createdBy,
            permissions: existingKey.permissions as string[],
            expiresAt: existingKey.expiresAt,
          },
        }),
      ]);

      return {
        id: newKey.id,
        key, // Full key - show to user only once
        name: newKey.name,
        keyPrefix: prefix,
        permissions: newKey.permissions as string[],
        expiresAt: newKey.expiresAt,
        createdAt: newKey.createdAt,
      };
    }),

  // Validate API key (used by API middleware)
  validate: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const hash = createHash("sha256").update(input.key).digest("hex");

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

      // Update last used timestamp
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      });

      return {
        valid: true,
        organizationId: apiKey.organizationId,
        permissions: apiKey.permissions as string[],
      };
    }),
});
