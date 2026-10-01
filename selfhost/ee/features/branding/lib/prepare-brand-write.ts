// Self-hosted implementation (AGPL). Validates a team brand create/update
// body and drops the fields the team's plan may not set. Omitted fields stay
// undefined so Prisma leaves the stored value untouched.
import { z } from "zod";

import { validateRedirectUrl } from "@/lib/api/domains/validate-redirect-url";
import {
  teamPlanAllowsCustomWelcomeAndCta,
  teamPlanAllowsLayoutCustomization,
} from "@/lib/billing/team-plan-custom-messaging";
import { getFeatureFlags } from "@/lib/featureFlags";

import {
  DataroomCardLayoutSchema,
  DataroomViewerHeaderStyleSchema,
  DataroomViewerLayoutPresetSchema,
} from "./dataroom-viewer-layout";

const brandBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  logo: z.string().nullable().optional(),
  hideLogo: z.boolean().optional(),
  banner: z.string().nullable().optional(),
  brandColor: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  accentButtonColor: z.string().nullable().optional(),
  applyAccentColorToDataroomView: z.boolean().optional(),
  welcomeMessage: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().nullable().optional(),
  privacyPolicyUrl: z.string().nullable().optional(),
  customLinkPreviewEnabled: z.boolean().optional(),
  linkPreviewTitle: z.string().nullable().optional(),
  linkPreviewDescription: z.string().nullable().optional(),
  linkPreviewImage: z.string().nullable().optional(),
  linkPreviewFavicon: z.string().nullable().optional(),
  cardLayout: DataroomCardLayoutSchema.optional(),
  showFolderTree: z.boolean().optional(),
  viewerLayoutPreset: DataroomViewerLayoutPresetSchema.optional(),
  viewerHeaderStyle: DataroomViewerHeaderStyleSchema.optional(),
  hideFolderIconsInMain: z.boolean().optional(),
});

export type BrandWriteData = z.infer<typeof brandBodySchema>;

export type PrepareBrandWriteResult =
  | { ok: true; data: BrandWriteData }
  | {
      ok: false;
      status: number;
      message: string;
      errors?: Record<string, string[] | undefined>;
    };

const MESSAGING_FIELDS = [
  "welcomeMessage",
  "ctaLabel",
  "ctaUrl",
  "customLinkPreviewEnabled",
  "linkPreviewTitle",
  "linkPreviewDescription",
  "linkPreviewImage",
  "linkPreviewFavicon",
] as const;

const LAYOUT_FIELDS = [
  "cardLayout",
  "showFolderTree",
  "viewerLayoutPreset",
  "viewerHeaderStyle",
  "hideFolderIconsInMain",
] as const;

export async function prepareBrandWrite({
  body,
  teamId,
  plan,
  nameRequired = false,
}: {
  body: unknown;
  teamId: string;
  plan: string;
  nameRequired?: boolean;
}): Promise<PrepareBrandWriteResult> {
  const parsed = brandBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Invalid request body",
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  const data: BrandWriteData = { ...parsed.data };

  if (nameRequired && !data.name) {
    return { ok: false, status: 400, message: "Brand name is required" };
  }

  if (!teamPlanAllowsCustomWelcomeAndCta(plan)) {
    for (const key of MESSAGING_FIELDS) delete data[key];
  }
  if (!teamPlanAllowsLayoutCustomization(plan)) {
    for (const key of LAYOUT_FIELDS) delete data[key];
  }

  if (typeof data.ctaUrl === "string" && data.ctaUrl.trim()) {
    const result = await validateRedirectUrl(data.ctaUrl, teamId);
    if (!result.valid) {
      return { ok: false, status: 400, message: result.message };
    }
    data.ctaUrl = result.url;
  }

  if (data.privacyPolicyUrl !== undefined) {
    const flags = await getFeatureFlags({ teamId });
    if (!flags.customPrivacyUrl) {
      delete data.privacyPolicyUrl;
    } else if (data.privacyPolicyUrl && data.privacyPolicyUrl.trim()) {
      const result = await validateRedirectUrl(data.privacyPolicyUrl, teamId);
      if (!result.valid) {
        return {
          ok: false,
          status: 400,
          message: result.message.replace("Redirect URL", "Privacy policy URL"),
        };
      }
      data.privacyPolicyUrl = result.url || null;
    } else {
      data.privacyPolicyUrl = null;
    }
  }

  return { ok: true, data };
}
