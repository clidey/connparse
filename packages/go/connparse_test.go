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

var requiredProviderIDs = []string{
	"clickhouse",
	"cockroachdb",
	"duckdb",
	"elasticsearch",
	"file",
	"mariadb",
	"memcached",
	"mongodb",
	"mysql",
	"postgres",
	"questdb",
	"redis",
	"s3",
	"sqlite",
	"yugabytedb",
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
			assertNoSensitiveSafeLeak(t, result.Value, item.Name)

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

func TestFixtureMetadata(t *testing.T) {
	names := map[string]bool{}
	for _, item := range loadFixtures(t) {
		if item.Name == "" {
			t.Fatal("fixture name must be non-empty")
		}
		if names[item.Name] {
			t.Fatalf("duplicate fixture name: %s", item.Name)
		}
		names[item.Name] = true
		if item.Input == "" {
			t.Fatalf("%s input must be non-empty", item.Name)
		}
		if len(item.Expected) == 0 {
			t.Fatalf("%s must assert at least one field", item.Name)
		}
	}
}

func TestFixturesCoverEveryProviderID(t *testing.T) {
	fixtures := loadFixtures(t)
	for _, id := range requiredProviderIDs {
		covered := false
		for _, item := range fixtures {
			if item.Provider == id {
				covered = true
				break
			}
			options := Options{}
			if item.Provider != "" {
				options.Provider = item.Provider
			}
			result := Parse(item.Input, options)
			if result.OK && result.Value.Scheme == id {
				covered = true
				break
			}
		}
		if !covered {
			t.Fatalf("missing fixture coverage for provider id: %s", id)
		}
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

func TestGeneratedDefinitionsAreNativeStructLiterals(t *testing.T) {
	data, err := os.ReadFile("builtin_definitions.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	if !strings.Contains(source, "Definition{") {
		t.Fatal("generated Go definitions should use struct literals")
	}
	for _, disallowed := range []string{"encoding/json", "builtInDefinitionsJSON", "json.Unmarshal"} {
		if strings.Contains(source, disallowed) {
			t.Fatalf("generated Go definitions should not contain %s", disallowed)
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

	badPort := Parse("postgres://localhost:70000/app")
	if badPort.OK || badPort.Errors[0].Code != "INVALID_PORT" {
		t.Fatalf("expected invalid port, got %+v", badPort)
	}

	missingResource := Parse("postgres://localhost")
	if missingResource.OK || missingResource.Errors[0].Code != "MISSING_RESOURCE" {
		t.Fatalf("expected missing resource, got %+v", missingResource)
	}
}

func TestCanonicalizeProducesSafeStableIdentityStrings(t *testing.T) {
	value, err := Canonicalize("postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp")
	if err != nil {
		t.Fatal(err)
	}
	if value != "postgres://localhost/app?application_name=myapp&sslmode=require" {
		t.Fatalf("unexpected canonical postgres value: %s", value)
	}

	value, err = Canonicalize("postgres://user:pass@localhost/app?sslkey=/tmp/client.key&sslmode=require")
	if err != nil {
		t.Fatal(err)
	}
	if value != "postgres://localhost/app?sslkey=***&sslmode=require" {
		t.Fatalf("unexpected safe canonical value: %s", value)
	}

	value, err = Canonicalize("postgres://user:pass@localhost/app?sslkey=/tmp/client.key&sslmode=require", CanonicalizeOptions{
		IncludeCredentials: true,
		IncludeSensitive:   true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if value != "postgres://user:pass@localhost/app?sslkey=%2Ftmp%2Fclient.key&sslmode=require" {
		t.Fatalf("unexpected secret-inclusive canonical value: %s", value)
	}
}

func TestCanonicalizeHandlesMultiHostDefaultsAndTypedQueries(t *testing.T) {
	value, err := Canonicalize("postgresql://host1:5432,host2:5432/somedb?target_session_attrs=any&application_name=myapp")
	if err != nil {
		t.Fatal(err)
	}
	if value != "postgres://host1,host2/somedb?application_name=myapp&target_session_attrs=any" {
		t.Fatalf("unexpected multi-host canonical value: %s", value)
	}

	value, err = Canonicalize("mongodb://LOCALHOST:27017/app?tls=1")
	if err != nil {
		t.Fatal(err)
	}
	if value != "mongodb://localhost/app?tls=true" {
		t.Fatalf("unexpected typed query canonical value: %s", value)
	}
}

func TestEquivalentComparesCanonicalIdentities(t *testing.T) {
	ok, err := Equivalent(
		"postgresql://localhost:5432/app?sslmode=require&application_name=myapp",
		"postgres://localhost/app?application_name=myapp&sslmode=require",
	)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected equivalent postgres addresses")
	}

	ok, err = Equivalent("postgres://localhost/app", "postgres://localhost/other")
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("different databases should not be equivalent")
	}
}

func TestParseNormalizeReturnsStableJSONForEquivalentInputs(t *testing.T) {
	left := ParseNormalize("postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp")
	right := ParseNormalize("postgres://localhost/app?application_name=myapp&sslmode=require")

	if !left.OK || !right.OK {
		t.Fatalf("normalize failed: %+v %+v", left.Errors, right.Errors)
	}
	if !reflect.DeepEqual(left.Value, right.Value) {
		t.Fatalf("normalized values differ\nleft:  %+v\nright: %+v", left.Value, right.Value)
	}
	if left.Value.Raw != "postgres://localhost/app?application_name=myapp&sslmode=require" {
		t.Fatalf("unexpected normalized raw value: %s", left.Value.Raw)
	}
	if left.Value.Safe != left.Value.Canonical {
		t.Fatalf("safe should match canonical")
	}
	if len(left.Value.Credentials) != 0 {
		t.Fatalf("credentials should be omitted by default: %+v", left.Value.Credentials)
	}
}

func TestParseNormalizeCanIncludeCredentialsAndSensitiveValues(t *testing.T) {
	result := ParseNormalize("postgres://user:pass@localhost/app?sslkey=/tmp/client.key", CanonicalizeOptions{
		IncludeCredentials: true,
		IncludeSensitive:   true,
	})
	if !result.OK {
		t.Fatalf("normalize failed: %+v", result.Errors)
	}
	if result.Value.Credentials["username"] != "user" || result.Value.Credentials["password"] != "pass" {
		t.Fatalf("unexpected credentials: %+v", result.Value.Credentials)
	}
	if result.Value.Query["sslkey"] != "/tmp/client.key" {
		t.Fatalf("unexpected query: %+v", result.Value.Query)
	}
	if result.Value.Canonical != "postgres://user:pass@localhost/app?sslkey=%2Ftmp%2Fclient.key" {
		t.Fatalf("unexpected canonical value: %s", result.Value.Canonical)
	}
}

func TestCanonicalizeAndParseNormalizeHonorDefaultPortAndFragmentOptions(t *testing.T) {
	value, err := Canonicalize("postgres://localhost:5432/app?sslmode=require#section", CanonicalizeOptions{
		IncludeDefaultPort: true,
		OmitFragment:       true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if value != "postgres://localhost:5432/app?sslmode=require" {
		t.Fatalf("unexpected canonical value: %s", value)
	}

	result := ParseNormalize("postgres://localhost:5432/app?sslmode=require#section", CanonicalizeOptions{
		IncludeDefaultPort: true,
		OmitFragment:       true,
	})
	if !result.OK {
		t.Fatalf("normalize failed: %+v", result.Errors)
	}
	if result.Value.Authority["host"] != "localhost" || result.Value.Authority["port"] != 5432 {
		t.Fatalf("unexpected authority: %+v", result.Value.Authority)
	}
	if result.Value.Fragment != nil {
		t.Fatalf("fragment should be omitted: %+v", result.Value.Fragment)
	}
	if result.Value.Canonical != "postgres://localhost:5432/app?sslmode=require" {
		t.Fatalf("unexpected canonical value: %s", result.Value.Canonical)
	}
}

func TestParseNormalizePreservesRepeatedQueryValuesInStableKeyOrder(t *testing.T) {
	result := ParseNormalize("postgres://localhost/app?z=3&application_name=one&application_name=two&sslmode=require")
	if !result.OK {
		t.Fatalf("normalize failed: %+v", result.Errors)
	}
	values, ok := result.Value.Query["application_name"].([]any)
	if !ok || !reflect.DeepEqual(values, []any{"one", "two"}) {
		t.Fatalf("unexpected repeated query values: %+v", result.Value.Query["application_name"])
	}
	if result.Value.Canonical != "postgres://localhost/app?application_name=one&application_name=two&sslmode=require&z=3" {
		t.Fatalf("unexpected canonical value: %s", result.Value.Canonical)
	}
}

func TestParseNormalizeSupportsProviderHintsAndDirectAddressNormalization(t *testing.T) {
	result := ParseNormalize("host=LOCALHOST port=5432 dbname=app user=alice password=secret application_name=myapp", CanonicalizeOptions{
		Parse: Options{Provider: "postgres"},
	})
	if !result.OK {
		t.Fatalf("normalize failed: %+v", result.Errors)
	}
	if result.Value.Canonical != "postgres://localhost/app?application_name=myapp" {
		t.Fatalf("unexpected canonical value: %s", result.Value.Canonical)
	}
	if len(result.Value.Credentials) != 0 {
		t.Fatalf("credentials should be omitted by default: %+v", result.Value.Credentials)
	}
	if result.Value.Query["application_name"] != "myapp" {
		t.Fatalf("unexpected query: %+v", result.Value.Query)
	}

	address, err := ParseOrThrow("postgresql://LOCALHOST:5432/app?sslmode=require")
	if err != nil {
		t.Fatal(err)
	}
	normalized := NormalizeAddress(address)
	expected := ParseNormalize("postgres://localhost/app?sslmode=require")
	if !reflect.DeepEqual(normalized, expected.Value) {
		t.Fatalf("direct normalization differs\nnormalized: %+v\nexpected:   %+v", normalized, expected.Value)
	}
}

func TestUnknownSchemesAndCustomDefinitions(t *testing.T) {
	permissive := Parse("unknown+db://user:pass@example.com/main?token=secret")
	if !permissive.OK || permissive.Value.Type != "unknown" || permissive.Warnings[0].Code != "UNKNOWN_SCHEME" {
		t.Fatalf("expected permissive unknown parse, got %+v", permissive)
	}
	if strings.Contains(permissive.Value.Safe, ":pass@") {
		t.Fatalf("unknown safe output leaked userinfo password: %s", permissive.Value.Safe)
	}
	if !strings.Contains(permissive.Value.Safe, "token=secret") {
		t.Fatalf("unknown safe output should not redact undeclared query keys: %s", permissive.Value.Safe)
	}

	strict := Parse("unknown+db://example.com/main", Options{Strict: true})
	if strict.OK || strict.Errors[0].Code != "UNKNOWN_SCHEME" {
		t.Fatalf("expected strict unknown failure, got %+v", strict)
	}

	custom := Definition{
		ID:           "postgres-override",
		Name:         "Postgres Override",
		Type:         "api",
		Schemes:      []string{"postgres"},
		Adapter:      "generic-uri",
		ResourceRule: Rule{Type: "endpoint", Required: true},
		Validation:   ValidationRule{RequireHost: true},
	}
	overridden := Parse("postgres://example.com/endpoint", Options{Definitions: []Definition{custom}})
	if !overridden.OK || overridden.Value.Type != "api" || overridden.Value.Resource.Type != "endpoint" {
		t.Fatalf("expected custom definition override, got %+v", overridden)
	}

	normal := Parse("postgres://example.com/app")
	if !normal.OK || normal.Value.Type != "database" || normal.Value.Resource.Type != "database" {
		t.Fatalf("expected built-in definition after override call, got %+v", normal)
	}
}

func TestMaskRedactsSensitiveForms(t *testing.T) {
	cases := map[string]string{
		"postgres://user:pass@localhost/app":     "postgres://user:***@localhost/app",
		"user:pass@localhost/app":                "user:***@localhost/app",
		"https://example.com?api_key=secret&x=1": "https://example.com?api_key=secret&x=1",
		"host=db password=secret token=abc":      "host=db password=secret token=abc",
		"https::addr=localhost;password=secret;": "https::addr=localhost;password=secret;",
	}
	for input, expected := range cases {
		if actual := Mask(input); actual != expected {
			t.Fatalf("Mask(%q)\nwant %q\ngot  %q", input, expected, actual)
		}
	}

	def := Definition{Redaction: RedactionRule{SensitiveKeys: []string{"api_key", "password", "tls_roots_password"}}}
	if actual := Mask("https://example.com?api_key=secret&x=1", def); actual != "https://example.com?api_key=***&x=1" {
		t.Fatalf("spec-defined query key was not masked: %s", actual)
	}
	if actual := Mask("host=db password=secret token=abc", def); actual != "host=db password=*** token=abc" {
		t.Fatalf("spec-defined key-value field was not masked: %s", actual)
	}
	if actual := Mask("https::addr=localhost;tls_roots_password=secret;", def); actual != "https::addr=localhost;tls_roots_password=***;" {
		t.Fatalf("spec-defined key was not masked: %s", actual)
	}
}

func loadFixtures(t *testing.T) []fixture {
	t.Helper()
	data, err := os.ReadFile("../../specs/fixtures/compatibility.json")
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

func assertNoSensitiveSafeLeak(t *testing.T, address *Address, name string) {
	t.Helper()
	for key, secret := range address.Credentials {
		if secret == "" || key == "username" {
			continue
		}
		if strings.Contains(address.Safe, ":"+secret+"@") || strings.Contains(address.Safe, key+"="+secret) {
			t.Fatalf("%s safe leaked credentials.%s", name, key)
		}
		if key == "password" && strings.Contains(address.Safe, "password="+secret) {
			t.Fatalf("%s safe leaked credentials.%s", name, key)
		}
	}
	for key, secret := range address.Query {
		lower := strings.ToLower(key)
		if !strings.Contains(lower, "password") &&
			!strings.Contains(lower, "token") &&
			!strings.Contains(lower, "secret") &&
			!strings.Contains(lower, "api_key") &&
			!strings.Contains(lower, "apikey") {
			continue
		}
		for _, item := range valuesFor(secret) {
			text := toString(item)
			if text != "" && strings.Contains(address.Safe, key+"="+text) {
				t.Fatalf("%s safe leaked query.%s", name, key)
			}
		}
	}
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
