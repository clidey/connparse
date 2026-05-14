import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '../src/index.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/v1.json', import.meta.url), 'utf8'));
const TOP_LEVEL_KEYS = [
  'authority',
  'credentials',
  'fragment',
  'options',
  'path',
  'query',
  'raw',
  'resource',
  'safe',
  'scheme',
  'type'
].sort();

const REQUIRED_FIXTURE_NAMES = [
  'postgres basic auth',
  'postgres multi host',
  'postgres multi host target session attributes',
  'postgres jdbc url',
  'postgres keyword value conninfo with provider hint',
  'mysql database',
  'mysql jdbc url',
  'mysql x protocol srv',
  'mysql shell uri-like string with provider hint',
  'mariadb uri',
  'mariadb jdbc sequential multi host',
  'sqlite memory',
  'sqlite file uri with provider hint',
  'duckdb file path',
  'duckdb memory',
  'duckdb uri',
  'clickhouse jdbc http',
  'clickhouse jdbc ch grpc',
  'clickhouse js http url with provider hint',
  'memcached explicit uri',
  'memcached tls uri',
  'memcached host list with provider hint',
  'redis tls',
  'redis stackexchange config with provider hint',
  'elasticsearch explicit https uri',
  'elasticsearch plain https with provider hint',
  'mongodb srv',
  'mongodb standard multi host',
  'cockroachdb postgres compatible uri',
  'cockroachdb official postgres url with provider hint',
  'cockroachdb conninfo with provider hint',
  'questdb ilp config string',
  'questdb ilp multi addr tcp',
  'questdb postgres wire uri',
  'yugabytedb smart driver uri',
  'yugabytedb official postgresql url with provider hint',
  'yugabytedb conninfo with provider hint',
  's3 uri',
  's3 virtual host',
  'file uri',
  'relative file'
];

function getPath(value, path) {
  return path.split('.').reduce((current, part) => {
    if (current == null) return undefined;
    if (/^\d+$/.test(part)) return current[Number(part)];
    return current[part];
  }, value);
}

for (const fixture of fixtures) {
  test(fixture.name, () => {
    const options = fixture.provider ? { provider: fixture.provider } : undefined;
    const result = parse(fixture.input, options);
    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
    assert.deepEqual(result.warnings, [], 'fixtures must not produce warnings');
    assert.deepEqual(Object.keys(result.value).sort(), TOP_LEVEL_KEYS, 'fixtures must preserve DSAM top-level shape');
    assert.equal(result.value.raw, fixture.input, 'raw must preserve the original input');
    assert.equal(typeof result.value.safe, 'string', 'safe must always be a string');
    assert.equal(typeof result.value.scheme, 'string', 'scheme must always be a string');
    assert.equal(typeof result.value.type, 'string', 'type must always be a string');
    assert.equal(typeof result.value.authority, 'object', 'authority must always be an object');
    assert.equal(typeof result.value.resource, 'object', 'resource must always be an object');
    assert.equal(typeof result.value.resource.type, 'string', 'resource.type must always be a string');
    assert.equal(typeof result.value.path, 'string', 'path must always be a string');
    assert.equal(typeof result.value.query, 'object', 'query must always be an object');
    assert.equal(typeof result.value.credentials, 'object', 'credentials must always be an object');
    assert.equal(typeof result.value.options, 'object', 'options must always be an object');

    for (const [path, expected] of Object.entries(fixture.expected)) {
      assert.deepEqual(getPath(result.value, path), expected, path);
    }

    const strictResult = parse(fixture.input, { ...options, strict: true });
    assert.equal(strictResult.ok, true, JSON.stringify(strictResult.errors, null, 2));
    assert.deepEqual(strictResult.warnings, [], 'strict fixtures must not produce warnings');
  });
}

test('fixture contract covers every documented v1 provider format', () => {
  const names = new Set(fixtures.map((fixture) => fixture.name));
  for (const name of REQUIRED_FIXTURE_NAMES) {
    assert.equal(names.has(name), true, `missing fixture: ${name}`);
  }
});

test('multi-host authority never duplicates top-level host or port', () => {
  for (const fixture of fixtures) {
    const result = parse(fixture.input, fixture.provider ? { provider: fixture.provider } : undefined);
    assert.equal(result.ok, true, fixture.name);
    if (Array.isArray(result.value.authority.hosts)) {
      assert.equal(Object.prototype.hasOwnProperty.call(result.value.authority, 'host'), false, fixture.name);
      assert.equal(Object.prototype.hasOwnProperty.call(result.value.authority, 'port'), false, fixture.name);
    }
  }
});

test('invalid postgres sslmode is rejected', () => {
  const result = parse('postgres://localhost/app?sslmode=definitely');
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'INVALID_QUERY_PARAMETER_VALUE');
});

test('strict mode rejects undeclared query parameters', () => {
  const result = parse('postgres://localhost/app?x=1', { strict: true });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'UNKNOWN_QUERY_PARAMETER');
});

test('permissive mode warns on undeclared query parameters', () => {
  const result = parse('postgres://localhost/app?x=1');
  assert.equal(result.ok, true);
  assert.equal(result.warnings[0].code, 'UNKNOWN_QUERY_PARAMETER');
});

test('postgres target_session_attrs is declared', () => {
  const result = parse('postgresql://host1:123,host2:456/somedb?target_session_attrs=any&application_name=myapp');
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.warnings, []);
});

test('ambiguous http url requires provider hint for clickhouse or elasticsearch classification', () => {
  const result = parse('https://db.example.com:9200/logs');
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.value.type, 'unknown');
  assert.equal(result.warnings[0].code, 'UNKNOWN_SCHEME');

  const elasticsearch = parse('https://db.example.com:9200/logs', { provider: 'elasticsearch' });
  assert.equal(elasticsearch.ok, true, JSON.stringify(elasticsearch.errors, null, 2));
  assert.equal(elasticsearch.value.scheme, 'elasticsearch');
  assert.equal(elasticsearch.value.resource.type, 'index');

  const clickhouse = parse('https://db.example.com:8443/default', { provider: 'clickhouse' });
  assert.equal(clickhouse.ok, true, JSON.stringify(clickhouse.errors, null, 2));
  assert.equal(clickhouse.value.type, 'database');
  assert.equal(clickhouse.value.options.protocol, 'https');
});

test('schemeless conninfo requires provider hint', () => {
  const result = parse('host=db.example.com dbname=app user=alice');
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'MISSING_SCHEME');

  const hinted = parse('host=db.example.com dbname=app user=alice', { provider: 'postgres' });
  assert.equal(hinted.ok, true, JSON.stringify(hinted.errors, null, 2));
  assert.equal(hinted.value.options.conninfo, true);
});

test('provider-specific allowed values are enforced', () => {
  const mysql = parse('mysql://localhost/app?ssl-mode=NOPE');
  assert.equal(mysql.ok, false);
  assert.equal(mysql.errors[0].code, 'INVALID_QUERY_PARAMETER_VALUE');

  const questdb = parse('https::addr=localhost:9000;auto_flush=maybe;');
  assert.equal(questdb.ok, false);
  assert.equal(questdb.errors[0].code, 'INVALID_QUERY_PARAMETER_VALUE');

  const mongodb = parse('mongodb://localhost/app?directConnection=maybe');
  assert.equal(mongodb.ok, false);
  assert.equal(mongodb.errors[0].code, 'INVALID_QUERY_PARAMETER_TYPE');
});
