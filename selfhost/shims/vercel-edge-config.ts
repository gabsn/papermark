// Self-hosted replacement for "@vercel/edge-config": a local, read-only config.
//
// Papermark reads these keys (lib/edge-config/*, lib/featureFlags, keyword checks):
//   betaFeatures       Record<feature, teamId[]>  "*" means every team (lib/featureFlags)
//   emails             string[]  sign-in blocklist (regex fragments)
//   keywords           string[]  blocked words in external URLs and redirects
//   trustedTeams       string[]  teams exempt from keyword checks
//   customEmail        Record<teamId, sender>  custom OTP sender per team
//   embeddableDomains  string[]  hosts allowed for embeds
//   prompts            AI prompt templates (absent: AI dataroom templates stay off)
//
// Defaults suit a single owner: every beta feature on for every team, except those that
// need a hosted service not configured here, and empty blocklists. Optional overrides
// come from $PAPERMARK_DATA/edge-config.json (top-level keys replace the defaults;
// betaFeatures is merged per feature), re-read at most every 5 s.
// The lib/edge-config helpers only call get() when EDGE_CONFIG is set: selfhost/env.example
// sets EDGE_CONFIG=selfhost.
import { readFileSync, statSync } from "node:fs";

import { dataPath } from "../lib/paths";

const ALL_TEAMS = ["*"];

function defaultBetaFeatures(): Record<string, string[]> {
  const on = (enabled: boolean) => (enabled ? ALL_TEAMS : []);
  const env = process.env;
  return {
    tokens: ALL_TEAMS,
    incomingWebhooks: ALL_TEAMS,
    roomChangeNotifications: ALL_TEAMS,
    webhooks: ALL_TEAMS,
    conversations: ALL_TEAMS,
    dataroomUpload: ALL_TEAMS,
    inDocumentLinks: ALL_TEAMS,
    dataroomIndex: ALL_TEAMS,
    dataroomFreeze: ALL_TEAMS,
    annotations: ALL_TEAMS,
    dataroomInvitations: ALL_TEAMS,
    workflows: ALL_TEAMS,
    sso: ALL_TEAMS, // SAML runs on the embedded Postgres through Jackson
    textSelection: ALL_TEAMS,
    redaction: ALL_TEAMS,
    requestList: ALL_TEAMS,
    logoOnAccessForm: ALL_TEAMS,
    htmlDocuments: ALL_TEAMS,
    hideFooterOnAccessForm: ALL_TEAMS,
    customPrivacyUrl: ALL_TEAMS,
    // Need a hosted service: on only when it is configured.
    ai: on(!!env.OPENAI_API_KEY),
    slack: on(!!(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET)),
    usStorage: [], // a second, US-region bucket does not exist locally
  };
}

function defaults(): Record<string, unknown> {
  return {
    betaFeatures: defaultBetaFeatures(),
    emails: [],
    keywords: [],
    trustedTeams: [],
    customEmail: {},
    embeddableDomains: [],
  };
}

const OVERRIDES_TTL_MS = 5_000;
let cache: { at: number; mtimeMs: number; value: Record<string, unknown> } | undefined;

function overrides(): Record<string, unknown> {
  const now = Date.now();
  if (cache && now - cache.at < OVERRIDES_TTL_MS) return cache.value;
  const file = dataPath("edge-config.json");
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    // no override file
  }
  if (cache && cache.mtimeMs === mtimeMs) {
    cache.at = now;
    return cache.value;
  }
  let value: Record<string, unknown> = {};
  if (mtimeMs >= 0) {
    try {
      value = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      console.error(`[selfhost/edge-config] ignoring unreadable ${file}:`, error);
    }
  }
  cache = { at: now, mtimeMs, value };
  return value;
}

function config(): Record<string, unknown> {
  const base = defaults();
  const extra = overrides();
  const merged: Record<string, unknown> = { ...base, ...extra };
  if (extra.betaFeatures && typeof extra.betaFeatures === "object") {
    merged.betaFeatures = { ...(base.betaFeatures as object), ...(extra.betaFeatures as object) };
  }
  return merged;
}

// A copy per read keeps callers from mutating the shared config, like a network read.
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

export async function get<T = unknown>(key: string): Promise<T | undefined> {
  return clone(config()[key] as T | undefined);
}

export async function getAll<T = Record<string, unknown>>(keys?: string[]): Promise<T> {
  const all = config();
  if (!keys) return clone(all) as T;
  return clone(Object.fromEntries(keys.filter((k) => k in all).map((k) => [k, all[k]]))) as T;
}

export async function has(key: string): Promise<boolean> {
  return key in config();
}

export async function digest(): Promise<string> {
  return "selfhost";
}

export function createClient(_connectionString?: string) {
  return { get, getAll, has, digest };
}

export function parseConnectionString(_connectionString: string) {
  return null;
}
