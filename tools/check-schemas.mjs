#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaDir = join(root, 'specs/schemas');
const files = (await readdir(schemaDir)).filter((file) => file.endsWith('.schema.json')).sort();

if (files.length === 0) {
  throw new Error('No JSON Schema files found in specs/schemas');
}

for (const file of files) {
  const schema = JSON.parse(await readFile(join(schemaDir, file), 'utf8'));
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    throw new Error(`${file}: missing draft 2020-12 $schema`);
  }
  if (!schema.$id || typeof schema.$id !== 'string') {
    throw new Error(`${file}: missing $id`);
  }
  if (!schema.title || typeof schema.title !== 'string') {
    throw new Error(`${file}: missing title`);
  }
}

console.log(`Schema check passed: ${files.length} schema file(s).`);
