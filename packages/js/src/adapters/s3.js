import { baseAddress, fromUrl, parseHierarchical } from './common.js';

function parseS3Host(host) {
  const virtual = host.match(/^(.+)\.s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$/i);
  if (virtual) {
    return { bucket: virtual[1], region: virtual[2] || '' };
  }

  const pathStyle = host.match(/^s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$/i);
  if (pathStyle) {
    return { bucket: '', region: pathStyle[1] || '' };
  }

  return { bucket: '', region: '' };
}

export function isS3HttpUrl(input) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const parsed = parseS3Host(url.hostname);
    return Boolean(parsed.bucket || url.hostname.startsWith('s3.'));
  } catch {
    return false;
  }
}

export function parseS3(input, definition, context) {
  const rawScheme = String(input).match(/^([A-Za-z][A-Za-z0-9+.-]*):/)?.[1]?.toLowerCase();
  let bucket = '';
  let key = '';
  let region = '';
  let query = {};
  let fragment = null;
  let options = {};

  if (rawScheme === 's3') {
    const parts = parseHierarchical(input);
    bucket = parts.host;
    key = parts.pathSegments.join('/');
    region = typeof parts.query.region === 'string' ? parts.query.region : '';
    query = parts.query;
    fragment = parts.fragment;
  } else {
    const parts = fromUrl(new URL(input), input);
    const hostInfo = parseS3Host(parts.host);
    region = hostInfo.region;
    query = parts.query;
    fragment = parts.fragment;
    options = { source_scheme: rawScheme };

    if (hostInfo.bucket) {
      bucket = hostInfo.bucket;
      key = parts.pathSegments.join('/');
    } else {
      const [pathBucket = '', ...rest] = parts.pathSegments;
      bucket = pathBucket;
      key = rest.join('/');
    }
  }

  return baseAddress({
    definition,
    scheme: 's3',
    raw: context.raw,
    safe: context.safe,
    authority: {
      bucket,
      region
    },
    resource: {
      type: definition.resource?.type || 'bucket',
      name: bucket || null
    },
    path: key,
    query,
    fragment,
    credentials: {},
    options
  });
}
