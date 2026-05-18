import {
  baseAddress,
  credentialsFromParts,
  parseHierarchical
} from './common.js';

function accountFromHost(host) {
  return String(host || '').split('.')[0] || '';
}

export function parseObjectStorage(input, definition, context) {
  const parts = parseHierarchical(input);
  const scheme = parts.scheme;
  const segments = [...parts.pathSegments];
  const resourceType = definition.resource?.type || 'container';
  const authority = {};
  let resourceName = null;
  let path = '';
  let credentials = credentialsFromParts(parts);

  if (scheme === 'gs' || (scheme === 'gcs' && parts.host !== 'storage.googleapis.com')) {
    resourceName = parts.host;
    path = segments.join('/');
    authority.bucket = resourceName;
  } else if ((scheme === 'gcs' || scheme === 'https') && parts.host === 'storage.googleapis.com') {
    resourceName = segments.shift() || null;
    path = segments.join('/');
    authority.bucket = resourceName || '';
  } else if (scheme === 'abfs' || scheme === 'abfss') {
    resourceName = parts.username || null;
    path = segments.join('/');
    authority.host = parts.host;
    authority.account = accountFromHost(parts.host);
    credentials = {};
  } else {
    resourceName = segments.shift() || null;
    path = segments.join('/');
    authority.host = parts.host;
    authority.account = accountFromHost(parts.host);
  }

  if (parts.query.project || parts.query.project_id || parts.query.projectId) {
    authority.project = String(parts.query.project || parts.query.project_id || parts.query.projectId);
  }

  return baseAddress({
    definition,
    scheme,
    raw: context.raw,
    safe: context.safe,
    authority,
    resource: {
      type: resourceType,
      name: resourceName
    },
    path,
    query: parts.query,
    fragment: parts.fragment,
    credentials,
    options: {
      source_scheme: scheme,
      tls: scheme === 'https' || scheme === 'abfss'
    }
  });
}
