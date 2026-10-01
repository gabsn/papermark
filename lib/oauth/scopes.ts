// API token scopes. Written for the self-hosted fork: the module is imported by the core
// but missing upstream. Granular scopes are `<resource>.<read|write>` for the resources
// offered by the token editor (components/tokens/scopes.ts).

/** Mutually exclusive presets: full access, or read-only access to everything. */
export const PRESET_SCOPES = ["apis.all", "apis.read"] as const;

export const GRANULAR_SCOPES = [
  "documents.read",
  "documents.write",
  "links.read",
  "links.write",
  "datarooms.read",
  "datarooms.write",
  "analytics.read",
  "visitors.read",
] as const;

export type PresetScope = (typeof PRESET_SCOPES)[number];
export type GranularScope = (typeof GRANULAR_SCOPES)[number];
export type Scope = PresetScope | GranularScope;
