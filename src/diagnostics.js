export function diagnostic(code, message, path) {
  const value = { code, message };
  if (path) value.path = path;
  return value;
}

export function fail(code, message, path) {
  return {
    ok: false,
    value: null,
    errors: [diagnostic(code, message, path)],
    warnings: []
  };
}
