// Self-hosted implementation (AGPL). Named dataroom layout presets as cards.
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  DataroomLayoutCardId,
  DataroomViewerLayoutPreset,
} from "../lib/dataroom-viewer-layout";

const PRESETS: { id: DataroomLayoutCardId; label: string; hint: string }[] = [
  { id: "STANDARD", label: "Standard", hint: "List with folder tree" },
  { id: "STRICT", label: "Strict", hint: "Compact table, no tree" },
  { id: "MODERN", label: "Modern", hint: "Split header with banner" },
  { id: "NOTION", label: "Notion", hint: "Cover banner and grid" },
];

export function DataroomLayoutPresetCards({
  selectedPreset,
  onSelect,
}: {
  selectedPreset: DataroomViewerLayoutPreset;
  onSelect: (id: DataroomLayoutCardId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PRESETS.map((preset) => {
        const selected = selectedPreset === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            className={cn(
              "relative flex flex-col items-start rounded-md border px-3 py-2 text-left text-xs transition-colors",
              selected
                ? "border-foreground bg-muted"
                : "border-border hover:bg-muted/60",
            )}
          >
            <span className="font-medium text-foreground">{preset.label}</span>
            <span className="text-muted-foreground">{preset.hint}</span>
            {selected ? (
              <CheckIcon className="absolute right-2 top-2 h-3.5 w-3.5" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
