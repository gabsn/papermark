// Self-hosted implementation (AGPL). Request bodies of the invitation routes.
import { z } from "zod";

export const MAX_INVITATION_EMAILS_PER_REQUEST = 50;

export const invitationEmailSchema = z.string().trim().toLowerCase().email();

export const inviteViewersSchema = z.object({
  emails: z
    .array(invitationEmailSchema)
    .min(1, "Add at least one email")
    .max(MAX_INVITATION_EMAILS_PER_REQUEST),
  customMessage: z.string().trim().max(500).optional().nullable(),
  /** Group invites only: which of the group's links to send. */
  linkId: z.string().optional().nullable(),
});

export type InviteViewersInput = z.infer<typeof inviteViewersSchema>;
