import { baseAddress, fromUrl } from './common.js';
import { basename, safeDecode } from '../path.js';

function stripQueryAndFragment(value) {
  let fragment = null;
  let body = value;
  const hash = body.indexOf('#');
  if (hash !== -1) {
    fragment = safeDecode(body.slice(hash + 1));
    body = body.slice(0, hash);
  }
  return { body, fragment };
}

export function parseSqlite(input, definition, context) {
  const raw = String(input);
  let path = '';
  let query = {};
  let fragment = null;
  let options = {};

  if (raw === 'sqlite::memory:' || raw === 'sqlite:///:memory:') {
    path = ':memory:';
    options = { memory: true };
  } else if (/^(sqlite|file):/i.test(raw) && !/^sqlite::memory:$/i.test(raw)) {
    const source = raw.replace(/^sqlite:file:/i, 'file:');
    if (/^file:[^/]/i.test(source)) {
      const stripped = stripQueryAndFragment(source.replace(/^file:/i, ''));
      path = stripped.body;
      fragment = stripped.fragment;
      const question = path.indexOf('?');
      if (question !== -1) {
        query = Object.fromEntries(new URLSearchParams(path.slice(question + 1)));
        path = path.slice(0, question);
      }
    } else {
      const parsedUrl = fromUrl(new URL(source), raw);
      path = safeDecode(parsedUrl.pathname);
      query = parsedUrl.query;
      fragment = parsedUrl.fragment;
    }
  } else {
    const stripped = stripQueryAndFragment(raw.replace(/^sqlite:/i, ''));
    path = stripped.body;
    fragment = stripped.fragment;
  }

  return baseAddress({
    definition,
    scheme: 'sqlite',
    raw: context.raw,
    safe: context.safe,
    authority: {},
    resource: {
      type: definition.resource?.type || 'database',
      name: path || basename(path) || null
    },
    path,
    query,
    fragment,
    credentials: {},
    options
  });
}
