import { baseAddress, credentialsFromParts, parseHostPort, parseHierarchical } from './common.js';

export function parseMemcached(input, definition, context) {
  const raw = String(input);
  let hosts = [];
  let credentials = {};
  let query = {};
  let tls = false;

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) {
    const parts = parseHierarchical(raw);
    hosts = parts.hosts.map((entry) => ({
      host: entry.host,
      port: entry.port ?? definition.defaults?.port ?? 11211
    }));
    credentials = credentialsFromParts(parts);
    query = parts.query;
    tls = parts.scheme === 'memcacheds';
  } else {
    hosts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const parsed = parseHostPort(part);
        return { host: parsed.host, port: parsed.port ?? definition.defaults?.port ?? 11211 };
      });
  }

  return baseAddress({
    definition,
    scheme: 'memcached',
    raw: context.raw,
    safe: context.safe,
    authority: hosts.length > 1 ? { hosts } : { host: hosts[0]?.host || '', port: hosts[0]?.port ?? 11211 },
    resource: {
      type: 'none',
      name: null
    },
    path: '',
    query,
    fragment: null,
    credentials,
    options: { tls }
  });
}
