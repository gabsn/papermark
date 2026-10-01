// Self-hosted implementation (AGPL).
import { useTeam } from "@/context/team-context";
import useSWR from "swr";

import { fetcher } from "@/lib/utils";

import type { UninvitedMembersResponse } from "../../api/uninvited";

export function useUninvitedMembers(
  dataroomId: string | undefined,
  groupId: string | undefined,
) {
  const teamInfo = useTeam();
  const teamId = teamInfo?.currentTeam?.id;

  const { data, error, mutate } = useSWR<UninvitedMembersResponse>(
    teamId && dataroomId && groupId
      ? `/api/teams/${teamId}/datarooms/${dataroomId}/groups/${groupId}/uninvited`
      : null,
    fetcher,
    { dedupingInterval: 10000 },
  );

  return {
    uninvitedCount: data?.uninvitedCount ?? 0,
    uninvitedEmails: data?.uninvitedEmails ?? [],
    loading: !data && !error,
    error,
    mutate,
  };
}
