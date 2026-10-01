// Self-hosted edition: AI data room generation is switched off.
const MESSAGE =
  "AI data room generation is not available in the self-hosted edition";

export async function getDataroomSystemPrompt(): Promise<string> {
  throw new Error(MESSAGE);
}

export async function getDataroomUserPrompt(_description: string): Promise<string> {
  throw new Error(MESSAGE);
}
