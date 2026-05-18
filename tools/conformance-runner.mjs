#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBuiltInDefinitions, parse } from '../packages/js/src/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const separator = process.argv.indexOf('--');
const fixturesPath = optionValue('--fixtures') || join(root, 'specs/fixtures/compatibility.json');
const jsonOutput = process.argv.includes('--json');
const quiet = process.argv.includes('--quiet');
const skipCoverage = process.argv.includes('--skip-coverage');
const externalCommand = separator === -1 ? null : process.argv.slice(separator + 1);

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

if (externalCommand && externalCommand.length === 0) {
  throw new Error('External conformance mode requires a command after --');
}

const fixtures = JSON.parse(await readFile(fixturesPath, 'utf8'));
const report = await runConformance(fixtures);

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.failures.length > 0) {
  for (const failure of report.failures) {
    console.error(`${failure.fixture}: ${failure.message}`);
  }
  console.error(`Conformance failed: ${report.failures.length} failure(s), ${report.assertions} assertion(s).`);
} else if (!quiet) {
  console.log(`Conformance passed: ${report.fixtures} fixture(s), ${report.assertions} assertion(s).`);
}

if (report.failures.length > 0) process.exit(1);

async function runConformance(items) {
  const failures = [];
  let assertions = 0;

  assertCondition(Array.isArray(items), '<fixtures>', 'fixture file must contain an array', failures);
  if (!Array.isArray(items)) return result(items, assertions, failures);

  const names = new Set();
  for (const fixture of items) {
    assertions += assertCondition(typeof fixture.name === 'string' && fixture.name, fixture.name || '<fixture>', 'name must be a non-empty string', failures);
    assertions += assertCondition(!names.has(fixture.name), fixture.name, 'fixture names must be unique', failures);
    names.add(fixture.name);
    assertions += assertCondition(typeof fixture.input === 'string' && fixture.input, fixture.name, 'input must be a non-empty string', failures);
    assertions += assertCondition(isPlainObject(fixture.expected) && Object.keys(fixture.expected).length > 0, fixture.name, 'expected must be a non-empty object', failures);
  }

  for (const fixture of items) {
    const options = fixture.provider ? { provider: fixture.provider } : {};
    const parsed = runParser(fixture, options);
    assertions += assertParseResult(fixture, parsed, options, failures);

    const strict = runParser(fixture, { ...options, strict: true });
    assertions += assertParseResult(fixture, strict, { ...options, strict: true }, failures);
  }

  if (!skipCoverage) assertions += assertProviderCoverage(items, failures);
  return result(items, assertions, failures);
}

function result(items, assertions, failures) {
  return {
    ok: failures.length === 0,
    fixtures: Array.isArray(items) ? items.length : 0,
    assertions,
    failures
  };
}

function runParser(fixture, options) {
  if (!externalCommand) return parse(fixture.input, options);

  const child = spawnSync(externalCommand[0], externalCommand.slice(1), {
    input: JSON.stringify({ input: fixture.input, options }),
    encoding: 'utf8',
    cwd: root
  });

  if (child.status !== 0) {
    return {
      ok: false,
      value: null,
      errors: [{ code: 'EXTERNAL_RUNNER_FAILED', message: child.stderr || child.stdout || `exit ${child.status}` }],
      warnings: []
    };
  }

  try {
    return JSON.parse(child.stdout);
  } catch (error) {
    return {
      ok: false,
      value: null,
      errors: [{ code: 'EXTERNAL_RUNNER_INVALID_JSON', message: error instanceof Error ? error.message : String(error) }],
      warnings: []
    };
  }
}

function assertParseResult(fixture, result, options, failures) {
  let assertions = 0;
  const label = options.strict ? `${fixture.name} strict` : fixture.name;

  assertions += assertCondition(result?.ok === true, label, `parse failed: ${JSON.stringify(result?.errors || [])}`, failures);
  if (!result?.ok || !result.value) return assertions;

  assertions += assertCondition(Array.isArray(result.warnings) && result.warnings.length === 0, label, 'fixtures must not produce warnings', failures);
  assertions += assertCondition(deepEqual(Object.keys(result.value).sort(), TOP_LEVEL_KEYS), label, 'top-level address keys must match the contract', failures);
  assertions += assertCondition(result.value.raw === fixture.input, label, 'raw must preserve original input', failures);
  assertions += assertCondition(typeof result.value.safe === 'string', label, 'safe must be a string', failures);
  assertions += assertCondition(typeof result.value.scheme === 'string', label, 'scheme must be a string', failures);
  assertions += assertCondition(typeof result.value.type === 'string', label, 'type must be a string', failures);
  assertions += assertCondition(isPlainObject(result.value.authority), label, 'authority must be an object', failures);
  assertions += assertCondition(isPlainObject(result.value.resource), label, 'resource must be an object', failures);
  assertions += assertCondition(typeof result.value.resource.type === 'string', label, 'resource.type must be a string', failures);
  assertions += assertCondition(typeof result.value.path === 'string', label, 'path must be a string', failures);
  assertions += assertCondition(isPlainObject(result.value.query), label, 'query must be an object', failures);
  assertions += assertCondition(isPlainObject(result.value.credentials), label, 'credentials must be an object', failures);
  assertions += assertCondition(isPlainObject(result.value.options), label, 'options must be an object', failures);
  assertions += assertSafeDoesNotLeak(result.value, label, failures);

  if (Array.isArray(result.value.authority.hosts)) {
    assertions += assertCondition(!Object.prototype.hasOwnProperty.call(result.value.authority, 'host'), label, 'multi-host authority must omit top-level host', failures);
    assertions += assertCondition(!Object.prototype.hasOwnProperty.call(result.value.authority, 'port'), label, 'multi-host authority must omit top-level port', failures);
  }

  for (const [path, expected] of Object.entries(fixture.expected || {})) {
    assertions += assertCondition(deepEqual(getPath(result.value, path), expected), label, `${path} mismatch`, failures);
  }

  return assertions;
}

function assertProviderCoverage(fixtures, failures) {
  let assertions = 0;
  for (const id of getBuiltInDefinitions().map((definition) => definition.id).sort()) {
    const covered = fixtures.some((fixture) => {
      if (fixture.provider === id) return true;
      const parsed = runParser(fixture, fixture.provider ? { provider: fixture.provider } : {});
      return parsed.ok && parsed.value?.scheme === id;
    });
    assertions += assertCondition(covered, '<coverage>', `missing fixture coverage for provider id ${id}`, failures);
  }
  return assertions;
}

function assertSafeDoesNotLeak(address, label, failures) {
  let assertions = 0;
  for (const [key, secret] of Object.entries(address.credentials || {})) {
    if (!secret || key === 'username') continue;
    assertions += assertCondition(!address.safe.includes(`:${secret}@`), label, `safe leaked credentials.${key}`, failures);
    assertions += assertCondition(!address.safe.includes(`${key}=${secret}`), label, `safe leaked credentials.${key}`, failures);
  }
  return assertions;
}

function assertCondition(condition, fixture, message, failures) {
  if (!condition) failures.push({ fixture, message });
  return 1;
}

function getPath(value, path) {
  return path.split('.').reduce((current, part) => {
    if (current == null) return undefined;
    if (/^\d+$/.test(part)) return current[Number(part)];
    return current[part];
  }, value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || (separator !== -1 && index > separator)) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}
