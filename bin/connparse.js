#!/usr/bin/env node
import { parse } from '../src/index.js';

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const version = args.includes('--version') || args.includes('-v');
const safeOnly = args.includes('--safe');
const strict = args.includes('--strict');
const providerIndex = args.indexOf('--provider');
const provider = providerIndex === -1 ? undefined : args[providerIndex + 1];
const input = args
  .filter((arg, index) => !arg.startsWith('--') && !arg.startsWith('-') && index !== providerIndex + 1)
  .join(' ');

if (help) {
  console.log(`Usage: connparse [options] <address>

Options:
  --provider <name>  Parse an ambiguous address with a specific provider
  --safe             Print only the redacted safe string
  --strict           Treat unknown query parameters as errors
  --version, -v      Print the package version
  --help, -h         Show this help
`);
  process.exit(0);
}

if (version) {
  console.log('0.1.0');
  process.exit(0);
}

if (providerIndex !== -1 && !provider) {
  console.error('Missing value for --provider');
  process.exit(2);
}

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
