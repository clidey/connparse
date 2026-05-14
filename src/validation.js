import { diagnostic } from './diagnostics.js';

function valuesFor(value) {
  return Array.isArray(value) ? value : [value];
}

function isBooleanString(value) {
  return ['true', 'false', '1', '0', 'yes', 'no'].includes(String(value).toLowerCase());
}

function isNumberString(value) {
  return /^-?\d+(\.\d+)?$/.test(String(value));
}

function validateQueryValue(rule, key, value) {
  const errors = [];
  for (const item of valuesFor(value)) {
    if (rule.type === 'boolean' && !isBooleanString(item)) {
      errors.push(diagnostic('INVALID_QUERY_PARAMETER_TYPE', `${key} must be a boolean`, `query.${key}`));
    }
    if (rule.type === 'number' && !isNumberString(item)) {
      errors.push(diagnostic('INVALID_QUERY_PARAMETER_TYPE', `${key} must be a number`, `query.${key}`));
    }
    if (Array.isArray(rule.allowed) && !rule.allowed.includes(item)) {
      errors.push(
        diagnostic(
          'INVALID_QUERY_PARAMETER_VALUE',
          `${key} must be one of: ${rule.allowed.join(', ')}`,
          `query.${key}`
        )
      );
    }
  }
  return errors;
}

export function validateAddress(address, definition, options = {}) {
  const errors = [];
  const warnings = [];
  const validation = definition.validation || {};

  const hasHost = Boolean(address.authority.host);
  const hasHosts = Array.isArray(address.authority.hosts) && address.authority.hosts.length > 0;

  if (validation.require_host && !hasHost && !hasHosts) {
    errors.push(diagnostic('MISSING_HOST', `${definition.name || definition.id} requires a host`, 'authority'));
  }

  if (definition.resource?.required && !address.resource.name) {
    errors.push(
      diagnostic('MISSING_RESOURCE', `${definition.name || definition.id} requires a resource`, 'resource.name')
    );
  }

  if (definition.path?.required && !address.path) {
    errors.push(diagnostic('MISSING_PATH', `${definition.name || definition.id} requires a path`, 'path'));
  }

  const range = validation.port_range;
  if (range) {
    const ports = [];
    if (address.authority.port != null) ports.push(address.authority.port);
    if (Array.isArray(address.authority.hosts)) {
      for (const host of address.authority.hosts) {
        if (host.port != null) ports.push(host.port);
      }
    }
    for (const port of ports) {
      if (!Number.isInteger(port) || port < range.min || port > range.max) {
        errors.push(diagnostic('INVALID_PORT', `Port must be between ${range.min} and ${range.max}`, 'authority.port'));
      }
    }
  }

  const queryRules = definition.query_parameters || {};
  for (const [key, value] of Object.entries(address.query || {})) {
    const rule = queryRules[key];
    if (!rule) {
      const item = diagnostic('UNKNOWN_QUERY_PARAMETER', `${key} is not declared for ${definition.id}`, `query.${key}`);
      if (options.strict) errors.push(item);
      else warnings.push(item);
      continue;
    }
    errors.push(...validateQueryValue(rule, key, value));
  }

  return { errors, warnings };
}
