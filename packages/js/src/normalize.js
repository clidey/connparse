import {
  authorityEntries,
  canonicalize,
  canonicalSchemeForAddress,
  defaultPort,
  definitionFor,
  normalizeHost,
  normalizeQueryObject
} from './canonicalize.js';
import { parse } from './parse.js';

function normalizeLookupKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePort(port, definition, options = {}) {
  if (port == null || port === '') return null;
  const numeric = Number(port);
  if (!options.includeDefaultPort && numeric === defaultPort(definition)) return null;
  return numeric;
}

function normalizeAuthority(address, definition, options = {}) {
  const entries = authorityEntries(address);
  if (entries.length > 1) {
    return {
      hosts: entries.map((entry) => ({
        host: normalizeHost(entry.host),
        port: normalizePort(entry.port, definition, options)
      }))
    };
  }

  const entry = entries[0];
  if (!entry) return {};

  if (address.resource?.type === 'bucket') {
    const authority = { bucket: normalizeHost(entry.host) };
    if (address.authority?.region) authority.region = address.authority.region;
    return authority;
  }

  return {
    host: normalizeHost(entry.host),
    port: normalizePort(entry.port, definition, options)
  };
}

function normalizeCredentials(address, options = {}) {
  if (!options.includeCredentials) return {};
  const output = {};
  for (const key of Object.keys(address.credentials || {}).sort()) {
    output[key] = address.credentials[key];
  }
  return output;
}

function normalizeOptions(address) {
  const output = {};
  for (const key of Object.keys(address.options || {}).sort()) {
    output[key] = address.options[key];
  }
  return output;
}

function semanticSourceValue(source, query, options, scheme) {
  if (source.from_query) {
    const value = query[source.from_query];
    if (value == null) return undefined;
    return Array.isArray(value) ? value[value.length - 1] : value;
  }

  if (source.from_option) {
    return options[source.from_option];
  }

  if (source.from_scheme) {
    return scheme;
  }

  return undefined;
}

function normalizeSemanticValue(value, source) {
  if (source.values == null) {
    return value;
  }

  const normalizedEntries = new Map(
    Object.entries(source.values).map(([key, item]) => [normalizeLookupKey(key), item])
  );
  return normalizedEntries.get(normalizeLookupKey(value));
}

function normalizeSemantic(address, definition, query, options) {
  if (definition?.semantic_fields == null || typeof definition.semantic_fields !== 'object') {
    return undefined;
  }

  const fields = {};
  const consumedQuery = new Set();
  const consumedOptions = new Set();
  const scheme = canonicalSchemeForAddress(address, definition);

  for (const [semanticKey, rule] of Object.entries(definition.semantic_fields)) {
    const sources = Array.isArray(rule?.sources) ? rule.sources : [];
    if (sources.length === 0) {
      continue;
    }

    const presentQueryKeys = sources
      .map((source) => source.from_query)
      .filter((key) => typeof key === 'string' && query[key] != null);
    const presentOptionKeys = sources
      .map((source) => source.from_option)
      .filter((key) => typeof key === 'string' && options[key] != null);

    for (const source of sources) {
      const rawValue = semanticSourceValue(source, query, options, scheme);
      if (rawValue == null) {
        continue;
      }

      const normalizedValue = normalizeSemanticValue(rawValue, source);
      if (normalizedValue == null) {
        continue;
      }

      fields[semanticKey] = normalizedValue;
      for (const key of presentQueryKeys) {
        consumedQuery.add(key);
      }
      for (const key of presentOptionKeys) {
        consumedOptions.add(key);
      }
      break;
    }
  }

  if (Object.keys(fields).length === 0) {
    return undefined;
  }

  const semantic = {
    provider: definition.id,
    fields
  };

  if (consumedQuery.size > 0 || consumedOptions.size > 0) {
    semantic.consumed = {};
    if (consumedQuery.size > 0) {
      semantic.consumed.query = Array.from(consumedQuery).sort();
    }
    if (consumedOptions.size > 0) {
      semantic.consumed.options = Array.from(consumedOptions).sort();
    }
  }

  return semantic;
}

export function normalizeAddress(address, options = {}) {
  const definition = definitionFor(address, options);
  const canonical = options.canonical || canonicalize(address, options);
  const normalizedQuery = normalizeQueryObject(address, definition, options);
  const normalizedOptions = normalizeOptions(address);
  const semantic = normalizeSemantic(address, definition, normalizedQuery, normalizedOptions);

  const output = {
    scheme: canonicalSchemeForAddress(address, definition),
    type: address.type,
    authority: normalizeAuthority(address, definition, options),
    resource: {
      type: address.resource?.type || 'none',
      name: address.resource?.name ?? null
    },
    path: address.path || '',
    query: normalizedQuery,
    fragment: options.includeFragment === false ? null : address.fragment ?? null,
    credentials: normalizeCredentials(address, options),
    options: normalizedOptions,
    raw: canonical,
    safe: canonical,
    canonical
  };

  if (semantic != null) {
    output.semantic = semantic;
  }

  return output;
}

export function parseNormalize(input, options = {}) {
  const result = parse(input, options);
  if (!result.ok) return result;

  return {
    ...result,
    value: normalizeAddress(result.value, options)
  };
}
