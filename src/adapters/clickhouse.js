import { baseAddress, credentialsFromParts, parseHierarchical } from './common.js';
import { parseJdbc } from './jdbc.js';

function defaultPort(protocol, defaults = {}) {
  if (protocol === 'https') return 8443;
  if (protocol === 'http') return 8123;
  if (protocol === 'grpc') return 9100;
  return defaults.port || 9000;
}

export function isClickHouseJdbc(input) {
  return /^jdbc:(clickhouse|ch)(?::[a-z]+)?:\/\//i.test(String(input));
}

export function parseClickHouse(input, definition, context) {
  const raw = String(input);
  if (isClickHouseJdbc(raw)) return parseJdbc(raw, definition, context);

  const source = /^https?:\/\//i.test(raw) ? raw : raw.replace(/^clickhouse:/i, 'clickhouse:');
  const parts = parseHierarchical(source);
  const [database = null, ...rest] = parts.pathSegments;
  const protocol = ['http', 'https'].includes(parts.scheme) ? parts.scheme : 'native';
  const port = parts.port ?? defaultPort(protocol, definition.defaults);

  return baseAddress({
    definition,
    scheme: parts.scheme === 'ch' ? 'clickhouse' : parts.scheme,
    raw: context.raw,
    safe: context.safe,
    authority: {
      host: parts.host,
      port
    },
    resource: {
      type: 'database',
      name: database
    },
    path: rest.join('/'),
    query: parts.query,
    fragment: parts.fragment,
    credentials: credentialsFromParts(parts),
    options: { protocol }
  });
}
