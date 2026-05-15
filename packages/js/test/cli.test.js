import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const bin = fileURLToPath(new URL('../bin/connparse.js', import.meta.url));

function run(args) {
  return execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' }).trim();
}

function runResult(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

test('CLI prints help', () => {
  const output = run(['--help']);
  assert.match(output, /Usage: connparse/);
  assert.match(output, /--provider <name>/);
  assert.match(output, /--include-secrets/);
});

test('CLI prints version', () => {
  assert.equal(run(['--version']), '0.1.0');
});

test('CLI supports provider hints', () => {
  const output = JSON.parse(run(['--provider', 'postgres', 'host=db.example.com dbname=app user=alice password=secret']));
  assert.equal(output.scheme, 'postgres');
  assert.equal(output.authority.host, 'db.example.com');
  assert.equal(output.resource.name, 'app');
  assert.equal(output.options.conninfo, true);
  assert.deepEqual(output.credentials, {});
  assert.equal(output.raw.includes('password=secret'), false);
  assert.equal(output.safe.includes('password=secret'), false);
});

test('CLI prints safe output', () => {
  assert.equal(run(['--safe', 'postgres://user:pass@localhost/app']), 'postgres://user:***@localhost/app');
});

test('CLI requires an explicit flag to print secrets', () => {
  const safeDefault = JSON.parse(run(['postgres://user:pass@localhost/app']));
  assert.deepEqual(safeDefault.credentials, {});
  assert.equal(safeDefault.raw, 'postgres://user:***@localhost/app');
  assert.equal(safeDefault.safe, 'postgres://user:***@localhost/app');
  assert.equal(JSON.stringify(safeDefault).includes('pass'), false);

  const full = JSON.parse(run(['--include-secrets', 'postgres://user:pass@localhost/app']));
  assert.equal(full.credentials.password, 'pass');
  assert.equal(full.raw, 'postgres://user:pass@localhost/app');
  assert.equal(full.safe, 'postgres://user:***@localhost/app');
});

test('CLI exits nonzero for invalid input', () => {
  const result = runResult(['postgres://localhost/app?sslmode=invalid']);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.errors[0].code, 'INVALID_QUERY_PARAMETER_VALUE');
});

test('CLI exits with usage error for missing input or provider value', () => {
  const missingInput = runResult([]);
  assert.equal(missingInput.status, 2);
  assert.match(missingInput.stderr, /Usage: connparse/);

  const missingProvider = runResult(['--provider']);
  assert.equal(missingProvider.status, 2);
  assert.match(missingProvider.stderr, /Missing value for --provider/);

  const conflictingOutputModes = runResult(['--safe', '--include-secrets', 'postgres://localhost/app']);
  assert.equal(conflictingOutputModes.status, 2);
  assert.match(conflictingOutputModes.stderr, /Use either --safe or --include-secrets/);
});
