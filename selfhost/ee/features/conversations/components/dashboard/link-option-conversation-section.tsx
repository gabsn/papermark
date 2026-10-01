// Self-hosted edition: conversations are switched off, so the link option is hidden.
import type { DEFAULT_LINK_TYPE } from "@/components/links/link-sheet";
import type { LinkUpgradeOptions } from "@/components/links/link-sheet/link-options";

export default function ConversationSection(_props: {
  data: DEFAULT_LINK_TYPE;
  setData: React.Dispatch<React.SetStateAction<DEFAULT_LINK_TYPE>>;
  isAllowed: boolean;
  handleUpgradeStateChange: (options: LinkUpgradeOptions) => void;
}) {
  return null;
}
