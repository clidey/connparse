import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getBuiltInDefinitions, parse, parseDefinition, validateDefinition } from '../src/index.js';
import { adapters } from '../src/adapters/index.js';

const definitionFiles = [
  'clickhouse.yaml',
  'cockroachdb.yaml',
  'duckdb.yaml',
  'elasticsearch.yaml',
  'file.yaml',
  'mariadb.yaml',
  'memcached.yaml',
  'mongodb.yaml',
  'mysql.yaml',
  'postgres.yaml',
  'questdb.yaml',
  'redis.yaml',
  's3.yaml',
  'sqlite.yaml',
  'yugabytedb.yaml'
];

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

test('validates built-in definitions', () => {
  for (const definition of getBuiltInDefinitions()) {
    assert.equal(validateDefinition(definition), definition);
  }
});

test('YAML definition examples stay aligned with built-in definitions', () => {
  const builtInsById = new Map(getBuiltInDefinitions().map((definition) => [definition.id, definition]));
  const yamlIds = new Set();

  for (const file of definitionFiles) {
    const text = readFileSync(new URL(`../definitions/${file}`, import.meta.url), 'utf8');
    const definition = parseDefinition(text, 'yaml');
    yamlIds.add(definition.id);

    const builtIn = builtInsById.get(definition.id);
    assert.ok(builtIn, `${definition.id} has no built-in definition`);
    assert.equal(definition.adapter || 'generic-uri', builtIn.adapter || 'generic-uri', `${definition.id} adapter drift`);
    assert.deepEqual(definition.schemes, builtIn.schemes, `${definition.id} scheme drift`);
    assert.equal(definition.type, builtIn.type, `${definition.id} type drift`);
  }

  for (const id of builtInsById.keys()) {
    assert.equal(yamlIds.has(id), true, `${id} has no YAML definition example`);
  }
});

test('rejects invalid CPDS definitions', () => {
  assert.throws(
    () =>
      validateDefinition(
        {
        id: 'bad',
        type: 'database',
        schemes: ['bad'],
        adapter: 'missing-adapter'
        },
        adapters
      ),
    /unknown adapter/
  );

  assert.throws(
    () =>
      validateDefinition({
        id: 'bad-query',
        type: 'database',
        schemes: ['bad-query'],
        query_parameters: {
          x: { type: 'object' }
        }
      }),
    /must be string, boolean, or number/
  );
});
