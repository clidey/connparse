import { parseOrThrow } from './parse.js';
import { createRegistry, defaultRegistry, getBuiltInDefinitions } from './registry.js';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function registryFor(options = {}) {
  return options.definitions
    ? createRegistry([...getBuiltInDefinitions(), ...options.definitions])
    : defaultRegistry;
}

export function definitionFor(address, options = {}) {
  if (options.definition) return options.definition;
  const registry = registryFor(options);
  if (options.provider) {
    const provider = normalizeKey(options.provider);
    return registry.getById(provider) || registry.getByScheme(provider);
  }
  if (String(address?.scheme || '').startsWith('jdbc:')) {
    const provider = address.scheme.split(':')[1];
    return registry.getByScheme(provider);
  }
  return registry.getByScheme(address?.scheme);
}

export function canonicalSchemeForAddress(address, definition) {
  const scheme = normalizeKey(address.scheme);
  if (scheme.startsWith('jdbc:')) return scheme;
  const schemes = (definition?.schemes || []).map(normalizeKey);
  return schemes.includes(scheme) ? schemes[0] : scheme;
}

export function defaultPort(definition) {
  const port = definition?.defaults?.port;
  return Number.isInteger(port) ? port : null;
}

export function normalizeHost(host) {
  return String(host || '').toLowerCase();
}

function formatHost(host) {
  const value = normalizeHost(host);
  return value.includes(':') && !value.startsWith('[') ? `[${value}]` : value;
}

function formatPort(port, definition, options = {}) {
  if (port == null || port === '') return '';
  const numeric = Number(port);
  if (!options.includeDefaultPort && numeric === defaultPort(definition)) return '';
  return `:${numeric}`;
}

export function authorityEntries(address) {
  const authority = address.authority || {};
  if (Array.isArray(authority.hosts)) return authority.hosts;
  const host = authority.host || authority.bucket || (address.resource?.type === 'bucket' ? address.resource.name : '');
  if (!host) return [];
  return [{ host, port: authority.port }];
}

function authorityText(address, definition, options = {}) {
  return authorityEntries(address)
    .map((entry) => `${formatHost(entry.host)}${formatPort(entry.port, definition, options)}`)
    .join(',');
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value));
}

function encodePath(path) {
  const text = String(path || '');
  if (!text) return '';
  return text
    .split('/')
    .map((part) => encodePathSegment(part))
    .join('/');
}

function pathText(address) {
  const path = String(address.path || '');
  if (address.type === 'file' || address.scheme === 'file') return encodePath(path);

  const segments = [];
  const resourceName = address.resource?.name;
  if (resourceName != null && resourceName !== '' && address.resource?.type !== 'none' && address.resource?.type !== 'bucket') {
    segments.push(encodePathSegment(resourceName));
  }
  if (path) {
    segments.push(...path.split('/').filter(Boolean).map(encodePathSegment));
  }
  return segments.length > 0 ? `/${segments.join('/')}` : '';
}

function userInfo(address, options = {}) {
  if (!options.includeCredentials) return '';
  const credentials = address.credentials || {};
  const username = credentials.username || '';
  const password = credentials.password || '';
  if (!username && !password) return '';
  const encodedUser = encodeURIComponent(username);
  const encodedPassword = password ? `:${encodeURIComponent(password)}` : '';
  return `${encodedUser}${encodedPassword}@`;
}

export function valuesFor(value) {
  return Array.isArray(value) ? value : [value];
}

function normalizeBoolean(value) {
  const text = String(value).toLowerCase();
  if (['true', '1', 'yes'].includes(text)) return 'true';
  if (['false', '0', 'no'].includes(text)) return 'false';
  return String(value);
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}

function sensitiveKeys(definition) {
  return new Set((definition?.redaction?.sensitive_keys || []).map(normalizeKey));
}

export function normalizeQueryValue(key, value, definition, options = {}) {
  if (!options.includeSensitive && sensitiveKeys(definition).has(normalizeKey(key))) return '***';
  const rule = definition?.query_parameters?.[key];
  if (rule?.type === 'boolean') return normalizeBoolean(value);
  if (rule?.type === 'number') return normalizeNumber(value);
  return String(value);
}

function queryText(address, definition, options = {}) {
  const query = address.query || {};
  const parts = [];
  for (const key of Object.keys(query).sort()) {
    for (const value of valuesFor(query[key])) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(normalizeQueryValue(key, value, definition, options))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function fragmentText(address, options = {}) {
  if (options.includeFragment === false || address.fragment == null || address.fragment === '') return '';
  return `#${encodeURIComponent(String(address.fragment))}`;
}

function canonicalizeAddress(address, options = {}) {
  const definition = definitionFor(address, options);
  const scheme = canonicalSchemeForAddress(address, definition);
  const authority = authorityText(address, definition, options);
  const path = pathText(address);
  const query = queryText(address, definition, options);
  const fragment = fragmentText(address, options);

  if (scheme === 'file' && !authority) {
    return path.startsWith('/') ? `file://${path}${query}${fragment}` : `file:${path}${query}${fragment}`;
  }

  if (!authority) return `${scheme}:${path}${query}${fragment}`;
  return `${scheme}://${userInfo(address, options)}${authority}${path}${query}${fragment}`;
}

export function canonicalize(input, options = {}) {
  const address = typeof input === 'string' ? parseOrThrow(input, options) : input;
  return canonicalizeAddress(address, options);
}

export function equivalent(left, right, options = {}) {
  return canonicalize(left, options) === canonicalize(right, options);
}
