export type JsonSchema = Record<string, unknown>;

export type LlmRequest = {
  system: string;
  input: string;
  schema: JsonSchema;
  schemaName: string;
  maxTokens?: number;
};

export type LlmResult = {
  text: string;
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
};

export interface LlmProvider {
  name: string;
  model: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public kind: 'quota' | 'timeout' | 'bad_output' | 'config' | 'http',
    public status?: number,
  ) {
    super(message);
  }
}
