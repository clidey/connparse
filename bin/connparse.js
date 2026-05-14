#!/usr/bin/env node
import { parse } from '../src/index.js';

const args = process.argv.slice(2);
const safeOnly = args.includes('--safe');
const strict = args.includes('--strict');
const providerIndex = args.indexOf('--provider');
const provider = providerIndex === -1 ? undefined : args[providerIndex + 1];
const input = args
  .filter((arg, index) => !arg.startsWith('--') && index !== providerIndex + 1)
  .join(' ');

if (!input) {
  console.error('Usage: connparse [--safe] [--strict] [--provider <name>] <address>');
  process.exit(2);
}

const result = parse(input, { strict, provider });
if (!result.ok) {
  console.error(JSON.stringify({ errors: result.errors, warnings: result.warnings }, null, 2));
  process.exit(1);
}

console.log(safeOnly ? result.value.safe : JSON.stringify(result.value, null, 2));
