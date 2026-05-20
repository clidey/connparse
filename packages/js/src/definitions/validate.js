const VALID_TYPES = new Set(['database', 'object_storage', 'file', 'stream', 'cache', 'analytics', 'api', 'unknown']);
const VALID_QUERY_TYPES = new Set(['string', 'boolean', 'number']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid CPDS definition: ${message}`);
}

function assertStringArray(value, message) {
  assert(Array.isArray(value), `${message} must be an array`);
  for (const item of value) {
    assert(typeof item === 'string' && item.trim(), `${message} must contain non-empty strings`);
  }
}

function assertScalarMap(value, message) {
  assert(isPlainObject(value), `${message} must be an object`);
  for (const item of Object.values(value)) {
    assert(
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
      `${message} must contain scalar values`
    );
  }
}

function validateSemanticSource(definition, semanticKey, source) {
  assert(isPlainObject(source), `${definition.id}.semantic_fields.${semanticKey}.sources items must be objects`);

  const sourceKeys = ['from_query', 'from_option', 'from_scheme'].filter((key) => source[key] != null);
  assert(sourceKeys.length === 1, `${definition.id}.semantic_fields.${semanticKey}.sources items must declare exactly one source`);

  if (source.from_query != null) {
    assert(typeof source.from_query === 'string' && source.from_query.trim(), `${definition.id}.semantic_fields.${semanticKey}.sources.from_query must be a string`);
  }
  if (source.from_option != null) {
    assert(typeof source.from_option === 'string' && source.from_option.trim(), `${definition.id}.semantic_fields.${semanticKey}.sources.from_option must be a string`);
  }
  if (source.from_scheme != null) {
    assert(source.from_scheme === true, `${definition.id}.semantic_fields.${semanticKey}.sources.from_scheme must be true`);
  }
  if (source.values != null) {
    assertScalarMap(source.values, `${definition.id}.semantic_fields.${semanticKey}.sources.values`);
  }
}

export function validateDefinition(definition, adapters = {}) {
  assert(isPlainObject(definition), 'definition must be an object');
  assert(typeof definition.id === 'string' && definition.id.trim(), 'id must be a non-empty string');
  assert(VALID_TYPES.has(definition.type), `${definition.id}.type must be one of ${Array.from(VALID_TYPES).join(', ')}`);
  assert(Array.isArray(definition.schemes) && definition.schemes.length > 0, `${definition.id}.schemes must be a non-empty array`);

  for (const scheme of definition.schemes) {
    assert(typeof scheme === 'string' && scheme.trim(), `${definition.id}.schemes must contain non-empty strings`);
  }

  if (definition.provider_aliases != null) {
    assertStringArray(definition.provider_aliases, `${definition.id}.provider_aliases`);
  }

  if (definition.adapter != null) {
    assert(typeof definition.adapter === 'string' && definition.adapter.trim(), `${definition.id}.adapter must be a string`);
    if (Object.keys(adapters).length > 0) {
      assert(adapters[definition.adapter], `${definition.id}.adapter references unknown adapter ${definition.adapter}`);
    }
  }

  if (definition.defaults != null) {
    assert(isPlainObject(definition.defaults), `${definition.id}.defaults must be an object`);
    if (definition.defaults.port != null) {
      assert(
        Number.isInteger(definition.defaults.port) && definition.defaults.port >= 1 && definition.defaults.port <= 65535,
        `${definition.id}.defaults.port must be an integer from 1 to 65535`
      );
    }
  }

  for (const key of ['authority', 'credentials']) {
    if (definition[key] != null) assert(isPlainObject(definition[key]), `${definition.id}.${key} must be an object`);
  }

  for (const key of ['resource', 'path']) {
    if (definition[key] != null) {
      assert(isPlainObject(definition[key]), `${definition.id}.${key} must be an object`);
      if (definition[key].type != null) {
        assert(typeof definition[key].type === 'string' && definition[key].type.trim(), `${definition.id}.${key}.type must be a string`);
      }
      if (definition[key].required != null) {
        assert(typeof definition[key].required === 'boolean', `${definition.id}.${key}.required must be a boolean`);
      }
    }
  }

  if (definition.query_parameters != null) {
    assert(isPlainObject(definition.query_parameters), `${definition.id}.query_parameters must be an object`);
    for (const [name, rule] of Object.entries(definition.query_parameters)) {
      assert(isPlainObject(rule), `${definition.id}.query_parameters.${name} must be an object`);
      assert(VALID_QUERY_TYPES.has(rule.type), `${definition.id}.query_parameters.${name}.type must be string, boolean, or number`);
      if (rule.allowed != null) {
        assert(Array.isArray(rule.allowed), `${definition.id}.query_parameters.${name}.allowed must be an array`);
        for (const value of rule.allowed) {
          assert(
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
            `${definition.id}.query_parameters.${name}.allowed must contain scalar values`
          );
        }
      }
      if (rule.aliases != null) {
        assertStringArray(rule.aliases, `${definition.id}.query_parameters.${name}.aliases`);
      }
      if (rule.normalized_values != null) {
        assertScalarMap(rule.normalized_values, `${definition.id}.query_parameters.${name}.normalized_values`);
      }
    }
  }

  if (definition.semantic_fields != null) {
    assert(isPlainObject(definition.semantic_fields), `${definition.id}.semantic_fields must be an object`);
    for (const [semanticKey, rule] of Object.entries(definition.semantic_fields)) {
      assert(isPlainObject(rule), `${definition.id}.semantic_fields.${semanticKey} must be an object`);
      assert(Array.isArray(rule.sources) && rule.sources.length > 0, `${definition.id}.semantic_fields.${semanticKey}.sources must be a non-empty array`);
      for (const source of rule.sources) {
        validateSemanticSource(definition, semanticKey, source);
      }
    }
  }

  if (definition.validation != null) {
    assert(isPlainObject(definition.validation), `${definition.id}.validation must be an object`);
    if (definition.validation.require_host != null) {
      assert(typeof definition.validation.require_host === 'boolean', `${definition.id}.validation.require_host must be a boolean`);
    }
    if (definition.validation.port_range != null) {
      const range = definition.validation.port_range;
      assert(isPlainObject(range), `${definition.id}.validation.port_range must be an object`);
      assert(Number.isInteger(range.min), `${definition.id}.validation.port_range.min must be an integer`);
      assert(Number.isInteger(range.max), `${definition.id}.validation.port_range.max must be an integer`);
      assert(range.min >= 1 && range.max <= 65535 && range.min <= range.max, `${definition.id}.validation.port_range must be within 1..65535`);
    }
  }

  if (definition.redaction != null) {
    assert(isPlainObject(definition.redaction), `${definition.id}.redaction must be an object`);
    for (const key of ['safe_credentials', 'sensitive_keys']) {
      if (definition.redaction[key] != null) {
        assert(Array.isArray(definition.redaction[key]), `${definition.id}.redaction.${key} must be an array`);
        for (const value of definition.redaction[key]) {
          assert(typeof value === 'string' && value.trim(), `${definition.id}.redaction.${key} must contain non-empty strings`);
        }
      }
    }
  }

  return definition;
}

export function validateDefinitions(definitions, adapters = {}, options = {}) {
  assert(Array.isArray(definitions), 'definitions must be an array');
  const ids = new Set();
  for (const definition of definitions) {
    validateDefinition(definition, adapters);
    assert(options.allowDuplicateIds || !ids.has(definition.id), `duplicate id ${definition.id}`);
    ids.add(definition.id);
  }
  return definitions;
}
