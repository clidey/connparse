const SENSITIVE_QUERY_KEYS = new Set([
  'access_key',
  'accesskey',
  'access_key_id',
  'api_key',
  'apikey',
  'aws_access_key_id',
  'password',
  'secret',
  'secret_key',
  'secretaccesskey',
  'token'
]);

function maskUserInfo(value) {
  const schemeMarker = value.indexOf('://');
  if (schemeMarker === -1) return value;

  const authorityStart = schemeMarker + 3;
  const authorityEndCandidates = ['/', '?', '#']
    .map((char) => {
      const index = value.indexOf(char, authorityStart);
      return index === -1 ? value.length : index;
    });
  const authorityEnd = Math.min(...authorityEndCandidates);
  const authority = value.slice(authorityStart, authorityEnd);
  const at = authority.lastIndexOf('@');
  if (at === -1) return value;

  const userInfo = authority.slice(0, at);
  const host = authority.slice(at + 1);
  const colon = userInfo.indexOf(':');
  const maskedUserInfo = colon === -1 ? userInfo : `${userInfo.slice(0, colon)}:***`;
  return `${value.slice(0, authorityStart)}${maskedUserInfo}@${host}${value.slice(authorityEnd)}`;
}

function maskSensitiveQuery(value) {
  return value.replace(/([?&])([^=&#]+)=([^&#]*)/g, (match, prefix, rawKey) => {
    const key = decodeURIComponent(rawKey).toLowerCase();
    return SENSITIVE_QUERY_KEYS.has(key) ? `${prefix}${rawKey}=***` : match;
  });
}

function maskSensitiveKeyValues(value) {
  return value.replace(/(^|[;,&\s])([^=;,&\s]+)=([^;,&\s]*)/g, (match, prefix, rawKey) => {
    const key = rawKey.trim().toLowerCase();
    return SENSITIVE_QUERY_KEYS.has(key) ? `${prefix}${rawKey}=***` : match;
  });
}

export function mask(input) {
  return maskSensitiveKeyValues(maskSensitiveQuery(maskUserInfo(String(input))));
}
