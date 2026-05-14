import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const bin = fileURLToPath(new URL('../bin/connparse.js', import.meta.url));

function run(args) {
  return execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' }).trim();
}

test('CLI prints help', () => {
  const output = run(['--help']);
  assert.match(output, /Usage: connparse/);
  assert.match(output, /--provider <name>/);
});

test('CLI prints version', () => {
  assert.equal(run(['--version']), '0.1.0');
});

test('CLI supports provider hints', () => {
  const output = JSON.parse(run(['--provider', 'postgres', 'host=db.example.com dbname=app user=alice']));
  assert.equal(output.scheme, 'postgres');
  assert.equal(output.authority.host, 'db.example.com');
  assert.equal(output.resource.name, 'app');
  assert.equal(output.options.conninfo, true);
});

test('CLI prints safe output', () => {
  assert.equal(run(['--safe', 'postgres://user:pass@localhost/app']), 'postgres://user:***@localhost/app');
});
