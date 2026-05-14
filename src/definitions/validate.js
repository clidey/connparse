const VALID_TYPES = new Set(['database', 'object_storage', 'file', 'stream', 'cache', 'analytics', 'api', 'unknown']);
const VALID_QUERY_TYPES = new Set(['string', 'boolean', 'number']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid CPDS definition: ${message}`);
}

export function validateDefinition(definition, adapters = {}) {
  assert(isPlainObject(definition), 'definition must be an object');
  assert(typeof definition.id === 'string' && definition.id.trim(), 'id must be a non-empty string');
  assert(VALID_TYPES.has(definition.type), `${definition.id}.type must be one of ${Array.from(VALID_TYPES).join(', ')}`);
  assert(Array.isArray(definition.schemes) && definition.schemes.length > 0, `${definition.id}.schemes must be a non-empty array`);

  for (const scheme of definition.schemes) {
    assert(typeof scheme === 'string' && scheme.trim(), `${definition.id}.schemes must contain non-empty strings`);
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

  return definition;
}

export function validateDefinitions(definitions, adapters = {}) {
  assert(Array.isArray(definitions), 'definitions must be an array');
  const ids = new Set();
  for (const definition of definitions) {
    validateDefinition(definition, adapters);
    assert(!ids.has(definition.id), `duplicate id ${definition.id}`);
    ids.add(definition.id);
  }
  return definitions;
}
