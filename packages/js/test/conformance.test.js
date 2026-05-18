import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = new URL('../../..', import.meta.url);

test('conformance runner passes against the JavaScript implementation', () => {
  const output = execFileSync('node', ['tools/conformance-runner.mjs', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const report = JSON.parse(output);
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.equal(report.fixtures > 0, true);
  assert.equal(report.assertions > report.fixtures, true);
});

test('conformance runner supports the external parser protocol', () => {
  const dir = mkdtempSync(join(tmpdir(), 'connparse-conformance-'));
  const runner = join(dir, 'runner.mjs');
  const fixtures = join(dir, 'fixtures.json');
  const indexUrl = pathToFileURL(fileURLToPath(new URL('../src/index.js', import.meta.url))).href;
  writeFileSync(
    fixtures,
    JSON.stringify([
      {
        name: 'postgres conformance smoke',
        input: 'postgres://localhost/app?sslmode=require',
        expected: {
          scheme: 'postgres',
          'resource.name': 'app',
          'query.sslmode': 'require'
        }
      }
    ])
  );
  writeFileSync(
    runner,
    `
import { readFileSync } from 'node:fs';
import { parse } from ${JSON.stringify(indexUrl)};
const request = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(parse(request.input, request.options)));
`
  );

  const output = execFileSync('node', ['tools/conformance-runner.mjs', '--fixtures', fixtures, '--skip-coverage', '--json', '--', 'node', runner], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const report = JSON.parse(output);
  assert.equal(report.ok, true, JSON.stringify(report.failures));
});

test('schema files are valid JSON Schema documents', () => {
  assert.doesNotThrow(() => {
    execFileSync('node', ['tools/check-schemas.mjs'], {
      cwd: repoRoot,
      stdio: 'pipe'
    });
  });
});
