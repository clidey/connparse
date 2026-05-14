import {
  authorityFromParts,
  baseAddress,
  credentialsFromParts,
  parseHierarchical
} from './common.js';

export function parseGenericUri(input, definition, context) {
  const parts = parseHierarchical(input);
  const [resourceName = null, ...rest] = parts.pathSegments;
  const authority = authorityFromParts(parts, definition.defaults);

  return baseAddress({
    definition,
    scheme: parts.scheme,
    raw: context.raw,
    safe: context.safe,
    authority,
    resource: {
      type: definition.resource?.type || 'resource',
      name: resourceName
    },
    path: rest.join('/'),
    query: parts.query,
    fragment: parts.fragment,
    credentials: credentialsFromParts(parts),
    options: {}
  });
}
