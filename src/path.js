export function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function trimLeadingSlash(pathname) {
  return pathname.startsWith('/') ? pathname.slice(1) : pathname;
}

export function splitPath(pathname) {
  const withoutLeading = trimLeadingSlash(pathname || '');
  if (!withoutLeading) return [];
  return withoutLeading.split('/').map(safeDecode);
}

export function basename(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : pathname;
}

export function looksLikeFilePath(input) {
  return (
    input.startsWith('/') ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input.startsWith('~/') ||
    /^[A-Za-z]:[\\/]/.test(input)
  );
}
