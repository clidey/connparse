import { baseAddress, credentialsFromParts, parseHostPort, parseHierarchical } from './common.js';

export function isQuestDbConfig(input) {
  return /^(http|https|tcp|tcps)::/i.test(String(input));
}

function parseConfig(input, definition, context) {
  const raw = String(input);
  const [protocol, body = ''] = raw.split('::');
  const entries = body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator === -1 ? [part, ''] : [part.slice(0, separator), part.slice(separator + 1)];
    });
  const grouped = {};
  for (const [key, value] of entries) {
    if (Object.prototype.hasOwnProperty.call(grouped, key)) {
      grouped[key] = Array.isArray(grouped[key]) ? [...grouped[key], value] : [grouped[key], value];
    } else {
      grouped[key] = value;
    }
  }

  const defaultPort = ['http', 'https'].includes(protocol) ? 9000 : 9009;
  const addrs = Array.isArray(grouped.addr) ? grouped.addr : grouped.addr ? [grouped.addr] : [];
  const hosts = addrs.map((addr) => {
    const parsed = parseHostPort(addr);
    return { host: parsed.host, port: parsed.port ?? defaultPort };
  });

  const query = { ...grouped };
  delete query.addr;
  const credentials = {};
  for (const key of ['username', 'password', 'token']) {
    if (query[key]) {
      credentials[key] = String(query[key]);
      delete query[key];
    }
  }

  return baseAddress({
    definition,
    scheme: 'questdb',
    raw: context.raw,
    safe: context.safe,
    authority: hosts.length > 1 ? { hosts } : { host: hosts[0]?.host || '', port: hosts[0]?.port ?? defaultPort },
    resource: {
      type: 'endpoint',
      name: null
    },
    path: '',
    query,
    fragment: null,
    credentials,
    options: {
      ingestion: true,
      protocol,
      tls: ['https', 'tcps'].includes(protocol)
    }
  });
}

export function parseQuestDb(input, definition, context) {
  const raw = String(input);
  if (isQuestDbConfig(raw)) return parseConfig(raw, definition, context);

  const parts = parseHierarchical(raw);
  const [database = null, ...rest] = parts.pathSegments;
  return baseAddress({
    definition,
    scheme: parts.scheme,
    raw: context.raw,
    safe: context.safe,
    authority: {
      host: parts.host,
      port: parts.port ?? definition.defaults?.port ?? 8812
    },
    resource: {
      type: 'database',
      name: database
    },
    path: rest.join('/'),
    query: parts.query,
    fragment: parts.fragment,
    credentials: credentialsFromParts(parts),
    options: { compatible_with: 'postgres' }
  });
}
