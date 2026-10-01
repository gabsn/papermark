// Client hook for the team's limits (self-hosted, AGPL, written for this fork).
import { useTeam } from "@/context/team-context";
import useSWR from "swr";
import { z } from "zod";

import { usePlan } from "@/lib/swr/use-billing";
import { fetcher } from "@/lib/utils";

import type { configSchema } from "./server";

export type LimitProps = z.infer<typeof configSchema> & {
  usage: {
    documents: number;
    links: number;
    users: number;
  };
  dataroomUpload: boolean;
};

const below = (used: number | undefined, max: number | null | undefined) =>
  typeof max === "number" ? (used ?? 0) < max : true; // null/undefined = unlimited

export function useLimits() {
  const teamInfo = useTeam();
  const { isFree, isTrial, isPaused } = usePlan();
  const teamId = teamInfo?.currentTeam?.id;

  const { data, error } = useSWR<LimitProps | null>(
    teamId && `/api/teams/${teamId}/limits`,
    fetcher,
    { dedupingInterval: 30000 },
  );

  const canAddDocuments = below(data?.usage?.documents, data?.documents);
  const canAddLinks = below(data?.usage?.links, data?.links);
  const canAddUsers = below(data?.usage?.users, data?.users);

  return {
    showUpgradePlanModal: (isFree && !isTrial) || (isTrial && !canAddUsers),
    limits: data,
    canAddDocuments,
    canAddLinks,
    canAddUsers,
    isPaused,
    error,
    loading: !data && !error,
  };
}
