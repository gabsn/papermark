// Self-hosted implementation (AGPL). Allowed values for the dataroom viewer
// layout columns stored on Brand / DataroomBrand (plain strings in Prisma).
import { z } from "zod";

export const DataroomCardLayoutSchema = z.enum(["LIST", "GRID", "COMPACT"]);
export type DataroomCardLayout = z.infer<typeof DataroomCardLayoutSchema>;

export const DataroomViewerHeaderStyleSchema = z.enum([
  "DEFAULT",
  "SPLIT",
  "NOTION",
]);
export type DataroomViewerHeaderStyle = z.infer<
  typeof DataroomViewerHeaderStyleSchema
>;

/** Named presets shown as cards in the branding editor. */
export type DataroomLayoutCardId = "STANDARD" | "STRICT" | "MODERN" | "NOTION";

export const DataroomViewerLayoutPresetSchema = z.enum([
  "STANDARD",
  "STRICT",
  "MODERN",
  "NOTION",
  "CUSTOM",
]);
export type DataroomViewerLayoutPreset = z.infer<
  typeof DataroomViewerLayoutPresetSchema
>;

export const CARD_LAYOUT_OPTIONS: ReadonlyArray<{
  value: DataroomCardLayout;
  label: string;
}> = [
  { value: "LIST", label: "List" },
  { value: "GRID", label: "Grid" },
  { value: "COMPACT", label: "Compact" },
];

export function asDataroomCardLayout(
  value: string | null | undefined,
): DataroomCardLayout {
  const parsed = DataroomCardLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : "LIST";
}

export function asDataroomViewerHeaderStyle(
  value: string | null | undefined,
): DataroomViewerHeaderStyle {
  const parsed = DataroomViewerHeaderStyleSchema.safeParse(value);
  return parsed.success ? parsed.data : "DEFAULT";
}

type LayoutFields = {
  cardLayout: DataroomCardLayout;
  showFolderTree: boolean;
  hideFolderIconsInMain: boolean;
  viewerHeaderStyle: DataroomViewerHeaderStyle;
};

/** Field combination of each named preset (same mapping as the editor applies). */
export const DATAROOM_LAYOUT_PRESETS: Record<DataroomLayoutCardId, LayoutFields> =
  {
    STANDARD: {
      cardLayout: "LIST",
      showFolderTree: true,
      hideFolderIconsInMain: false,
      viewerHeaderStyle: "DEFAULT",
    },
    STRICT: {
      cardLayout: "COMPACT",
      showFolderTree: false,
      hideFolderIconsInMain: true,
      viewerHeaderStyle: "DEFAULT",
    },
    MODERN: {
      cardLayout: "COMPACT",
      showFolderTree: false,
      hideFolderIconsInMain: true,
      viewerHeaderStyle: "SPLIT",
    },
    NOTION: {
      cardLayout: "GRID",
      showFolderTree: false,
      hideFolderIconsInMain: false,
      viewerHeaderStyle: "NOTION",
    },
  };

export function inferDataroomViewerLayoutPreset(
  fields: LayoutFields,
): DataroomViewerLayoutPreset {
  for (const [id, preset] of Object.entries(DATAROOM_LAYOUT_PRESETS)) {
    if (
      preset.cardLayout === fields.cardLayout &&
      preset.showFolderTree === fields.showFolderTree &&
      preset.hideFolderIconsInMain === fields.hideFolderIconsInMain &&
      preset.viewerHeaderStyle === fields.viewerHeaderStyle
    ) {
      return id as DataroomLayoutCardId;
    }
  }
  return "CUSTOM";
}
