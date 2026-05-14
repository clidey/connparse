export type ConnparseType =
  | 'database'
  | 'object_storage'
  | 'file'
  | 'stream'
  | 'cache'
  | 'analytics'
  | 'api'
  | 'unknown';

export type QueryValue = string | string[];

export type ConnparseAddress = {
  scheme: string;
  type: ConnparseType;
  authority: Record<string, unknown>;
  resource: {
    type: string;
    name: string | null;
  };
  path: string;
  query: Record<string, QueryValue>;
  fragment: string | null;
  credentials: Record<string, string>;
  options: Record<string, unknown>;
  raw: string;
  safe: string;
};

export type ConnparseDiagnostic = {
  code: string;
  message: string;
  path?: string;
};

export type ParseResult = {
  ok: boolean;
  value: ConnparseAddress | null;
  errors: ConnparseDiagnostic[];
  warnings: ConnparseDiagnostic[];
};

export type ConnparseDefinition = Record<string, unknown>;

export type ParseOptions = {
  definitions?: ConnparseDefinition[];
  provider?: string;
  strict?: boolean;
};

export function parse(input: string, options?: ParseOptions): ParseResult;
export function parseOrThrow(input: string, options?: ParseOptions): ConnparseAddress;
export function mask(input: string): string;
export function parseDefinition(input: string, format?: 'json' | 'yaml'): ConnparseDefinition;
export function parseJsonDefinition(input: string): ConnparseDefinition;
export function parseYamlDefinition(input: string): ConnparseDefinition;
export function validateDefinition(definition: ConnparseDefinition, adapters?: Record<string, unknown>): ConnparseDefinition;
export function validateDefinitions(definitions: ConnparseDefinition[], adapters?: Record<string, unknown>): ConnparseDefinition[];
export function createRegistry(definitions?: ConnparseDefinition[]): unknown;
export const defaultRegistry: unknown;
export function getBuiltInDefinitions(): ConnparseDefinition[];
export function registerDefinition(definition: ConnparseDefinition): void;
