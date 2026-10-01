// Node built-ins loaded at call time through process.getBuiltinModule (Node >= 22.3).
// Some storage shims (@vercel/blob, @vercel/blob/client) are also bundled for the
// browser, where a static `import "node:fs"` breaks the webpack build; their
// server-only functions reach Node through these getters instead.
import type * as Crypto from "node:crypto";
import type * as Fs from "node:fs";
import type * as FsPromises from "node:fs/promises";
import type * as Path from "node:path";
import type * as Stream from "node:stream";
import type * as StreamPromises from "node:stream/promises";

const builtin = <T>(id: string): T => {
  const mod = process.getBuiltinModule?.(id);
  if (!mod) throw new Error(`${id} is only available on the server`);
  return mod as T;
};

export const nodeCrypto = () => builtin<typeof Crypto>("node:crypto");
export const nodeFs = () => builtin<typeof Fs>("node:fs");
export const nodeFsp = () => builtin<typeof FsPromises>("node:fs/promises");
export const nodePath = () => builtin<typeof Path>("node:path");
export const nodeStream = () => builtin<typeof Stream>("node:stream");
export const nodeStreamPromises = () =>
  builtin<typeof StreamPromises>("node:stream/promises");

// Same location as dataPath("files", ...) in ./paths.ts, without its static node:path import.
export const filesPath = (...parts: string[]) => {
  const { join } = nodePath();
  const dataDir = process.env.PAPERMARK_DATA ?? join(process.cwd(), ".data");
  return join(dataDir, "files", ...parts);
};

// Public origin of the app; every stored file is served by the app itself.
export const baseUrl = () =>
  (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
