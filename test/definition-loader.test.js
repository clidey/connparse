import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, parseDefinition } from '../src/index.js';

test('loads YAML CPDS definitions', () => {
  const text = readFileSync(new URL('../definitions/postgres.yaml', import.meta.url), 'utf8');
  const definition = parseDefinition(text, 'yaml');
  assert.equal(definition.id, 'postgres');
  assert.deepEqual(definition.schemes, ['postgres', 'postgresql']);
  assert.equal(definition.defaults.port, 5432);
  assert.equal(definition.query_parameters.sslmode.allowed[3], 'require');
});

test('loads empty YAML maps', () => {
  const definition = parseDefinition(
    `
id: tiny
name: Tiny
type: api
schemes:
  - tiny
adapter: generic-uri
authority: {}
resource:
  type: endpoint
  required: false
path:
  type: object_path
  required: false
query_parameters: {}
validation: {}
`,
    'yaml'
  );

  assert.deepEqual(definition.authority, {});
  assert.deepEqual(definition.query_parameters, {});
  assert.deepEqual(definition.validation, {});
});

test('uses custom JSON definitions', () => {
  const definition = parseDefinition(
    JSON.stringify({
      id: 'custom',
      name: 'Custom',
      type: 'api',
      schemes: ['custom'],
      adapter: 'generic-uri',
      authority: { host: true, port: true },
      resource: { type: 'endpoint', required: true },
      path: { type: 'object_path', required: false },
      query_parameters: {},
      validation: { require_host: true }
    }),
    'json'
  );

  const result = parse('custom://example.com/resource/path', { definitions: [definition] });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.type, 'api');
  assert.equal(result.value.resource.name, 'resource');
  assert.equal(result.value.path, 'path');
});
