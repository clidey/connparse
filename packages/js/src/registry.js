import { builtInDefinitions } from './builtin-definitions.js';
import { adapters } from './adapters/index.js';
import { validateDefinition, validateDefinitions } from './definitions/validate.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeScheme(scheme) {
  return String(scheme || '').toLowerCase();
}

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

export function createRegistry(definitions = builtInDefinitions) {
  validateDefinitions(definitions, adapters, { allowDuplicateIds: true });
  const byId = new Map();
  const byScheme = new Map();
  const byProviderAlias = new Map();

  for (const definition of definitions) {
    const copy = clone(definition);
    byId.set(normalizeProvider(copy.id), copy);
    for (const scheme of copy.schemes || []) {
      byScheme.set(normalizeScheme(scheme), copy);
    }
    for (const alias of copy.provider_aliases || []) {
      byProviderAlias.set(normalizeProvider(alias), copy);
    }
  }

  return {
    getById(id) {
      const normalized = normalizeProvider(id);
      return byId.get(normalized) || byProviderAlias.get(normalized) || null;
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
      byId.set(normalizeProvider(copy.id), copy);
      for (const scheme of copy.schemes || []) {
        byScheme.set(normalizeScheme(scheme), copy);
      }
      for (const alias of copy.provider_aliases || []) {
        byProviderAlias.set(normalizeProvider(alias), copy);
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
