#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const jsPackagePath = join(root, 'packages/js/package.json');
const pythonProjectPath = join(root, 'packages/python/pyproject.toml');
const check = process.argv.includes('--check');
const setVersion = optionValue('--set');

const jsPackage = JSON.parse(await readFile(jsPackagePath, 'utf8'));
let pythonProject = await readFile(pythonProjectPath, 'utf8');

if (setVersion) {
  jsPackage.version = setVersion;
  pythonProject = setTomlValue(pythonProject, 'version', setVersion);
  await writeFile(jsPackagePath, `${JSON.stringify(jsPackage, null, 2)}\n`);
  await writeFile(pythonProjectPath, pythonProject);
}

const pythonName = tomlValue(pythonProject, 'name');
const pythonVersion = tomlValue(pythonProject, 'version');

if (pythonName !== 'connparse') {
  throw new Error(`packages/python/pyproject.toml project.name must be "connparse", got "${pythonName}"`);
}

if (jsPackage.version !== pythonVersion) {
  const message = `version mismatch: packages/js/package.json=${jsPackage.version}, packages/python/pyproject.toml=${pythonVersion}`;
  if (check) throw new Error(message);
  console.error(message);
  process.exitCode = 1;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function tomlValue(source, key) {
  const match = source.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
  return match ? match[1] : null;
}

function setTomlValue(source, key, value) {
  const pattern = new RegExp(`^${key}\\s*=\\s*"[^"]*"`, 'm');
  if (!pattern.test(source)) throw new Error(`missing ${key} in packages/python/pyproject.toml`);
  return source.replace(pattern, `${key} = "${value}"`);
}
