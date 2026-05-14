import { builtInDefinitions } from './builtin-definitions.js';
import { adapters } from './adapters/index.js';
import { validateDefinition, validateDefinitions } from './definitions/validate.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeScheme(scheme) {
  return String(scheme || '').toLowerCase();
}

export function createRegistry(definitions = builtInDefinitions) {
  validateDefinitions(definitions, adapters);
  const byId = new Map();
  const byScheme = new Map();

  for (const definition of definitions) {
    const copy = clone(definition);
    byId.set(copy.id, copy);
    for (const scheme of copy.schemes || []) {
      byScheme.set(normalizeScheme(scheme), copy);
    }
  }

  return {
    getById(id) {
      return byId.get(id) || null;
    },
    getByScheme(scheme) {
      return byScheme.get(normalizeScheme(scheme)) || null;
    },
    list() {
      return Array.from(byId.values()).map(clone);
    },
    register(definition) {
      validateDefinition(definition, adapters);
      const copy = clone(definition);
      byId.set(copy.id, copy);
      for (const scheme of copy.schemes || []) {
        byScheme.set(normalizeScheme(scheme), copy);
      }
      return copy;
    }
  };
}

export const defaultRegistry = createRegistry();

export function getBuiltInDefinitions() {
  return builtInDefinitions.map(clone);
}

export function registerDefinition(definition) {
  return defaultRegistry.register(definition);
}
