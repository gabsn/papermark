// Self-hosted replacement for "posthog-js": a client that records nothing and sends
// nothing. Every method of the real client is a no-op: known getters return empty
// values, anything else returns undefined.
const EMPTY: Record<string, unknown> = {
  __loaded: false,
  config: {},
  get_distinct_id: () => "",
  get_session_id: () => "",
  get_property: () => undefined,
  getFeatureFlag: () => undefined,
  getFeatureFlagPayload: () => undefined,
  isFeatureEnabled: () => false,
  has_opted_in_capturing: () => false,
  has_opted_out_capturing: () => true,
  is_capturing: () => false,
  onFeatureFlags: () => () => {},
  on: () => () => {},
};

function createClient(): any {
  const client: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined; // not a thenable
        if (typeof prop === "string" && prop in EMPTY) return EMPTY[prop];
        if (prop === "init") return () => client;
        // Sub-APIs (posthog.people.set, posthog.featureFlags.reload…) chain to the client.
        if (prop === "people" || prop === "featureFlags" || prop === "sessionRecording" || prop === "surveys") {
          return client;
        }
        return () => undefined;
      },
    },
  );
  return client;
}

export const posthog = createClient();
export class PostHog {
  constructor() {
    return createClient();
  }
}
export default posthog;
