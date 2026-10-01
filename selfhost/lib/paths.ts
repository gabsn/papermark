// Where the self-hosted build keeps its state: everything under one folder
// ($PAPERMARK_DATA, default ./.data) so a backup is one copy.
import { join } from "node:path";

export const DATA_DIR = process.env.PAPERMARK_DATA ?? join(process.cwd(), ".data");
export const dataPath = (...parts: string[]) => join(DATA_DIR, ...parts);
