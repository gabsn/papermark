// Self-hosted implementation (AGPL). Viewer language picker for a dataroom.
import {
  SUPPORTED_LOCALES,
  type SupportedLocaleCode,
} from "@/lib/i18n/locales";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function VisitorLanguageCard({
  defaultLanguage,
  onDefaultLanguageChange,
  hasAccess,
}: {
  defaultLanguage: SupportedLocaleCode;
  onDefaultLanguageChange: (code: SupportedLocaleCode) => void;
  hasAccess: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div>
          <Label htmlFor="visitor-language">Visitor language</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Language of the access screen and viewer for this data room.
          </p>
        </div>
        <Select
          value={defaultLanguage}
          onValueChange={(value) =>
            onDefaultLanguageChange(value as SupportedLocaleCode)
          }
          disabled={!hasAccess}
        >
          <SelectTrigger id="visitor-language" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((locale) => (
              <SelectItem key={locale.code} value={locale.code}>
                {locale.nativeName}
                {locale.nativeName !== locale.englishName
                  ? ` (${locale.englishName})`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!hasAccess ? (
          <p className="text-xs text-muted-foreground">
            Not available on the current plan.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
