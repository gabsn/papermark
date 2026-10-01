// Self-hosted implementation (AGPL). Link setting toggle for confidential view.
import type { Dispatch, SetStateAction } from "react";

import LinkItem from "@/components/links/link-sheet/link-item";
import type { LinkUpgradeOptions } from "@/components/links/link-sheet/link-options";

type WithConfidentialView = { enableConfidentialView?: boolean | null };

export default function ConfidentialViewSection<
  T extends WithConfidentialView,
>({
  data,
  setData,
  isAllowed,
  handleUpgradeStateChange,
}: {
  data: T;
  setData: Dispatch<SetStateAction<T>>;
  isAllowed: boolean;
  handleUpgradeStateChange: (options: LinkUpgradeOptions) => void;
}) {
  const enabled = !!data.enableConfidentialView;

  return (
    <div className="pb-5">
      <LinkItem
        title="Confidential view"
        tooltipContent="Blur the document except around the visitor's cursor, so whole pages are harder to capture."
        enabled={enabled}
        action={() =>
          setData((prev) => ({ ...prev, enableConfidentialView: !enabled }))
        }
        isAllowed={isAllowed}
        requiredPlan="business"
        upgradeAction={() =>
          handleUpgradeStateChange({
            state: true,
            trigger: "link_sheet_confidential_view_section",
            plan: "Business",
            highlightItem: ["confidential-view"],
          })
        }
      />
    </div>
  );
}
