import { parseQuery } from '../query.js';
import { safeDecode, splitPath } from '../path.js';

export function extractScheme(input) {
  const match = String(input).match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  return match ? match[1].toLowerCase() : null;
}

export function parseHostPort(value) {
  if (!value) return { host: '', port: null };

  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close !== -1) {
      const host = value.slice(1, close);
      const rest = value.slice(close + 1);
      return {
        host,
        port: rest.startsWith(':') && rest.slice(1) ? Number(rest.slice(1)) : null
      };
    }
  }

  const colon = value.lastIndexOf(':');
  if (colon > -1 && value.indexOf(':') === colon) {
    const possiblePort = value.slice(colon + 1);
    if (/^\d+$/.test(possiblePort)) {
      return { host: value.slice(0, colon), port: Number(possiblePort) };
    }
  }

  return { host: value, port: null };
}

export function parseHierarchical(input) {
  const raw = String(input);
  const match = raw.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);
  if (!match) {
    const url = new URL(raw);
    return fromUrl(url, raw);
  }

  const [, scheme, authorityText, pathname = '', search = '', fragment] = match;
  const at = authorityText.lastIndexOf('@');
  const userInfo = at === -1 ? '' : authorityText.slice(0, at);
  const hostText = at === -1 ? authorityText : authorityText.slice(at + 1);
  const [rawUsername = '', ...passwordParts] = userInfo.split(':');
  const rawPassword = passwordParts.join(':');
  const hosts = hostText
    .split(',')
    .filter(Boolean)
    .map((part) => parseHostPort(part));

  return {
    scheme: scheme.toLowerCase(),
    username: userInfo ? safeDecode(rawUsername) : '',
    password: passwordParts.length ? safeDecode(rawPassword) : '',
    host: hosts[0]?.host || '',
    port: hosts[0]?.port || null,
    hosts,
    pathname,
    pathSegments: splitPath(pathname),
    query: parseQuery(search),
    fragment: fragment == null ? null : safeDecode(fragment)
  };
}

export function fromUrl(url, raw = url.href) {
  const hosts = [{ host: url.hostname, port: url.port ? Number(url.port) : null }];
  return {
    scheme: url.protocol.replace(/:$/, '').toLowerCase(),
    username: safeDecode(url.username),
    password: safeDecode(url.password),
    host: url.hostname,
    port: url.port ? Number(url.port) : null,
    hosts,
    pathname: url.pathname,
    pathSegments: splitPath(url.pathname),
    query: parseQuery(url.search),
    fragment: url.hash ? safeDecode(url.hash.slice(1)) : null,
    raw
  };
}

export function credentialsFromParts(parts) {
  const credentials = {};
  if (parts.username) credentials.username = parts.username;
  if (parts.password) credentials.password = parts.password;
  return credentials;
}

export function applyDefaultPort(authority, defaults = {}) {
  if (!defaults.port) return authority;
  if (authority.port == null && authority.host) authority.port = defaults.port;
  if (Array.isArray(authority.hosts)) {
    authority.hosts = authority.hosts.map((entry) => ({
      ...entry,
      port: entry.port == null ? defaults.port : entry.port
    }));
  }
  return authority;
}

export function authorityFromParts(parts, defaults = {}, options = {}) {
  if (parts.hosts.length > 1) {
    const authority = {
      hosts: options.omitPorts
        ? parts.hosts.map((entry) => ({ host: entry.host, port: null }))
        : parts.hosts
    };
    return applyDefaultPort(authority, options.omitPorts ? {} : defaults);
  }

  const authority = {
    host: parts.host,
    port: options.omitPorts ? null : parts.port
  };
  return applyDefaultPort(authority, options.omitPorts ? {} : defaults);
}

export function baseAddress({ definition, scheme, raw, safe, authority, resource, path, query, fragment, credentials, options }) {
  return {
    scheme,
    type: definition.type || 'unknown',
    authority: authority || {},
    resource: resource || { type: 'none', name: null },
    path: path || '',
    query: query || {},
    fragment: fragment == null ? null : fragment,
    credentials: credentials || {},
    options: {
      ...(definition.options || {}),
      ...(options || {})
    },
    raw,
    safe
  };
}
