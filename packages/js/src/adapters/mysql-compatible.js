import { parseGenericUri } from './generic-uri.js';
import { parseJdbc } from './jdbc.js';

export function parseMySqlCompatible(input, definition, context) {
  const raw = String(input);
  if (/^jdbc:(mysql|mariadb)(?::[a-z-]+)?:\/\//i.test(raw)) return parseJdbc(raw, definition, context);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) return parseGenericUri(raw, definition, context);

  // MySQL Shell documents URI-like strings where the scheme is optional.
  return parseGenericUri(`${definition.schemes?.[0] || 'mysql'}://${raw}`, definition, {
    ...context,
    safe: context.safe
  });
}
