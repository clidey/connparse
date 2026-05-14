import { baseAddress, credentialsFromParts, parseHierarchical } from './common.js';

export function parseElasticsearch(input, definition, context) {
  const raw = String(input);
  let source = raw;
  if (/^elasticsearch\+https:\/\//i.test(raw)) source = raw.replace(/^elasticsearch\+https/i, 'https');
  else if (/^elasticsearch\+http:\/\//i.test(raw)) source = raw.replace(/^elasticsearch\+http/i, 'http');
  else if (/^elasticsearch:\/\//i.test(raw)) source = raw.replace(/^elasticsearch/i, 'http');
  else if (/^elastic:\/\//i.test(raw)) source = raw.replace(/^elastic/i, 'http');

  const parts = parseHierarchical(source);
  const [index = null, ...rest] = parts.pathSegments;

  const credentials = credentialsFromParts(parts);
  for (const key of ['api_key', 'apiKey', 'token']) {
    if (parts.query[key]) credentials[key === 'apiKey' ? 'api_key' : key] = String(parts.query[key]);
  }

  return baseAddress({
    definition,
    scheme: 'elasticsearch',
    raw: context.raw,
    safe: context.safe,
    authority: {
      host: parts.host,
      port: parts.port ?? definition.defaults?.port ?? 9200
    },
    resource: {
      type: 'index',
      name: index
    },
    path: rest.join('/'),
    query: parts.query,
    fragment: parts.fragment,
    credentials,
    options: {
      protocol: parts.scheme,
      tls: parts.scheme === 'https'
    }
  });
}
