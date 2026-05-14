import { baseAddress, fromUrl } from './common.js';
import { safeDecode } from '../path.js';
import { parseQuery } from '../query.js';

export function parseFile(input, definition, context) {
  const raw = String(input);
  let path = raw;
  let fragment = null;
  let query = {};
  const authority = {};

  if (/^file:/i.test(raw)) {
    const url = fromUrl(new URL(raw), raw);
    path = safeDecode(url.pathname);
    fragment = url.fragment;
    query = url.query;
    if (url.host) authority.host = url.host;
  } else {
    const hash = path.indexOf('#');
    if (hash !== -1) {
      fragment = safeDecode(path.slice(hash + 1));
      path = path.slice(0, hash);
    }
    const question = path.indexOf('?');
    if (question !== -1) {
      query = parseQuery(path.slice(question + 1));
      path = path.slice(0, question);
    }
  }

  return baseAddress({
    definition,
    scheme: 'file',
    raw: context.raw,
    safe: context.safe,
    authority,
    resource: {
      type: 'none',
      name: null
    },
    path,
    query,
    fragment,
    credentials: {},
    options: {}
  });
}
