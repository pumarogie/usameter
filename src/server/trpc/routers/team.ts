import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { router, publicProcedure } from "../trpc";
import { prisma } from "@/server/db/prisma";

type TeamInvitation = {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  token: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export const teamRouter = router({
  getInvitations: publicProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const invitations = await prisma.teamInvitation.findMany({
        where: {
          organizationId: input.organizationId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      return invitations.map((inv: TeamInvitation) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      }));
    }),

  invite: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        email: z.string().email(),
        role: z.enum(["admin", "member", "viewer"]),
        invitedBy: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Check if invitation already exists
      const existingInvite = await prisma.teamInvitation.findFirst({
        where: {
          organizationId: input.organizationId,
          email: input.email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvite) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invitation for this email already exists",
        });
      }

      const token = generateInviteToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const invitation = await prisma.teamInvitation.create({
        data: {
          email: input.email,
          organizationId: input.organizationId,
          role: input.role,
          token,
          invitedBy: input.invitedBy,
          expiresAt,
        },
      });

      // TODO: Send email invitation
      // In production, integrate with an email service like Resend, SendGrid, etc.

      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`,
        expiresAt: invitation.expiresAt,
      };
    }),

  cancelInvitation: publicProcedure
    .input(
      z.object({
        id: z.string(),
        organizationId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const invitation = await prisma.teamInvitation.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          acceptedAt: null,
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      await prisma.teamInvitation.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  acceptInvitation: publicProcedure
    .input(
      z.object({
        token: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const invitation = await prisma.teamInvitation.findUnique({
        where: { token: input.token },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation has already been accepted",
        });
      }

      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation has expired",
        });
      }

      // Mark invitation as accepted
      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      // Note: The actual organization membership is managed by Clerk
      // This just tracks the invitation status on our end
      // You would use Clerk's API to add the user to the organization

      return {
        success: true,
        organizationId: invitation.organizationId,
        role: invitation.role,
      };
    }),

  resendInvitation: publicProcedure
    .input(
      z.object({
        id: z.string(),
        organizationId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const invitation = await prisma.teamInvitation.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          acceptedAt: null,
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Generate new token and extend expiry
      const token = generateInviteToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.teamInvitation.update({
        where: { id: input.id },
        data: { token, expiresAt },
      });

      // TODO: Resend email invitation

      return {
        id: invitation.id,
        inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`,
        expiresAt,
      };
    }),
});
