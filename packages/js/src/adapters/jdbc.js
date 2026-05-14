import { baseAddress, credentialsFromParts, parseHierarchical } from './common.js';

const JDBC_PREFIX = /^jdbc:([a-z]+)(?::([a-z-]+))?:\/\//i;

function defaultPortFor(provider, protocol, defaults = {}) {
  if (provider === 'clickhouse' || provider === 'ch') {
    if (protocol === 'https') return 8443;
    if (protocol === 'grpc') return 9100;
    return defaults.port || 8123;
  }
  return defaults.port;
}

export function isJdbcUrl(input) {
  return /^jdbc:(postgresql|mysql|mariadb|clickhouse|ch)(?::[a-z-]+)?:\/\//i.test(String(input));
}

export function parseJdbc(input, definition, context) {
  const raw = String(input);
  const match = raw.match(JDBC_PREFIX);
  if (!match) throw new Error('Invalid JDBC URL');

  const provider = match[1].toLowerCase();
  const modeOrProtocol = match[2] ? match[2].toLowerCase() : '';
  const rest = raw.slice(match[0].length);

  let protocol = modeOrProtocol;
  let mode = '';
  if (provider === 'mariadb' && ['replication', 'loadbalance', 'sequential', 'load-balance-read'].includes(protocol)) {
    mode = protocol;
    protocol = '';
  }

  const parseScheme = provider === 'ch' ? 'clickhouse' : provider;
  const parts = parseHierarchical(`${parseScheme}://${rest}`);
  const [database = null, ...pathRest] = parts.pathSegments;

  const defaultPort = defaultPortFor(provider, protocol, definition.defaults);
  const hosts = parts.hosts.map((entry) => ({
    host: entry.host,
    port: entry.port == null && defaultPort ? defaultPort : entry.port
  }));
  const authority =
    hosts.length > 1
      ? { hosts }
      : {
          host: hosts[0]?.host || '',
          port: hosts[0]?.port ?? null
        };

  return baseAddress({
    definition,
    scheme: `jdbc:${provider === 'ch' ? 'ch' : provider}`,
    raw: context.raw,
    safe: context.safe,
    authority,
    resource: {
      type: definition.resource?.type || 'database',
      name: database
    },
    path: pathRest.join('/'),
    query: parts.query,
    fragment: parts.fragment,
    credentials: credentialsFromParts(parts),
    options: {
      jdbc: true,
      ...(protocol ? { protocol } : {}),
      ...(mode ? { mode } : {})
    }
  });
}
