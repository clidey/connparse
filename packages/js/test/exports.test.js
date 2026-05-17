import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../src/index.js';

const expectedExports = [
  'createRegistry',
  'defaultRegistry',
  'getBuiltInDefinitions',
  'mask',
  'parse',
  'parseDefinition',
  'parseJsonDefinition',
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
