import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../src/index.js';

const expectedExports = [
  'canonicalize',
  'createRegistry',
  'defaultRegistry',
  'equivalent',
  'getBuiltInDefinitions',
  'mask',
  'normalizeAddress',
  'parse',
  'parseDefinition',
  'parseJsonDefinition',
  'parseNormalize',
  'parseOrThrow',
  'parseYamlDefinition',
  'registerDefinition',
  'sanitize',
  'validateDefinition',
  'validateDefinitions'
];

test('public API exports stay stable', () => {
  assert.deepEqual(Object.keys(api).sort(), expectedExports.sort());
});

test('parseOrThrow returns value or throws useful error', () => {
  const value = api.parseOrThrow('postgres://localhost/app?sslmode=require');
  assert.equal(value.scheme, 'postgres');
  assert.equal(value.resource.name, 'app');

  assert.throws(() => api.parseOrThrow('postgres://localhost/app?sslmode=invalid'), /sslmode must be one of/);
});

test('canonicalize produces safe stable identity strings', () => {
  assert.equal(
    api.canonicalize('postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp'),
    'postgres://localhost/app?application_name=myapp&sslmode=require'
  );
  assert.equal(
    api.canonicalize('postgres://user:pass@localhost/app?sslkey=/tmp/client.key&sslmode=require'),
    'postgres://localhost/app?sslkey=***&sslmode=require'
  );
  assert.equal(
    api.canonicalize('postgres://user:pass@localhost/app?sslkey=/tmp/client.key&sslmode=require', {
      includeCredentials: true,
      includeSensitive: true
    }),
    'postgres://user:pass@localhost/app?sslkey=%2Ftmp%2Fclient.key&sslmode=require'
  );
});

test('canonicalize handles multi-host defaults and typed query normalization', () => {
  assert.equal(
    api.canonicalize('postgresql://host1:5432,host2:5432/somedb?target_session_attrs=any&application_name=myapp'),
    'postgres://host1,host2/somedb?application_name=myapp&target_session_attrs=any'
  );
  assert.equal(
    api.canonicalize('mongodb://LOCALHOST:27017/app?tls=1'),
    'mongodb://localhost/app?tls=true'
  );
});

test('equivalent compares canonical identities', () => {
  assert.equal(
    api.equivalent(
      'postgresql://localhost:5432/app?sslmode=require&application_name=myapp',
      'postgres://localhost/app?application_name=myapp&sslmode=require'
    ),
    true
  );
  assert.equal(api.equivalent('postgres://localhost/app', 'postgres://localhost/other'), false);
});

test('parseNormalize returns stable JSON for equivalent inputs', () => {
  const left = api.parseNormalize('postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp');
  const right = api.parseNormalize('postgres://localhost/app?application_name=myapp&sslmode=require');

  assert.equal(left.ok, true, JSON.stringify(left.errors));
  assert.equal(right.ok, true, JSON.stringify(right.errors));
  assert.deepEqual(left.value, right.value);
  assert.equal(left.value.raw, 'postgres://localhost/app?application_name=myapp&sslmode=require');
  assert.equal(left.value.safe, left.value.canonical);
  assert.deepEqual(left.value.credentials, {});
});

test('parseNormalize can include credentials and sensitive values explicitly', () => {
  const result = api.parseNormalize('postgres://user:pass@localhost/app?sslkey=/tmp/client.key', {
    includeCredentials: true,
    includeSensitive: true
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.value.credentials, { password: 'pass', username: 'user' });
  assert.equal(result.value.query.sslkey, '/tmp/client.key');
  assert.equal(result.value.canonical, 'postgres://user:pass@localhost/app?sslkey=%2Ftmp%2Fclient.key');
});

test('canonicalize and parseNormalize honor default-port and fragment options', () => {
  assert.equal(
    api.canonicalize('postgres://localhost:5432/app?sslmode=require#section', {
      includeDefaultPort: true,
      includeFragment: false
    }),
    'postgres://localhost:5432/app?sslmode=require'
  );

  const result = api.parseNormalize('postgres://localhost:5432/app?sslmode=require#section', {
    includeDefaultPort: true,
    includeFragment: false
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.value.authority, { host: 'localhost', port: 5432 });
  assert.equal(result.value.fragment, null);
  assert.equal(result.value.canonical, 'postgres://localhost:5432/app?sslmode=require');
});

test('parseNormalize preserves repeated query values in stable key order', () => {
  const result = api.parseNormalize('postgres://localhost/app?z=3&application_name=one&application_name=two&sslmode=require');

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(Object.keys(result.value.query), ['application_name', 'sslmode', 'z']);
  assert.deepEqual(result.value.query.application_name, ['one', 'two']);
  assert.equal(result.value.canonical, 'postgres://localhost/app?application_name=one&application_name=two&sslmode=require&z=3');
});

test('parseNormalize supports provider-hinted inputs and direct address normalization', () => {
  const result = api.parseNormalize('host=LOCALHOST port=5432 dbname=app user=alice password=secret application_name=myapp', {
    provider: 'postgres'
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.canonical, 'postgres://localhost/app?application_name=myapp');
  assert.deepEqual(result.value.credentials, {});
  assert.equal(result.value.query.application_name, 'myapp');

  const address = api.parseOrThrow('postgresql://LOCALHOST:5432/app?sslmode=require');
  assert.deepEqual(
    api.normalizeAddress(address),
    api.parseNormalize('postgres://localhost/app?sslmode=require').value
  );
});

test('mask redacts URI credentials, query secrets, and key-value secrets', () => {
  assert.equal(api.mask('postgres://user:pass@localhost/app'), 'postgres://user:***@localhost/app');
  assert.equal(api.mask('user:pass@localhost/app'), 'user:***@localhost/app');
  assert.equal(api.mask('https://example.com?api_key=secret&x=1'), 'https://example.com?api_key=secret&x=1');
  assert.equal(api.mask('host=db password=secret token=abc'), 'host=db password=secret token=abc');
  assert.equal(
    api.mask('https::addr=localhost;tls_roots_password=secret;', {
      redaction: { sensitive_keys: ['tls_roots_password'] }
    }),
    'https::addr=localhost;tls_roots_password=***;'
  );
});

test('mask only redacts non-userinfo keys declared by the spec', () => {
  const definition = { redaction: { sensitive_keys: ['api_key', 'password'] } };
  assert.equal(api.mask('https://example.com?api_key=secret&x=1', definition), 'https://example.com?api_key=***&x=1');
  assert.equal(api.mask('host=db password=secret token=abc', definition), 'host=db password=*** token=abc');
});

test('sanitize preserves safe credential fields and masks spec-defined sensitive keys', () => {
  const address = api.parseOrThrow('postgres://user:pass@localhost/app?sslkey=/tmp/key.pem');
  const definition = api.defaultRegistry.getById('postgres');
  const sanitized = api.sanitize(address, definition);
  assert.deepEqual(sanitized.credentials, { username: 'user', password: '***' });
  assert.equal(sanitized.query.sslkey, '***');
  assert.equal(sanitized.raw, sanitized.safe);
});
