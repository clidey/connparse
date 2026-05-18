import {
  authorityEntries,
  canonicalize,
  canonicalSchemeForAddress,
  defaultPort,
  definitionFor,
  normalizeHost,
  normalizeQueryValue,
  valuesFor
} from './canonicalize.js';
import { parse } from './parse.js';

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

function normalizeQuery(address, definition, options = {}) {
  const output = {};
  for (const key of Object.keys(address.query || {}).sort()) {
    const values = valuesFor(address.query[key]).map((value) => normalizeQueryValue(key, value, definition, options));
    output[key] = values.length === 1 ? values[0] : values;
  }
  return output;
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

export function normalizeAddress(address, options = {}) {
  const definition = definitionFor(address, options);
  const canonical = options.canonical || canonicalize(address, options);
  return {
    scheme: canonicalSchemeForAddress(address, definition),
    type: address.type,
    authority: normalizeAuthority(address, definition, options),
    resource: {
      type: address.resource?.type || 'none',
      name: address.resource?.name ?? null
    },
    path: address.path || '',
    query: normalizeQuery(address, definition, options),
    fragment: options.includeFragment === false ? null : address.fragment ?? null,
    credentials: normalizeCredentials(address, options),
    options: normalizeOptions(address),
    raw: canonical,
    safe: canonical,
    canonical
  };
}

export function parseNormalize(input, options = {}) {
  const result = parse(input, options);
  if (!result.ok) return result;

  return {
    ...result,
    value: normalizeAddress(result.value, options)
  };
}
