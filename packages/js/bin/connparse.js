#!/usr/bin/env node
import { parse } from '../src/index.js';

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const version = args.includes('--version') || args.includes('-v');
const safeOnly = args.includes('--safe');
const includeSecrets = args.includes('--include-secrets');
const strict = args.includes('--strict');
const providerIndex = args.indexOf('--provider');
const provider = providerIndex === -1 ? undefined : args[providerIndex + 1];
const inputParts = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (['--help', '-h', '--version', '-v', '--safe', '--include-secrets', '--strict'].includes(arg)) continue;
  if (arg === '--provider') {
    index += 1;
    continue;
  }
  inputParts.push(arg);
}

const input = inputParts.join(' ');

if (help) {
  console.log(`Usage: connparse [options] <address>

Options:
  --provider <name>  Parse an ambiguous address with a specific provider
  --include-secrets  Print the full parse result, including raw and credentials
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

if (safeOnly && includeSecrets) {
  console.error('Use either --safe or --include-secrets, not both');
  process.exit(2);
}

if (!input) {
  console.error('Usage: connparse [--safe] [--include-secrets] [--strict] [--provider <name>] <address>');
  process.exit(2);
}

const result = parse(input, { strict, provider });
if (!result.ok) {
  console.error(JSON.stringify({ errors: result.errors, warnings: result.warnings }, null, 2));
  process.exit(1);
}

const output = includeSecrets ? result.value : sanitizeForOutput(result.value);
console.log(safeOnly ? result.value.safe : JSON.stringify(output, null, 2));

function sanitizeForOutput(value) {
  return {
    ...value,
    credentials: {},
    raw: value.safe
  };
}
