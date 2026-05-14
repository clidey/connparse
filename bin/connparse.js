#!/usr/bin/env node
import { parse } from '../src/index.js';

const args = process.argv.slice(2);
const safeOnly = args.includes('--safe');
const strict = args.includes('--strict');
const input = args.filter((arg) => !arg.startsWith('--')).join(' ');

if (!input) {
  console.error('Usage: connparse [--safe] [--strict] <address>');
  process.exit(2);
}

const result = parse(input, { strict });
if (!result.ok) {
  console.error(JSON.stringify({ errors: result.errors, warnings: result.warnings }, null, 2));
  process.exit(1);
}

console.log(safeOnly ? result.value.safe : JSON.stringify(result.value, null, 2));
