import { baseAddress, fromUrl } from './common.js';
import { basename, safeDecode } from '../path.js';
import { parseQuery } from '../query.js';

function stripMeta(value) {
  let body = value;
  let fragment = null;
  let query = {};
  const hash = body.indexOf('#');
  if (hash !== -1) {
    fragment = safeDecode(body.slice(hash + 1));
    body = body.slice(0, hash);
  }
  const question = body.indexOf('?');
  if (question !== -1) {
    query = parseQuery(body.slice(question + 1));
    body = body.slice(0, question);
  }
  return { body, query, fragment };
}

export function looksLikeDuckDbPath(input) {
  return /\.(duckdb|ddb)([?#].*)?$/i.test(String(input));
}

export function parseDuckDb(input, definition, context) {
  const raw = String(input);
  let path = '';
  let query = {};
  let fragment = null;
  let options = {};

  if (raw === 'duckdb::memory:' || raw === ':memory:') {
    path = ':memory:';
    options = { memory: true };
  } else if (/^duckdb:\/\//i.test(raw)) {
    const url = fromUrl(new URL(raw), raw);
    path = safeDecode(url.pathname);
    query = url.query;
    fragment = url.fragment;
  } else {
    const stripped = stripMeta(raw.replace(/^duckdb:/i, ''));
    path = stripped.body;
    query = stripped.query;
    fragment = stripped.fragment;
  }

  return baseAddress({
    definition,
    scheme: 'duckdb',
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
