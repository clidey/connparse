function normalizeKey(key) {
  return String(key || '').trim().toLowerCase();
}

function safeDecodeKey(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sensitiveKeys(definition) {
  return new Set((definition?.redaction?.sensitive_keys || []).map(normalizeKey));
}

function safeCredentialKeys(definition) {
  return new Set((definition?.redaction?.safe_credentials || []).map(normalizeKey));
}

function isSensitiveKey(key, definition) {
  return sensitiveKeys(definition).has(normalizeKey(key));
}

function maskUserInfo(value) {
  const schemeMarker = value.indexOf('://');
  const authorityStart = schemeMarker === -1 ? 0 : schemeMarker + 3;
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
  if (schemeMarker === -1 && !userInfo.includes(':')) return value;
  const host = authority.slice(at + 1);
  const colon = userInfo.indexOf(':');
  const maskedUserInfo = colon === -1 ? userInfo : `${userInfo.slice(0, colon)}:***`;
  return `${value.slice(0, authorityStart)}${maskedUserInfo}@${host}${value.slice(authorityEnd)}`;
}

function maskSensitiveQuery(value, definition) {
  return value.replace(/([?&])([^=&#?]+)=([^&#]*)/g, (match, prefix, rawKey) => {
    const key = safeDecodeKey(rawKey);
    return isSensitiveKey(key, definition) ? `${prefix}${rawKey}=***` : match;
  });
}

function maskSensitiveKeyValues(value, definition) {
  return value.replace(/(^|[;,&\s])([^=;,&\s]+)=([^;,&\s]*)/g, (match, prefix, rawKey) => {
    return isSensitiveKey(rawKey, definition) ? `${prefix}${rawKey}=***` : match;
  });
}

function sanitizeObject(value, definition) {
  const output = {};
  for (const [key, item] of Object.entries(value || {})) {
    output[key] = isSensitiveKey(key, definition) ? '***' : item;
  }
  return output;
}

function sanitizeCredentials(credentials, definition) {
  const safeKeys = safeCredentialKeys(definition);
  const output = {};
  for (const [key, value] of Object.entries(credentials || {})) {
    output[key] = safeKeys.has(normalizeKey(key)) ? value : '***';
  }
  return output;
}

export function mask(input, definition) {
  return maskSensitiveKeyValues(maskSensitiveQuery(maskUserInfo(String(input)), definition), definition);
}

export function sanitize(address, definition) {
  return {
    ...address,
    credentials: sanitizeCredentials(address?.credentials, definition),
    query: sanitizeObject(address?.query, definition),
    options: sanitizeObject(address?.options, definition),
    raw: address?.safe || ''
  };
}
