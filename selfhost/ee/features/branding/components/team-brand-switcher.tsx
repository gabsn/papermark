// Self-hosted implementation (AGPL). Picks which team brand the branding page
// edits, renames it, creates a new one, makes it the default or deletes it.
import type { Brand } from "@prisma/client";
import { PlusIcon, StarIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Id of the unsaved brand being created on the branding page. */
export const DRAFT_TEAM_BRAND_ID = "__draft_team_brand__";

export function nextTeamBrandName(brands: Pick<Brand, "name">[]): string {
  const names = new Set(brands.map((brand) => brand.name));
  if (!names.has("Default")) return "Default";
  let n = brands.length + 1;
  while (names.has(`Brand ${n}`)) n++;
  return `Brand ${n}`;
}

export function TeamBrandSwitcher({
  brands,
  selectedBrandId,
  defaultBrandId,
  brandName,
  onBrandNameChange,
  onSelect,
  onCreate,
  onSetDefault,
  onDelete,
  disabled,
}: {
  brands: Brand[];
  selectedBrandId: string | null;
  defaultBrandId: string | null;
  brandName: string;
  onBrandNameChange: (name: string) => void;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onSetDefault: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const isDraft = selectedBrandId === DRAFT_TEAM_BRAND_ID;
  const currentId = selectedBrandId ?? defaultBrandId ?? brands[0]?.id ?? null;
  const isDefault = !isDraft && currentId !== null && currentId === defaultBrandId;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
      {brands.length > 0 || isDraft ? (
        <div className="space-y-1">
          <Label htmlFor="team-brand-select" className="text-xs">
            Brand
          </Label>
          <Select
            value={currentId ?? undefined}
            onValueChange={(value) => onSelect(value)}
            disabled={disabled}
          >
            <SelectTrigger id="team-brand-select" className="w-56">
              <SelectValue placeholder="Select a brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                  {brand.id === defaultBrandId ? " (default)" : ""}
                </SelectItem>
              ))}
              {isDraft ? (
                <SelectItem value={DRAFT_TEAM_BRAND_ID}>
                  {brandName || "New brand"} (unsaved)
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex-1 space-y-1">
        <Label htmlFor="team-brand-name" className="text-xs">
          Name
        </Label>
        <Input
          id="team-brand-name"
          value={brandName}
          maxLength={80}
          onChange={(e) => onBrandNameChange(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCreate}
          disabled={disabled || isDraft}
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          New brand
        </Button>
        {!isDraft && currentId && !isDefault ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onSetDefault()}
            disabled={disabled}
          >
            <StarIcon className="mr-1 h-4 w-4" />
            Make default
          </Button>
        ) : null}
        {isDraft || currentId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (
                isDraft ||
                window.confirm(
                  "Delete this brand? Links using it fall back to the default brand.",
                )
              ) {
                void onDelete();
              }
            }}
            disabled={disabled}
          >
            <Trash2Icon className="mr-1 h-4 w-4" />
            {isDraft ? "Discard" : "Delete"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
