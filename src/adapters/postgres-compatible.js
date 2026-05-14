import { authorityFromParts, baseAddress, credentialsFromParts, parseHostPort, parseHierarchical } from './common.js';
import { parseJdbc } from './jdbc.js';

function splitConninfo(input) {
  const pairs = [];
  const text = String(input).trim();
  let index = 0;

  while (index < text.length) {
    while (/\s/.test(text[index])) index += 1;
    let key = '';
    while (index < text.length && text[index] !== '=') {
      key += text[index];
      index += 1;
    }
    if (!key || text[index] !== '=') break;
    index += 1;

    let value = '';
    if (text[index] === "'") {
      index += 1;
      while (index < text.length) {
        if (text[index] === '\\' && index + 1 < text.length) {
          value += text[index + 1];
          index += 2;
          continue;
        }
        if (text[index] === "'") {
          index += 1;
          break;
        }
        value += text[index];
        index += 1;
      }
    } else {
      while (index < text.length && !/\s/.test(text[index])) {
        value += text[index];
        index += 1;
      }
    }
    pairs.push([key.trim(), value]);
  }

  return Object.fromEntries(pairs.filter(([key]) => key));
}

function parseHostLists(hostValue, portValue, defaults = {}) {
  const hosts = String(hostValue || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  const ports = String(portValue || '')
    .split(',')
    .map((port) => port.trim());

  if (hosts.length > 1) {
    return {
      hosts: hosts.map((host, index) => ({
        host,
        port: ports[index] ? Number(ports[index]) : defaults.port || null
      }))
    };
  }

  const parsed = parseHostPort(hosts[0] || '');
  return {
    host: parsed.host,
    port: parsed.port ?? (ports[0] ? Number(ports[0]) : defaults.port || null)
  };
}

function parseConninfo(input, definition, context) {
  const fields = splitConninfo(input);
  const authority = parseHostLists(fields.host || fields.hostaddr || '', fields.port || '', definition.defaults);
  const credentials = {};
  if (fields.user) credentials.username = fields.user;
  if (fields.password) credentials.password = fields.password;

  const query = { ...fields };
  for (const key of ['host', 'hostaddr', 'port', 'dbname', 'user', 'password']) delete query[key];

  return baseAddress({
    definition,
    scheme: definition.schemes?.[0] || 'postgres',
    raw: context.raw,
    safe: context.safe,
    authority,
    resource: {
      type: definition.resource?.type || 'database',
      name: fields.dbname || null
    },
    path: '',
    query,
    fragment: null,
    credentials,
    options: { conninfo: true }
  });
}

export function parsePostgresCompatible(input, definition, context) {
  const raw = String(input);
  if (/^jdbc:postgresql:\/\//i.test(raw)) return parseJdbc(raw, definition, context);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) {
    const parts = parseHierarchical(raw);
    const [database = null, ...rest] = parts.pathSegments;
    return baseAddress({
      definition,
      scheme: parts.scheme,
      raw: context.raw,
      safe: context.safe,
      authority: authorityFromParts(parts, definition.defaults),
      resource: {
        type: definition.resource?.type || 'database',
        name: database
      },
      path: rest.join('/'),
      query: parts.query,
      fragment: parts.fragment,
      credentials: credentialsFromParts(parts),
      options: definition.options || {}
    });
  }
  return parseConninfo(raw, definition, context);
}
