// Self-hosted replacement for "posthog-js/react": the provider renders its children and
// the hooks return the no-op client (selfhost/shims/posthog-js.ts) or empty values.
import { createContext, createElement, Fragment, type ReactNode } from "react";

import posthog from "./posthog-js";

export { PostHog, posthog } from "./posthog-js";

export const PostHogContext = createContext<{ client: any }>({ client: posthog });

type Children = { children?: ReactNode; [prop: string]: unknown };
const passThrough = ({ children }: Children) => createElement(Fragment, null, children ?? null);

export const PostHogProvider = passThrough;
export const PostHogErrorBoundary = passThrough;
export const PostHogCaptureOnViewed = passThrough;
// Feature-gated content stays hidden: no flag is ever enabled.
export const PostHogFeature = (_props: Children) => null;

export const usePostHog = () => posthog;
export const useFeatureFlagEnabled = (_flag: string): boolean | undefined => false;
export const useFeatureFlagPayload = (_flag: string): unknown => undefined;
export const useFeatureFlagVariantKey = (_flag: string): string | boolean | undefined => undefined;
export const useFeatureFlagResult = (_flag: string): undefined => undefined;
export const useActiveFeatureFlags = (): string[] => [];
export const captureFeatureInteraction = () => {};
export const captureFeatureView = () => {};
export const setupReactErrorHandler = () => () => {};
