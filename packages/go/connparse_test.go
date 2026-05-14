package connparse

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

type fixture struct {
	Name     string         `json:"name"`
	Provider string         `json:"provider"`
	Input    string         `json:"input"`
	Expected map[string]any `json:"expected"`
}

var topLevelKeys = []string{
	"authority",
	"credentials",
	"fragment",
	"options",
	"path",
	"query",
	"raw",
	"resource",
	"safe",
	"scheme",
	"type",
}

func TestSharedFixtures(t *testing.T) {
	fixtures := loadFixtures(t)
	for _, item := range fixtures {
		t.Run(item.Name, func(t *testing.T) {
			options := Options{}
			if item.Provider != "" {
				options.Provider = item.Provider
			}

			result := Parse(item.Input, options)
			if !result.OK {
				t.Fatalf("parse failed: %+v", result.Errors)
			}
			if len(result.Warnings) != 0 {
				t.Fatalf("fixtures must not produce warnings: %+v", result.Warnings)
			}

			value := addressMap(t, result.Value)
			keys := make([]string, 0, len(value))
			for key := range value {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			if !reflect.DeepEqual(keys, topLevelKeys) {
				t.Fatalf("top-level DSAM keys mismatch\nwant: %#v\ngot:  %#v", topLevelKeys, keys)
			}
			if value["raw"] != item.Input {
				t.Fatalf("raw must preserve original input")
			}

			for path, expected := range item.Expected {
				if actual := getPath(value, path); !reflect.DeepEqual(actual, expected) {
					t.Fatalf("%s mismatch\nwant: %#v\ngot:  %#v", path, expected, actual)
				}
			}

			options.Strict = true
			strict := Parse(item.Input, options)
			if !strict.OK {
				t.Fatalf("strict parse failed: %+v", strict.Errors)
			}
			if len(strict.Warnings) != 0 {
				t.Fatalf("strict fixtures must not produce warnings: %+v", strict.Warnings)
			}
		})
	}
}

func TestMultiHostAuthorityNeverDuplicatesHostOrPort(t *testing.T) {
	for _, item := range loadFixtures(t) {
		options := Options{}
		if item.Provider != "" {
			options.Provider = item.Provider
		}
		result := Parse(item.Input, options)
		if !result.OK {
			t.Fatalf("%s failed: %+v", item.Name, result.Errors)
		}
		if _, ok := result.Value.Authority["hosts"]; ok {
			if _, exists := result.Value.Authority["host"]; exists {
				t.Fatalf("%s duplicated authority.host", item.Name)
			}
			if _, exists := result.Value.Authority["port"]; exists {
				t.Fatalf("%s duplicated authority.port", item.Name)
			}
		}
	}
}

func TestYAMLDefinitionsStayAlignedWithBuiltIns(t *testing.T) {
	registry := DefaultRegistry()
	entries, err := os.ReadDir("../../specs/definitions")
	if err != nil {
		t.Fatal(err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		data, err := os.ReadFile(filepath.Join("../../specs/definitions", entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		yamlDef, err := ParseYAMLDefinition(data)
		if err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
		builtin, ok := registry.ByID(yamlDef.ID)
		if !ok {
			t.Fatalf("%s missing built-in definition", yamlDef.ID)
		}
		if builtin.Type != yamlDef.Type || builtin.Adapter != yamlDef.Adapter || !reflect.DeepEqual(builtin.Schemes, yamlDef.Schemes) {
			t.Fatalf("%s built-in drifted from YAML definition", yamlDef.ID)
		}
		if !reflect.DeepEqual(canonicalDefinition(t, builtin), canonicalDefinition(t, yamlDef)) {
			t.Fatalf("%s built-in definition does not match YAML definition", yamlDef.ID)
		}
	}
}

func TestValidation(t *testing.T) {
	invalidSSLMode := Parse("postgres://localhost/app?sslmode=definitely")
	if invalidSSLMode.OK || invalidSSLMode.Errors[0].Code != "INVALID_QUERY_PARAMETER_VALUE" {
		t.Fatalf("expected invalid sslmode, got %+v", invalidSSLMode)
	}

	strictUnknown := Parse("postgres://localhost/app?x=1", Options{Strict: true})
	if strictUnknown.OK || strictUnknown.Errors[0].Code != "UNKNOWN_QUERY_PARAMETER" {
		t.Fatalf("expected strict unknown query failure, got %+v", strictUnknown)
	}

	permissiveUnknown := Parse("postgres://localhost/app?x=1")
	if !permissiveUnknown.OK || permissiveUnknown.Warnings[0].Code != "UNKNOWN_QUERY_PARAMETER" {
		t.Fatalf("expected permissive unknown query warning, got %+v", permissiveUnknown)
	}

	mongodb := Parse("mongodb://localhost/app?directConnection=maybe")
	if mongodb.OK || mongodb.Errors[0].Code != "INVALID_QUERY_PARAMETER_TYPE" {
		t.Fatalf("expected mongodb boolean validation, got %+v", mongodb)
	}
}

func loadFixtures(t *testing.T) []fixture {
	t.Helper()
	data, err := os.ReadFile("../../specs/fixtures/v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []fixture
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	return fixtures
}

func addressMap(t *testing.T, address *Address) map[string]any {
	t.Helper()
	data, err := json.Marshal(address)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func canonicalDefinition(t *testing.T, definition Definition) map[string]any {
	t.Helper()
	data, err := json.Marshal(definition)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func getPath(value any, path string) any {
	current := value
	for _, part := range splitNonEmpty(path, ".") {
		if current == nil {
			return nil
		}
		if index, ok := toIntIndex(part); ok {
			items, ok := current.([]any)
			if !ok || index >= len(items) {
				return nil
			}
			current = items[index]
			continue
		}
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[part]
	}
	return current
}

func toIntIndex(value string) (int, bool) {
	index := 0
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			return 0, false
		}
		index = index*10 + int(ch-'0')
	}
	return index, value != ""
}
