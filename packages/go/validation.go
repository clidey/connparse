package connparse

import (
	"regexp"
	"strings"
)

type validationResult struct {
	errors   []Diagnostic
	warnings []Diagnostic
}

func validateAddress(address *Address, definition Definition, options Options) validationResult {
	errors := []Diagnostic{}
	warnings := []Diagnostic{}
	validation := definition.Validation

	hasHost := asString(address.Authority["host"]) != ""
	hasHosts := false
	if hosts, ok := address.Authority["hosts"].([]map[string]any); ok {
		hasHosts = len(hosts) > 0
	}

	if validation.RequireHost && !hasHost && !hasHosts {
		errors = append(errors, diagnostic("MISSING_HOST", displayName(definition)+" requires a host", "authority"))
	}
	if definition.ResourceRule.Required && address.Resource.Name == nil {
		errors = append(errors, diagnostic("MISSING_RESOURCE", displayName(definition)+" requires a resource", "resource.name"))
	}
	if definition.PathRule.Required && address.Path == "" {
		errors = append(errors, diagnostic("MISSING_PATH", displayName(definition)+" requires a path", "path"))
	}

	rangeRule := validation.PortRange
	if rangeRule.Min != 0 || rangeRule.Max != 0 {
		for _, port := range collectPorts(address.Authority) {
			if port < rangeRule.Min || port > rangeRule.Max {
				errors = append(errors, diagnostic("INVALID_PORT", "Port must be between "+toString(rangeRule.Min)+" and "+toString(rangeRule.Max), "authority.port"))
			}
		}
	}

	for key, value := range address.Query {
		rule, ok := definition.QueryParameters[key]
		if !ok {
			item := diagnostic("UNKNOWN_QUERY_PARAMETER", key+" is not declared for "+definition.ID, "query."+key)
			if options.Strict {
				errors = append(errors, item)
			} else {
				warnings = append(warnings, item)
			}
			continue
		}
		errors = append(errors, validateQueryValue(rule, key, value)...)
	}

	return validationResult{errors: errors, warnings: warnings}
}

func displayName(def Definition) string {
	if def.Name != "" {
		return def.Name
	}
	return def.ID
}

func collectPorts(authority map[string]any) []int {
	ports := []int{}
	if port, ok := toInt(authority["port"]); ok {
		ports = append(ports, port)
	}
	if hosts, ok := authority["hosts"].([]map[string]any); ok {
		for _, host := range hosts {
			if port, ok := toInt(host["port"]); ok {
				ports = append(ports, port)
			}
		}
	}
	return ports
}

func validateQueryValue(rule QueryRule, key string, value any) []Diagnostic {
	errors := []Diagnostic{}
	for _, item := range valuesFor(value) {
		if rule.Type == "boolean" && !isBooleanString(item) {
			errors = append(errors, diagnostic("INVALID_QUERY_PARAMETER_TYPE", key+" must be a boolean", "query."+key))
		}
		if rule.Type == "number" && !isNumberString(item) {
			errors = append(errors, diagnostic("INVALID_QUERY_PARAMETER_TYPE", key+" must be a number", "query."+key))
		}
		if len(rule.Allowed) > 0 && !allowedContains(rule.Allowed, item) {
			errors = append(errors, diagnostic("INVALID_QUERY_PARAMETER_VALUE", key+" must be one of: "+joinAllowed(rule.Allowed), "query."+key))
		}
	}
	return errors
}

func valuesFor(value any) []any {
	if values, ok := value.([]any); ok {
		return values
	}
	return []any{value}
}

func isBooleanString(value any) bool {
	switch strings.ToLower(toString(value)) {
	case "true", "false", "1", "0", "yes", "no":
		return true
	default:
		return false
	}
}

func isNumberString(value any) bool {
	return regexp.MustCompile(`^-?\d+(\.\d+)?$`).MatchString(toString(value))
}

func allowedContains(allowed []any, value any) bool {
	text := toString(value)
	for _, item := range allowed {
		if toString(item) == text {
			return true
		}
	}
	return false
}

func joinAllowed(allowed []any) string {
	parts := make([]string, len(allowed))
	for i, item := range allowed {
		parts[i] = toString(item)
	}
	return strings.Join(parts, ", ")
}

func toInt(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), v == float64(int(v))
	default:
		return 0, false
	}
}
