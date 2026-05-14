import { parse as parseYaml } from 'yaml';
import { validateDefinition } from './validate.js';

export function parseYamlDefinition(input) {
  return validateDefinition(parseYaml(String(input)));
}

export function parseJsonDefinition(input) {
  return validateDefinition(JSON.parse(String(input)));
}

export function parseDefinition(input, format) {
  if (format === 'json') return parseJsonDefinition(input);
  if (format === 'yaml' || format === 'yml') return parseYamlDefinition(input);

  const text = String(input).trim();
  if (text.startsWith('{') || text.startsWith('[')) return parseJsonDefinition(text);
  return parseYamlDefinition(text);
}
