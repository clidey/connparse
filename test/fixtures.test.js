import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '../src/index.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/v1.json', import.meta.url), 'utf8'));

function getPath(value, path) {
  return path.split('.').reduce((current, part) => {
    if (current == null) return undefined;
    if (/^\d+$/.test(part)) return current[Number(part)];
    return current[part];
  }, value);
}

for (const fixture of fixtures) {
  test(fixture.name, () => {
    const result = parse(fixture.input);
    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));

    for (const [path, expected] of Object.entries(fixture.expected)) {
      assert.deepEqual(getPath(result.value, path), expected, path);
    }
  });
}

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
