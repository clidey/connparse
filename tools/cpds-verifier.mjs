import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(new URL('../packages/js/package.json', import.meta.url));
const { parseDocument } = require('yaml');

export const REQUIRED_KEYS = Object.freeze([
  'id',
  'name',
  'type',
  'schemes',
  'adapter',
  'resource',
  'path',
  'query_parameters',
  'validation'
]);

export const SUGGESTED_KEYS = Object.freeze([
  'redaction'
]);

const VALID_TYPES = new Set(['database', 'object_storage', 'file', 'stream', 'cache', 'analytics', 'api', 'unknown']);
const VALID_QUERY_TYPES = new Set(['string', 'boolean', 'number']);

export async function loadDefinitionFiles(definitionsDir) {
  const files = (await readdir(definitionsDir)).filter((file) => file.endsWith('.yaml')).sort();
  const entries = [];
  for (const file of files) {
    const path = join(definitionsDir, file);
    const text = await readFile(path, 'utf8');
    entries.push(parseDefinitionFile(text, file, path));
  }
  return entries;
}

export async function verifyDefinitionFiles(definitionsDir) {
  const entries = await loadDefinitionFiles(definitionsDir);
  const seenSchemes = new Map();
  const seenProviderNames = new Map();
  const results = entries.map((entry) => verifyDefinitionEntry(entry, seenSchemes, seenProviderNames));
  return {
    entries,
    results,
    definitions: entries.filter((entry) => entry.definition).map((entry) => entry.definition),
    errors: results.flatMap((result) => result.errors),
    warnings: results.flatMap((result) => result.warnings)
  };
}

export function parseDefinitionFile(text, file = '<input>', path = file) {
  const document = parseDocument(text, { prettyErrors: false });
  const errors = document.errors.map((error) => diagnostic(file, `YAML parse error: ${error.message}`));
  const warnings = document.warnings.map((warning) => diagnostic(file, `YAML warning: ${warning.message}`));
  return {
    file,
    path,
    text,
    definition: errors.length === 0 ? document.toJSON() : null,
    parseErrors: errors,
    parseWarnings: warnings
  };
}

export function verifyDefinitionEntry(entry, seenSchemes = new Map(), seenProviderNames = new Map()) {
  const errors = [...entry.parseErrors];
  const warnings = [...entry.parseWarnings];
  if (errors.length > 0) return { file: entry.file, errors, warnings };

  const definition = entry.definition;
  if (!isPlainObject(definition)) {
    errors.push(diagnostic(entry.file, 'definition must be an object'));
    return { file: entry.file, errors, warnings };
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in definition)) errors.push(diagnostic(entry.file, `missing required key ${key}`));
  }

  validateScalarFields(definition, entry.file, errors);
  validateSchemes(definition, entry.file, seenSchemes, errors);
  validateProviderAliases(definition, entry.file, seenProviderNames, errors);
  validateObjectFields(definition, entry.file, errors);
  validateQueryParameters(definition, entry.file, errors);
  validateSemanticFields(definition, entry.file, errors);
  validateValidation(definition, entry.file, errors);
  validateRedaction(definition, entry.file, errors);
  suggestRedaction(definition, entry.file, warnings);

  return { file: entry.file, errors, warnings };
}

function validateScalarFields(definition, file, errors) {
  if ('id' in definition && !nonEmptyString(definition.id)) {
    errors.push(diagnostic(file, 'id must be a non-empty string'));
  }
  if ('name' in definition && !nonEmptyString(definition.name)) {
    errors.push(diagnostic(file, 'name must be a non-empty string'));
  }
  if ('adapter' in definition && !nonEmptyString(definition.adapter)) {
    errors.push(diagnostic(file, 'adapter must be a non-empty string'));
  }
  if ('type' in definition && !VALID_TYPES.has(definition.type)) {
    errors.push(diagnostic(file, `type must be one of ${Array.from(VALID_TYPES).join(', ')}`));
  }
}

function validateSchemes(definition, file, seenSchemes, errors) {
  if (!('schemes' in definition)) return;
  if (!Array.isArray(definition.schemes) || definition.schemes.length === 0) {
    errors.push(diagnostic(file, 'schemes must be a non-empty array'));
    return;
  }
  for (const scheme of definition.schemes) {
    if (!nonEmptyString(scheme)) {
      errors.push(diagnostic(file, 'schemes must contain non-empty strings'));
      continue;
    }
    if (seenSchemes.has(scheme)) {
      errors.push(diagnostic(file, `scheme ${scheme} already declared by ${seenSchemes.get(scheme)}`));
    } else {
      seenSchemes.set(scheme, definition.id || file);
    }
  }
}

function validateProviderAliases(definition, file, seenProviderNames, errors) {
  const providerNames = [definition.id, ...(definition.provider_aliases || [])];
  for (const providerName of providerNames) {
    if (!nonEmptyString(providerName)) {
      errors.push(diagnostic(file, 'provider_aliases must contain non-empty strings'));
      continue;
    }
    const normalized = normalize(providerName);
    if (seenProviderNames.has(normalized)) {
      errors.push(diagnostic(file, `provider name ${providerName} already declared by ${seenProviderNames.get(normalized)}`));
    } else {
      seenProviderNames.set(normalized, definition.id || file);
    }
  }
}

function validateObjectFields(definition, file, errors) {
  for (const key of ['defaults', 'authority', 'credentials']) {
    if (definition[key] != null && !isPlainObject(definition[key])) {
      errors.push(diagnostic(file, `${key} must be an object`));
    }
  }
  if (definition.defaults?.port != null && (!Number.isInteger(definition.defaults.port) || definition.defaults.port < 1 || definition.defaults.port > 65535)) {
    errors.push(diagnostic(file, 'defaults.port must be an integer from 1 to 65535'));
  }
  for (const key of ['resource', 'path']) {
    if (definition[key] == null) continue;
    if (!isPlainObject(definition[key])) {
      errors.push(diagnostic(file, `${key} must be an object`));
      continue;
    }
    if (definition[key].type != null && !nonEmptyString(definition[key].type)) {
      errors.push(diagnostic(file, `${key}.type must be a non-empty string`));
    }
    if (definition[key].required != null && typeof definition[key].required !== 'boolean') {
      errors.push(diagnostic(file, `${key}.required must be a boolean`));
    }
  }
}

function validateQueryParameters(definition, file, errors) {
  if (definition.query_parameters == null) return;
  if (!isPlainObject(definition.query_parameters)) {
    errors.push(diagnostic(file, 'query_parameters must be an object'));
    return;
  }
  for (const [key, rule] of Object.entries(definition.query_parameters)) {
    if (!isPlainObject(rule)) {
      errors.push(diagnostic(file, `query_parameters.${key} must be an object`));
      continue;
    }
    if (!VALID_QUERY_TYPES.has(rule.type)) {
      errors.push(diagnostic(file, `query_parameters.${key}.type must be string, boolean, or number`));
    }
    if (rule.allowed != null && !isScalarArray(rule.allowed)) {
      errors.push(diagnostic(file, `query_parameters.${key}.allowed must be an array of scalar values`));
    }
    if (rule.aliases != null && !isStringArray(rule.aliases)) {
      errors.push(diagnostic(file, `query_parameters.${key}.aliases must be an array of strings`));
    }
    if (rule.normalized_values != null && !isScalarObject(rule.normalized_values)) {
      errors.push(diagnostic(file, `query_parameters.${key}.normalized_values must be an object with scalar values`));
    }
  }
}

function validateSemanticFields(definition, file, errors) {
  if (definition.semantic_fields == null) return;
  if (!isPlainObject(definition.semantic_fields)) {
    errors.push(diagnostic(file, 'semantic_fields must be an object'));
    return;
  }
  for (const [semanticKey, rule] of Object.entries(definition.semantic_fields)) {
    if (!isPlainObject(rule)) {
      errors.push(diagnostic(file, `semantic_fields.${semanticKey} must be an object`));
      continue;
    }
    if (!Array.isArray(rule.sources) || rule.sources.length === 0) {
      errors.push(diagnostic(file, `semantic_fields.${semanticKey}.sources must be a non-empty array`));
      continue;
    }
    for (const source of rule.sources) {
      if (!isPlainObject(source)) {
        errors.push(diagnostic(file, `semantic_fields.${semanticKey}.sources items must be objects`));
        continue;
      }
      const sourceKeys = ['from_query', 'from_option', 'from_scheme'].filter((key) => source[key] != null);
      if (sourceKeys.length !== 1) {
        errors.push(diagnostic(file, `semantic_fields.${semanticKey}.sources items must declare exactly one source`));
      }
      if (source.from_query != null && !nonEmptyString(source.from_query)) {
        errors.push(diagnostic(file, `semantic_fields.${semanticKey}.sources.from_query must be a non-empty string`));
      }
      if (source.from_option != null && !nonEmptyString(source.from_option)) {
        errors.push(diagnostic(file, `semantic_fields.${semanticKey}.sources.from_option must be a non-empty string`));
      }
      if (source.from_scheme != null && source.from_scheme !== true) {
        errors.push(diagnostic(file, `semantic_fields.${semanticKey}.sources.from_scheme must be true`));
      }
      if (source.values != null && !isScalarObject(source.values)) {
        errors.push(diagnostic(file, `semantic_fields.${semanticKey}.sources.values must be an object with scalar values`));
      }
    }
  }
}

function validateValidation(definition, file, errors) {
  if (definition.validation == null) return;
  if (!isPlainObject(definition.validation)) {
    errors.push(diagnostic(file, 'validation must be an object'));
    return;
  }
  if (definition.validation.require_host != null && typeof definition.validation.require_host !== 'boolean') {
    errors.push(diagnostic(file, 'validation.require_host must be a boolean'));
  }
  const portRange = definition.validation.port_range;
  if (portRange == null) return;
  if (!isPlainObject(portRange)) {
    errors.push(diagnostic(file, 'validation.port_range must be an object'));
    return;
  }
  if (
    !Number.isInteger(portRange.min) ||
    !Number.isInteger(portRange.max) ||
    portRange.min < 1 ||
    portRange.max > 65535 ||
    portRange.min > portRange.max
  ) {
    errors.push(diagnostic(file, 'validation.port_range must be within 1..65535'));
  }
}

function validateRedaction(definition, file, errors) {
  if (definition.redaction == null) return;
  if (!isPlainObject(definition.redaction)) {
    errors.push(diagnostic(file, 'redaction must be an object'));
    return;
  }
  for (const key of ['safe_credentials', 'sensitive_keys']) {
    if (definition.redaction[key] == null) continue;
    if (!Array.isArray(definition.redaction[key])) {
      errors.push(diagnostic(file, `redaction.${key} must be an array`));
      continue;
    }
    for (const value of definition.redaction[key]) {
      if (!nonEmptyString(value)) errors.push(diagnostic(file, `redaction.${key} must contain non-empty strings`));
    }
  }
}

function suggestRedaction(definition, file, warnings) {
  const credentialKeys = Object.entries(definition.credentials || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  if (credentialKeys.length === 0) return;

  if (!definition.redaction) {
    warnings.push(diagnostic(file, 'missing suggested key redaction for a definition that declares credentials'));
    return;
  }

  const safeCredentials = new Set((definition.redaction.safe_credentials || []).map(normalize));
  const sensitiveKeys = new Set((definition.redaction.sensitive_keys || []).map(normalize));

  if (credentialKeys.includes('username') && !safeCredentials.has('username')) {
    warnings.push(diagnostic(file, 'redaction.safe_credentials should include username when credentials.username is declared'));
  }

  for (const key of credentialKeys) {
    if (key === 'username') continue;
    if (!sensitiveKeys.has(normalize(key))) {
      warnings.push(diagnostic(file, `redaction.sensitive_keys should include credential key ${key}`));
    }
  }
}

function diagnostic(file, message) {
  return { file, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function isScalarArray(value) {
  return Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item));
}

function isScalarObject(value) {
  return isPlainObject(value) && Object.values(value).every((item) => ['string', 'number', 'boolean'].includes(typeof item));
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}
