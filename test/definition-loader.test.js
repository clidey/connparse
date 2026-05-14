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

test('custom definitions override built-in schemes for one parse call', () => {
  const definition = {
    id: 'postgres-override',
    name: 'Postgres Override',
    type: 'api',
    schemes: ['postgres'],
    adapter: 'generic-uri',
    authority: { host: true, port: true },
    resource: { type: 'endpoint', required: true },
    path: { type: 'object_path', required: false },
    query_parameters: {},
    validation: { require_host: true }
  };

  const overridden = parse('postgres://example.com/endpoint', { definitions: [definition] });
  assert.equal(overridden.ok, true, JSON.stringify(overridden.errors));
  assert.equal(overridden.value.type, 'api');
  assert.equal(overridden.value.resource.type, 'endpoint');

  const normal = parse('postgres://example.com/app');
  assert.equal(normal.ok, true, JSON.stringify(normal.errors));
  assert.equal(normal.value.type, 'database');
  assert.equal(normal.value.resource.type, 'database');
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

test('YAML examples parse like built-ins for representative inputs', () => {
  const cases = [
    { id: 'postgres', file: 'postgres.yaml', input: 'postgres://user:pass@localhost/app?sslmode=require' },
    { id: 'mysql', file: 'mysql.yaml', input: 'mysql://user:pass@localhost/app?ssl-mode=REQUIRED' },
    { id: 'mariadb', file: 'mariadb.yaml', input: 'mariadb://user:pass@localhost/app' },
    { id: 'mongodb', file: 'mongodb.yaml', input: 'mongodb://user:pass@localhost/app?tls=true' },
    { id: 'redis', file: 'redis.yaml', input: 'rediss://:pass@localhost/0' },
    { id: 'sqlite', file: 'sqlite.yaml', input: 'sqlite::memory:' },
    { id: 'duckdb', file: 'duckdb.yaml', input: './sample.duckdb' },
    { id: 'clickhouse', file: 'clickhouse.yaml', input: 'jdbc:clickhouse:http://localhost:8123/default?ssl=false' },
    { id: 'memcached', file: 'memcached.yaml', input: 'memcached://localhost' },
    { id: 'elasticsearch', file: 'elasticsearch.yaml', input: 'elasticsearch+https://elastic:secret@localhost:9200/logs' },
    { id: 'cockroachdb', file: 'cockroachdb.yaml', input: 'cockroach://root@localhost:26257/defaultdb?sslmode=disable' },
    { id: 'questdb', file: 'questdb.yaml', input: 'https::addr=localhost:9000;auto_flush=on;' },
    { id: 'yugabytedb', file: 'yugabytedb.yaml', input: 'yugabyte://user:pass@localhost:5433/yugabyte?ssl=true' },
    { id: 's3', file: 's3.yaml', input: 's3://bucket/key' },
    { id: 'file', file: 'file.yaml', input: './data.csv' }
  ];

  for (const item of cases) {
    const yamlDefinition = parseDefinition(
      readFileSync(new URL(`../definitions/${item.file}`, import.meta.url), 'utf8'),
      'yaml'
    );
    const builtInResult = parse(item.input, { provider: ['file', 'sqlite'].includes(item.id) ? item.id : undefined });
    const yamlResult = parse(item.input, {
      definitions: [yamlDefinition],
      provider: ['file', 'sqlite'].includes(item.id) ? item.id : undefined
    });

    assert.equal(builtInResult.ok, true, `${item.id} built-in failed: ${JSON.stringify(builtInResult.errors)}`);
    assert.equal(yamlResult.ok, true, `${item.id} YAML failed: ${JSON.stringify(yamlResult.errors)}`);
    assert.equal(yamlResult.value.type, builtInResult.value.type, `${item.id} type mismatch`);
    assert.equal(yamlResult.value.scheme, builtInResult.value.scheme, `${item.id} scheme mismatch`);
    assert.deepEqual(yamlResult.value.resource, builtInResult.value.resource, `${item.id} resource mismatch`);
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

  assert.throws(
    () =>
      validateDefinition({
        id: 'bad-port',
        type: 'database',
        schemes: ['bad-port'],
        defaults: { port: 70000 }
      }),
    /defaults\.port/
  );

  assert.throws(
    () =>
      validateDefinition({
        id: 'bad-required',
        type: 'database',
        schemes: ['bad-required'],
        resource: { type: 'database', required: 'yes' }
      }),
    /resource\.required/
  );
});
