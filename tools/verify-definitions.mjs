#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDefinitionFiles } from './cpds-verifier.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const definitionsDir = optionValue('--definitions-dir') || join(root, 'specs/definitions');
const strictSuggestions = process.argv.includes('--strict-suggestions');

const result = await verifyDefinitionFiles(definitionsDir);

for (const error of result.errors) {
  console.error(`error ${error.file}: ${error.message}`);
}
for (const warning of result.warnings) {
  console.warn(`warning ${warning.file}: ${warning.message}`);
}

if (result.errors.length > 0 || (strictSuggestions && result.warnings.length > 0)) {
  const warningText = strictSuggestions && result.warnings.length > 0 ? `, ${result.warnings.length} warning(s)` : '';
  console.error(`CPDS verification failed: ${result.errors.length} error(s)${warningText}`);
  process.exit(1);
}

if (result.warnings.length > 0) {
  console.log(`CPDS verification passed with ${result.warnings.length} warning(s) across ${result.entries.length} file(s).`);
} else {
  console.log(`CPDS verification passed across ${result.entries.length} file(s).`);
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
