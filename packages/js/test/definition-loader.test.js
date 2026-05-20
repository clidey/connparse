import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getBuiltInDefinitions, parse, parseDefinition, validateDefinition } from '../src/index.js';
import { adapters } from '../src/adapters/index.js';

const repoRoot = new URL('../../..', import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);
const definitionsRoot = new URL('specs/definitions/', repoRoot);
const definitionFiles = readdirSync(definitionsRoot).filter((file) => file.endsWith('.yaml')).sort();

test('loads YAML CPDS definitions', () => {
  const text = readFileSync(new URL('../../../specs/definitions/postgres.yaml', import.meta.url), 'utf8');
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
    const text = readFileSync(new URL(file, definitionsRoot), 'utf8');
    const definition = parseDefinition(text, 'yaml');
    yamlIds.add(definition.id);

    const builtIn = builtInsById.get(definition.id);
    assert.ok(builtIn, `${definition.id} has no built-in definition`);
    assert.deepEqual(builtIn, definition, `${definition.id} built-in drift`);
  }

  for (const id of builtInsById.keys()) {
    assert.equal(yamlIds.has(id), true, `${id} has no YAML definition example`);
  }
});

test('generated definition files are current', () => {
  assert.doesNotThrow(() => {
    execFileSync('node', ['tools/generate-definitions.mjs', '--check'], {
      cwd: repoRootPath,
      stdio: 'pipe'
    });
  });
});

test('CPDS verifier accepts current definitions with strict suggestions', () => {
  assert.doesNotThrow(() => {
    execFileSync('node', ['tools/verify-definitions.mjs', '--strict-suggestions'], {
      cwd: repoRootPath,
      stdio: 'pipe'
    });
  });
});

test('generated outputs use typed/native definitions', () => {
  const jsOutput = readFileSync(new URL('packages/js/src/builtin-definitions.js', repoRoot), 'utf8');
  assert.match(jsOutput, /@type \{ReadonlyArray<import\('\.\/index\.js'\)\.ConnparseDefinition>\}/);
  assert.match(jsOutput, /Object\.freeze/);

  const goOutput = readFileSync(new URL('packages/go/builtin_definitions.go', repoRoot), 'utf8');
  assert.match(goOutput, /func BuiltInDefinitions\(\) \[\]Definition/);
  assert.match(goOutput, /Definition\{/);
  assert.doesNotMatch(goOutput, /encoding\/json|builtInDefinitionsJSON|json\.Unmarshal/);

  const javaOutput = readFileSync(new URL('packages/java/src/main/java/com/clidey/connparse/BuiltInDefinitions.java', repoRoot), 'utf8');
  assert.match(javaOutput, /static List<Definition> builtInDefinitions\(\)/);
  assert.match(javaOutput, /new Definition\(/);
  assert.doesNotMatch(javaOutput, /json\.loads|from_str|BUILT_IN_DEFINITIONS_JSON/);

  const pythonOutput = readFileSync(new URL('packages/python/src/connparse/builtin_definitions.py', repoRoot), 'utf8');
  assert.match(pythonOutput, /BUILT_IN_DEFINITIONS: list\[ConnparseDefinition\]/);
  assert.doesNotMatch(pythonOutput, /json\.loads|import json/);

  const rustOutput = readFileSync(new URL('packages/rust/src/builtin_definitions.rs', repoRoot), 'utf8');
  assert.match(rustOutput, /pub fn built_in_definitions\(\) -> Vec<Definition>/);
  assert.match(rustOutput, /Definition \{/);
  assert.doesNotMatch(rustOutput, /BUILT_IN_DEFINITIONS_JSON|serde_json::from_str/);
});

test('generator rejects invalid CPDS inputs before writing outputs', () => {
  assertGeneratorFails(
    {
      'one.yaml': minimalDefinition({ id: 'one', schemes: ['dup'] }),
      'two.yaml': minimalDefinition({ id: 'two', schemes: ['dup'] })
    },
    /scheme dup already declared/
  );

  assertGeneratorFails(
    {
      'bad-query.yaml': minimalDefinition({
        id: 'bad-query',
        schemes: ['bad-query'],
        query_parameters: { x: { type: 'object' } }
      })
    },
    /query_parameters\.x\.type/
  );

  assertGeneratorFails(
    {
      'bad-port.yaml': minimalDefinition({
        id: 'bad-port',
        schemes: ['bad-port'],
        defaults: { port: 70000 }
      })
    },
    /defaults\.port/
  );

  assertGeneratorFails(
    {
      'bad-range.yaml': minimalDefinition({
        id: 'bad-range',
        schemes: ['bad-range'],
        validation: { port_range: { min: 100, max: 10 } }
      })
    },
    /validation\.port_range/
  );

  assertGeneratorFails(
    {
      'provider-a.yaml': minimalDefinition({
        id: 'provider-a',
        provider_aliases: ['shared-provider'],
        schemes: ['provider-a']
      }),
      'provider-b.yaml': minimalDefinition({
        id: 'shared-provider',
        schemes: ['provider-b']
      })
    },
    /provider name shared-provider already declared/
  );

  assertGeneratorFails(
    {
      'bad-semantic.yaml': minimalDefinition({
        id: 'bad-semantic',
        schemes: ['bad-semantic'],
        semantic_fields: {
          ssl_mode: {
            sources: [
              { from_query: 'sslmode', from_option: 'tls' }
            ]
          }
        }
      })
    },
    /semantic_fields\.ssl_mode\.sources items must declare exactly one source/
  );

  assertGeneratorFails(
    {
      'bad-redaction.yaml': minimalDefinition({
        id: 'bad-redaction',
        schemes: ['bad-redaction'],
        redaction: { sensitive_keys: 'password' }
      })
    },
    /redaction\.sensitive_keys/
  );
});

test('CPDS verifier reports missing required keys and suggested redaction', () => {
  assertVerifierFails(
    {
      'missing-resource.yaml': minimalDefinition({
        id: 'missing-resource',
        schemes: ['missing-resource'],
        resource: undefined
      })
    },
    ['--strict-suggestions'],
    /missing required key resource/
  );

  assertVerifierFails(
    {
      'missing-redaction.yaml': minimalDefinition({
        id: 'missing-redaction',
        schemes: ['missing-redaction'],
        redaction: undefined
      })
    },
    ['--strict-suggestions'],
    /missing suggested key redaction/
  );

  const warningOnly = runVerifier(
    {
      'missing-redaction.yaml': minimalDefinition({
        id: 'missing-redaction',
        schemes: ['missing-redaction'],
        redaction: undefined
      })
    },
    []
  );
  assert.equal(warningOnly.status, 0);
  assert.match(String(warningOnly.stderr), /missing suggested key redaction/);
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
      readFileSync(new URL(item.file, definitionsRoot), 'utf8'),
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

function assertGeneratorFails(files, pattern) {
  const dir = mkdtempSync(join(tmpdir(), 'connparse-generator-'));
  const definitionsDir = join(dir, 'definitions');
  mkdirSync(definitionsDir);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(definitionsDir, name), text);
  }

  let error;
  try {
    execFileSync(
      'node',
      [
        'tools/generate-definitions.mjs',
        '--definitions-dir',
        definitionsDir,
        '--js-output',
        join(dir, 'builtin-definitions.js'),
        '--go-output',
        join(dir, 'builtin_definitions.go')
      ],
      { cwd: repoRootPath, stdio: 'pipe' }
    );
  } catch (caught) {
    error = caught;
  }

  assert.ok(error, 'generator should fail');
  assert.match(String(error.stderr), pattern);
}

function assertVerifierFails(files, args, pattern) {
  const result = runVerifier(files, args);
  assert.notEqual(result.status, 0, 'verifier should fail');
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

function runVerifier(files, args) {
  const dir = mkdtempSync(join(tmpdir(), 'connparse-verifier-'));
  const definitionsDir = join(dir, 'definitions');
  mkdirSync(definitionsDir);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(definitionsDir, name), text);
  }

  const result = spawnSync(
    'node',
    [
      'tools/verify-definitions.mjs',
      '--definitions-dir',
      definitionsDir,
      ...args
    ],
    { cwd: repoRootPath, encoding: 'utf8' }
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function minimalDefinition(overrides = {}) {
  const definition = {
    id: 'sample',
    name: 'Sample',
    type: 'database',
    schemes: ['sample'],
    adapter: 'generic-uri',
    credentials: { username: true, password: true },
    resource: { type: 'database', required: false },
    path: { type: 'object_path', required: false },
    query_parameters: {},
    validation: {},
    redaction: { safe_credentials: ['username'], sensitive_keys: ['password'] },
    ...overrides
  };
  return JSON.stringify(definition);
}

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

  assert.throws(
    () =>
      validateDefinition({
        id: 'bad-semantic',
        type: 'database',
        schemes: ['bad-semantic'],
        adapter: 'generic-uri',
        resource: { type: 'database', required: false },
        path: { type: 'object_path', required: false },
        query_parameters: {},
        semantic_fields: {
          ssl_mode: {
            sources: [{ from_query: 'sslmode', from_option: 'tls' }]
          }
        },
        validation: {}
      }),
    /exactly one source/
  );
});
