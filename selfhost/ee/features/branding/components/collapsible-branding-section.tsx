// Self-hosted implementation (AGPL).
import { type ReactNode, useState } from "react";

import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function CollapsibleBrandingSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-medium text-foreground">
        {title}
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
