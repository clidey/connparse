import { parseHostPort } from './common.js';
import { parseRedis as parseRedisUri } from './redis.js';

export function parseRedis(input, definition, context) {
  const raw = String(input);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) return parseRedisUri(raw, definition, context);

  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const endpoints = [];
  const options = {};
  const credentials = {};

  for (const entry of entries) {
    const separator = entry.indexOf('=');
    if (separator === -1) {
      const parsed = parseHostPort(entry);
      endpoints.push({ host: parsed.host, port: parsed.port ?? definition.defaults?.port ?? 6379 });
      continue;
    }
    const key = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (key.toLowerCase() === 'password') credentials.password = value;
    else if (key.toLowerCase() === 'user' || key.toLowerCase() === 'username') credentials.username = value;
    else options[key] = value;
  }

  const database = options.defaultDatabase || options.defaultdatabase || null;
  delete options.defaultDatabase;
  delete options.defaultdatabase;

  return {
    scheme: 'redis',
    type: definition.type || 'cache',
    authority:
      endpoints.length > 1 ? { hosts: endpoints } : { host: endpoints[0]?.host || '', port: endpoints[0]?.port ?? 6379 },
    resource: {
      type: definition.resource?.type || 'database_index',
      name: database
    },
    path: '',
    query: {},
    fragment: null,
    credentials,
    options: {
      ...(definition.options || {}),
      ...options,
      tls: String(options.ssl || options.tls || '').toLowerCase() === 'true' || definition.options?.tls === true
    },
    raw: context.raw,
    safe: context.safe
  };
}
