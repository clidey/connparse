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
  } else if (/^sqlite:\/\//i.test(raw)) {
    const url = fromUrl(new URL(raw), raw);
    path = safeDecode(url.pathname);
    query = url.query;
    fragment = url.fragment;
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
