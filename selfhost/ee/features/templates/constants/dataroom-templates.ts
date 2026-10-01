// Self-hosted edition: data room templates are switched off; only the folder shape the
// core uses (generate-ai.ts) is kept.
export type FolderTemplate = {
  name: string;
  subfolders?: FolderTemplate[];
};
