#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), 'connparse-consume-'));

await testNpmPackage();
await testGoPackage();
await testPythonPackage();
await testRustPackage();

console.log('Package consumption checks passed.');

async function testNpmPackage() {
  const packageDir = join(root, 'packages/js');
  const tarballName = execFileSync('npm', ['pack', '--pack-destination', temp], {
    cwd: packageDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(temp, 'npm-cache'),
      npm_config_update_notifier: 'false'
    }
  }).trim().split('\n').pop();
  const tarball = join(temp, tarballName);
  const target = join(temp, 'npm-consume/node_modules/@clidey/connparse');

  await mkdir(target, { recursive: true });
  execFileSync('tar', ['-xzf', tarball, '-C', target, '--strip-components', '1']);
  await symlink(resolve(packageDir, 'node_modules/yaml'), join(temp, 'npm-consume/node_modules/yaml'), 'dir');

  const importScript = join(temp, 'npm-consume/import.mjs');
  await writeFile(
    importScript,
    `
import { parse, parseNormalize } from '@clidey/connparse';
const parsed = parse('postgres://localhost/app?sslmode=require');
if (!parsed.ok || parsed.value.resource.name !== 'app') throw new Error('parse failed');
const normalized = parseNormalize('postgresql://LOCALHOST:5432/app?sslmode=require');
if (!normalized.ok || normalized.value.canonical !== 'postgres://localhost/app?sslmode=require') throw new Error('parseNormalize failed');
`
  );

  execFileSync(process.execPath, [importScript], { cwd: join(temp, 'npm-consume'), stdio: 'pipe' });
  const cli = execFileSync(process.execPath, [join(target, 'bin/connparse.js'), '--safe', 'postgres://user:pass@localhost/app'], {
    cwd: join(temp, 'npm-consume'),
    encoding: 'utf8'
  }).trim();
  if (cli !== 'postgres://user:***@localhost/app') {
    throw new Error(`CLI smoke check failed: ${cli}`);
  }
}

async function testGoPackage() {
  const consumeDir = join(temp, 'go-consume');
  await mkdir(consumeDir, { recursive: true });
  await writeFile(
    join(consumeDir, 'go.mod'),
    `
module example.com/connparse-consume

go 1.26

require (
	github.com/clidey/connparse/packages/go v0.0.0
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/clidey/connparse/packages/go => ${resolve(root, 'packages/go')}
`
  );
  await writeFile(join(consumeDir, 'go.sum'), await readFile(join(root, 'packages/go/go.sum'), 'utf8'));
  await writeFile(
    join(consumeDir, 'connparse_test.go'),
    `
package consume

import (
  "testing"

  connparse "github.com/clidey/connparse/packages/go"
)

func TestConsumeConnparse(t *testing.T) {
  parsed := connparse.Parse("postgres://localhost/app?sslmode=require")
  if !parsed.OK || parsed.Value.Resource.Name != "app" {
    t.Fatalf("parse failed: %+v", parsed)
  }
  normalized := connparse.ParseNormalize("postgresql://LOCALHOST:5432/app?sslmode=require")
  if !normalized.OK || normalized.Value.Canonical != "postgres://localhost/app?sslmode=require" {
    t.Fatalf("normalize failed: %+v", normalized)
  }
}
`
  );

  const goEnv = {
    ...process.env,
    GOCACHE: join(root, '.cache/go-build'),
    GOMODCACHE: join(root, '.cache/go-mod')
  };

  execFileSync('go', ['test', './...'], {
    cwd: consumeDir,
    stdio: 'pipe',
    env: goEnv
  });
}

async function testPythonPackage() {
  const consumeDir = join(temp, 'python-consume');
  await mkdir(consumeDir, { recursive: true });
  const script = join(consumeDir, 'consume.py');
  await writeFile(
    script,
    `
from connparse import parse, parse_normalize

parsed = parse("postgres://localhost/app?sslmode=require")
if not parsed["ok"] or parsed["value"]["resource"]["name"] != "app":
    raise SystemExit("parse failed")

normalized = parse_normalize("postgresql://LOCALHOST:5432/app?sslmode=require")
if not normalized["ok"] or normalized["value"]["canonical"] != "postgres://localhost/app?sslmode=require":
    raise SystemExit("parse_normalize failed")
`
  );
  execFileSync('python3', [script], {
    cwd: consumeDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      PYTHONPATH: join(root, 'packages/python/src')
    }
  });
}

async function testRustPackage() {
  const consumeDir = join(temp, 'rust-consume');
  await mkdir(join(consumeDir, 'tests'), { recursive: true });
  await writeFile(
    join(consumeDir, 'Cargo.toml'),
    `
[package]
name = "connparse-consume"
version = "0.0.0"
edition = "2021"

[dependencies]
connparse = { path = "${resolve(root, 'packages/rust')}" }
`
  );
  await writeFile(
    join(consumeDir, 'tests/consume_test.rs'),
    `
use connparse::{parse, parse_normalize};

#[test]
fn consumes_connparse() {
    let parsed = parse("postgres://localhost/app?sslmode=require", None);
    assert!(parsed.ok, "{:?}", parsed.errors);
    assert_eq!(parsed.value.unwrap().resource.name.as_deref(), Some("app"));

    let normalized = parse_normalize("postgresql://LOCALHOST:5432/app?sslmode=require", None);
    assert!(normalized.ok, "{:?}", normalized.errors);
    assert_eq!(normalized.value.unwrap().canonical, "postgres://localhost/app?sslmode=require");
}
`
  );
  // Rust dependencies are populated by pnpm check/test before this smoke test.
  // Offline mode keeps the consumption check deterministic inside CI/sandboxes.
  execFileSync('cargo', ['test', '--offline'], {
    cwd: consumeDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      CARGO_HOME: join(root, '.cache/cargo-home'),
      CARGO_TARGET_DIR: join(root, '.cache/cargo-target/consume')
    }
  });
}
