// Self-hosted edition: AI indexing is switched off. No content type is supported, so the
// callers never trigger these; they are not Trigger.dev tasks and triggering is a no-op.
export const SUPPORTED_AI_CONTENT_TYPES: string[] = [];

type DisabledTask = {
  id: string;
  trigger: (payload: unknown, options?: unknown) => Promise<undefined>;
};

function disabledTask(id: string): DisabledTask {
  return { id, trigger: async () => undefined };
}

export const addFileToVectorStoreTask = disabledTask("add-file-to-vector-store");
export const processDocumentForAITask = disabledTask("process-document-for-ai");
