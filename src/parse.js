import { adapters } from './adapters/index.js';
import { extractScheme } from './adapters/common.js';
import { isS3HttpUrl } from './adapters/s3.js';
import { diagnostic, fail } from './diagnostics.js';
import { looksLikeFilePath } from './path.js';
import { createRegistry, defaultRegistry, getBuiltInDefinitions } from './registry.js';
import { mask } from './redaction.js';
import { validateAddress } from './validation.js';

function ok(value, errors = [], warnings = []) {
  return {
    ok: errors.length === 0,
    value: errors.length === 0 ? value : null,
    errors,
    warnings
  };
}

function normalizeInput(input) {
  if (typeof input !== 'string') {
    return { error: fail('INVALID_INPUT_TYPE', 'Connparse input must be a string') };
  }
  if (!input.trim()) {
    return { error: fail('EMPTY_INPUT', 'Connparse input cannot be empty') };
  }
  return { raw: input };
}

function inferDefinition(raw, registry) {
  if (isS3HttpUrl(raw)) {
    return { scheme: 's3', definition: registry.getByScheme('s3') };
  }

  const scheme = extractScheme(raw);
  if (!scheme && looksLikeFilePath(raw)) {
    return { scheme: 'file', definition: registry.getByScheme('file') };
  }

  if (!scheme) {
    return { scheme: null, definition: null };
  }

  return { scheme, definition: registry.getByScheme(scheme) };
}

function parseUnknown(raw, scheme, strict) {
  const warning = diagnostic('UNKNOWN_SCHEME', `${scheme} does not have a registered Connparse definition`, 'scheme');
  if (strict) return fail(warning.code, warning.message, warning.path);

  try {
    const url = new URL(raw);
    return ok(
      {
        scheme,
        type: 'unknown',
        authority: {
          host: url.hostname,
          port: url.port ? Number(url.port) : null
        },
        resource: {
          type: 'unknown',
          name: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] || '') : null
        },
        path: decodeURIComponent(url.pathname || ''),
        query: Object.fromEntries(new URLSearchParams(url.search)),
        fragment: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
        credentials: {},
        options: {},
        raw,
        safe: mask(raw)
      },
      [],
      [warning]
    );
  } catch {
    return fail('INVALID_URL', `Could not parse ${scheme} address`, 'raw');
  }
}

export function parse(input, options = {}) {
  const normalized = normalizeInput(input);
  if (normalized.error) return normalized.error;

  const raw = normalized.raw;
  const registry = options.definitions
    ? createRegistry([...getBuiltInDefinitions(), ...options.definitions])
    : defaultRegistry;
  const { scheme, definition } = inferDefinition(raw, registry);

  if (!scheme) {
    return fail('MISSING_SCHEME', 'Input must include a scheme or look like a file path', 'scheme');
  }

  if (!definition) {
    return parseUnknown(raw, scheme, Boolean(options.strict));
  }

  const adapterName = definition.adapter || 'generic-uri';
  const adapter = adapters[adapterName];
  if (!adapter) {
    return fail('UNKNOWN_ADAPTER', `${definition.id} references missing adapter ${adapterName}`, 'adapter');
  }

  try {
    const value = adapter(raw, definition, {
      raw,
      safe: mask(raw)
    });
    const validation = validateAddress(value, definition, options);
    return ok(value, validation.errors, validation.warnings);
  } catch (error) {
    return fail('PARSE_FAILED', error instanceof Error ? error.message : String(error), 'raw');
  }
}

export function parseOrThrow(input, options = {}) {
  const result = parse(input, options);
  if (result.ok) return result.value;
  const message = result.errors.map((error) => error.message).join('; ');
  throw new Error(message || 'Connparse failed');
}
