// Self-hosted replacement for "@aws-sdk/client-lambda". The only Lambda the app
// invokes builds ZIP archives (bulk downloads, dataroom freeze archives); it is
// not part of the self-hosted build, so invoking it fails with a clear error.
export const InvocationType = {
  DryRun: "DryRun",
  Event: "Event",
  RequestResponse: "RequestResponse",
} as const;
export type InvocationType = (typeof InvocationType)[keyof typeof InvocationType];

export class InvokeCommand {
  constructor(readonly input: Record<string, unknown>) {}
}

export class LambdaClient {
  constructor(readonly config: Record<string, unknown> = {}) {}
  async send(command: InvokeCommand): Promise<never> {
    throw new Error(
      `AWS Lambda (${String(command?.input?.FunctionName ?? "unknown function")}) is not available in self-hosted mode: bulk ZIP downloads and dataroom freeze archives are disabled.`,
    );
  }
  destroy() {}
}
