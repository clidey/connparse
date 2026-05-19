#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const classes = join(root, '.cache/java-classes');

rmSync(classes, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });

const sources = [
  ...javaFiles(join(root, 'packages/java/src/main/java')),
  ...javaFiles(join(root, 'packages/java/src/test/java'))
];

execFileSync('javac', ['--release', '17', '-d', classes, ...sources], {
  cwd: root,
  stdio: 'pipe'
});

execFileSync('java', ['-cp', classes, 'com.clidey.connparse.ConnparseTestMain'], {
  cwd: root,
  stdio: 'inherit'
});

execFileSync('node', ['tools/conformance-runner.mjs', '--skip-coverage', '--', 'java', '-cp', classes, 'com.clidey.connparse.ConformanceMain'], {
  cwd: root,
  stdio: 'inherit'
});

function javaFiles(dir) {
  const output = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...javaFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.java')) output.push(path);
  }
  return output.sort();
}
