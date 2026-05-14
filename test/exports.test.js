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
  assert.equal(api.mask('https://example.com?api_key=secret&x=1'), 'https://example.com?api_key=***&x=1');
  assert.equal(api.mask('host=db password=secret token=abc'), 'host=db password=*** token=***');
});
