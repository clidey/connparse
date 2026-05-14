import {
  authorityFromParts,
  baseAddress,
  credentialsFromParts,
  parseHierarchical
} from './common.js';

export function parseMongoDb(input, definition, context) {
  const parts = parseHierarchical(input);
  const [database = null, ...rest] = parts.pathSegments;
  const srv = parts.scheme === 'mongodb+srv';
  const authority = authorityFromParts(parts, definition.defaults, { omitPorts: srv });

  return baseAddress({
    definition,
    scheme: parts.scheme,
    raw: context.raw,
    safe: context.safe,
    authority,
    resource: {
      type: definition.resource?.type || 'database',
      name: database
    },
    path: rest.join('/'),
    query: parts.query,
    fragment: parts.fragment,
    credentials: credentialsFromParts(parts),
    options: { srv }
  });
}
