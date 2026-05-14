import {
  applyDefaultPort,
  baseAddress,
  credentialsFromParts,
  parseHierarchical
} from './common.js';

export function parseRedis(input, definition, context) {
  const parts = parseHierarchical(input);
  const [database = null] = parts.pathSegments;
  const authority = applyDefaultPort(
    {
      host: parts.host,
      port: parts.port
    },
    definition.defaults
  );

  return baseAddress({
    definition,
    scheme: parts.scheme,
    raw: context.raw,
    safe: context.safe,
    authority,
    resource: {
      type: definition.resource?.type || 'database_index',
      name: database
    },
    path: '',
    query: parts.query,
    fragment: parts.fragment,
    credentials: credentialsFromParts(parts),
    options: { tls: parts.scheme === 'rediss' }
  });
}
