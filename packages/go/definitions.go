package connparse

import (
	"encoding/json"
	"fmt"
	"slices"

	"gopkg.in/yaml.v3"
)

var validTypes = []string{"database", "object_storage", "file", "stream", "cache", "analytics", "api", "unknown"}
var validQueryTypes = []string{"string", "boolean", "number"}

func ParseYAMLDefinition(input []byte) (Definition, error) {
	var def Definition
	if err := yaml.Unmarshal(input, &def); err != nil {
		return def, err
	}
	return def, ValidateDefinition(def)
}

func ParseJSONDefinition(input []byte) (Definition, error) {
	var def Definition
	if err := json.Unmarshal(input, &def); err != nil {
		return def, err
	}
	return def, ValidateDefinition(def)
}

func ValidateDefinition(def Definition) error {
	if def.ID == "" {
		return fmt.Errorf("invalid CPDS definition: id must be a non-empty string")
	}
	if !slices.Contains(validTypes, def.Type) {
		return fmt.Errorf("invalid CPDS definition: %s.type must be valid", def.ID)
	}
	if len(def.Schemes) == 0 {
		return fmt.Errorf("invalid CPDS definition: %s.schemes must be non-empty", def.ID)
	}
	for _, scheme := range def.Schemes {
		if scheme == "" {
			return fmt.Errorf("invalid CPDS definition: %s.schemes must contain non-empty strings", def.ID)
		}
	}
	if p := defaultPort(def); p != 0 && (p < 1 || p > 65535) {
		return fmt.Errorf("invalid CPDS definition: %s.defaults.port must be 1..65535", def.ID)
	}
	for name, rule := range def.QueryParameters {
		if !slices.Contains(validQueryTypes, rule.Type) {
			return fmt.Errorf("invalid CPDS definition: %s.query_parameters.%s.type must be string, boolean, or number", def.ID, name)
		}
	}
	pr := def.Validation.PortRange
	if pr.Min != 0 || pr.Max != 0 {
		if pr.Min < 1 || pr.Max > 65535 || pr.Min > pr.Max {
			return fmt.Errorf("invalid CPDS definition: %s.validation.port_range must be within 1..65535", def.ID)
		}
	}
	for _, key := range def.Redaction.SafeCredentials {
		if key == "" {
			return fmt.Errorf("invalid CPDS definition: %s.redaction.safe_credentials must contain non-empty strings", def.ID)
		}
	}
	for _, key := range def.Redaction.SensitiveKeys {
		if key == "" {
			return fmt.Errorf("invalid CPDS definition: %s.redaction.sensitive_keys must contain non-empty strings", def.ID)
		}
	}
	return nil
}
