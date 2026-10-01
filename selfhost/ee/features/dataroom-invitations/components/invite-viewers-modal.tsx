// Self-hosted implementation (AGPL). Invite visitors to a data room by email.
// With a linkId the invitees receive that link; with only a groupId they are
// added to the group and receive its link; with neither the user picks one
// of the dataroom's links.
import { useEffect, useMemo, useState } from "react";

import { useTeam } from "@/context/team-context";
import { toast } from "sonner";
import useSWR from "swr";

import type { LinkWithViews } from "@/lib/types";
import { fetcher } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  MAX_INVITATION_EMAILS_PER_REQUEST,
  invitationEmailSchema,
} from "../lib/schema/dataroom-invitations";

function parseEmails(raw: string) {
  const parts = raw
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of Array.from(new Set(parts))) {
    (invitationEmailSchema.safeParse(part).success ? valid : invalid).push(
      part,
    );
  }
  return { valid, invalid };
}

export function InviteViewersModal({
  open,
  setOpen,
  dataroomId,
  dataroomName,
  groupId,
  linkId,
  defaultEmails,
  canSend,
  onSuccess,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  dataroomId: string;
  dataroomName: string;
  groupId?: string;
  linkId?: string;
  defaultEmails?: string[];
  canSend: boolean;
  onSuccess?: () => void;
}) {
  const teamInfo = useTeam();
  const teamId = teamInfo?.currentTeam?.id;
  const [emailsText, setEmailsText] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [pickedLinkId, setPickedLinkId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  const needsLinkPicker = !linkId && !groupId;
  const { data: links } = useSWR<LinkWithViews[]>(
    open && needsLinkPicker && teamId
      ? `/api/teams/${teamId}/datarooms/${dataroomId}/links`
      : null,
    fetcher,
  );
  const activeLinks = useMemo(
    () =>
      (links ?? []).filter(
        (link) =>
          !link.isArchived &&
          !link.deletedAt &&
          (!link.expiresAt || new Date(link.expiresAt) > new Date()),
      ),
    [links],
  );

  useEffect(() => {
    if (!open) return;
    setEmailsText((defaultEmails ?? []).join("\n"));
    setCustomMessage("");
    setPickedLinkId(undefined);
  }, [open, defaultEmails]);

  const { valid, invalid } = parseEmails(emailsText);
  const targetLinkId = linkId ?? pickedLinkId;

  const send = async () => {
    if (!teamId) return;
    if (valid.length === 0) {
      toast.error("Add at least one valid email");
      return;
    }
    if (valid.length > MAX_INVITATION_EMAILS_PER_REQUEST) {
      toast.error(
        `At most ${MAX_INVITATION_EMAILS_PER_REQUEST} emails per invitation`,
      );
      return;
    }

    const base = `/api/teams/${teamId}/datarooms/${dataroomId}`;
    const url = targetLinkId
      ? `${base}/links/${targetLinkId}/invite`
      : groupId
        ? `${base}/groups/${groupId}/invite`
        : null;
    if (!url) {
      toast.error("Choose which link to send");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: valid,
          customMessage: customMessage.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.message ?? "Failed to send invitations");
        return;
      }
      const sent: string[] = body.sent ?? [];
      const failed: string[] = body.failed ?? [];
      if (sent.length > 0) {
        toast.success(
          `Invitation sent to ${sent.length} ${sent.length === 1 ? "person" : "people"}`,
        );
      }
      if (failed.length > 0) {
        toast.error(`Could not send to: ${failed.join(", ")}`);
      }
      onSuccess?.();
      setOpen(false);
    } catch {
      toast.error("Failed to send invitations");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite viewers</DialogTitle>
          <DialogDescription>
            Send an email invitation to view {dataroomName}.
          </DialogDescription>
        </DialogHeader>

        {!canSend ? (
          <p className="text-sm text-muted-foreground">
            Email invitations are not enabled for this team. Share the link
            directly instead.
          </p>
        ) : (
          <div className="space-y-4">
            {needsLinkPicker ? (
              <div className="space-y-2">
                <Label htmlFor="invite-link">Link to send</Label>
                {links && activeLinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This data room has no active link. Create one first.
                  </p>
                ) : (
                  <Select value={pickedLinkId} onValueChange={setPickedLinkId}>
                    <SelectTrigger id="invite-link">
                      <SelectValue placeholder="Choose a link" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeLinks.map((link) => (
                        <SelectItem key={link.id} value={link.id}>
                          {link.name || link.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="invite-emails">Emails</Label>
              <Textarea
                id="invite-emails"
                rows={4}
                placeholder="name@company.com, other@company.com"
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
              />
              {invalid.length > 0 ? (
                <p className="text-xs text-red-500">
                  Invalid: {invalid.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-message">Message (optional)</Label>
              <Textarea
                id="invite-message"
                rows={3}
                maxLength={500}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {canSend ? (
            <Button
              onClick={send}
              loading={sending}
              disabled={
                sending ||
                valid.length === 0 ||
                (needsLinkPicker && !pickedLinkId)
              }
            >
              Send {valid.length > 0 ? `(${valid.length})` : ""}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
