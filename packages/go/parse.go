package connparse

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

type adapterFunc func(string, Definition, string) (*Address, error)

var adapters = map[string]adapterFunc{
	"generic-uri":         parseGenericURI,
	"mongodb":             parseMongoDB,
	"object-storage":      parseObjectStorage,
	"redis":               parseRedis,
	"file":                parseFile,
	"sqlite":              parseSQLite,
	"duckdb":              parseDuckDB,
	"jdbc":                parseJDBC,
	"clickhouse":          parseClickHouse,
	"memcached":           parseMemcached,
	"elasticsearch":       parseElasticsearch,
	"s3":                  parseS3,
	"questdb":             parseQuestDB,
	"postgres-compatible": parsePostgresCompatible,
	"mysql-compatible":    parseMySQLCompatible,
}

func Parse(input string, options ...Options) Result {
	opts := Options{}
	if len(options) > 0 {
		opts = options[0]
	}
	if strings.TrimSpace(input) == "" {
		return fail("EMPTY_INPUT", "Connparse input cannot be empty", "raw")
	}

	definitions := BuiltInDefinitions()
	definitions = append(definitions, opts.Definitions...)
	registry, err := NewRegistry(definitions)
	if err != nil {
		return fail("INVALID_DEFINITION", err.Error(), "definitions")
	}

	scheme, def, found := inferDefinition(input, registry, opts)
	if scheme == "" {
		return fail("MISSING_SCHEME", "Input must include a scheme or look like a file path", "scheme")
	}
	if !found {
		return parseUnknown(input, scheme, opts.Strict)
	}

	adapterName := def.Adapter
	if adapterName == "" {
		adapterName = "generic-uri"
	}
	adapter, adapterFound := adapters[adapterName]
	if !adapterFound {
		return fail("UNKNOWN_ADAPTER", fmt.Sprintf("%s references missing adapter %s", def.ID, adapterName), "adapter")
	}

	value, err := adapter(input, def, input)
	if err != nil {
		return fail("PARSE_FAILED", err.Error(), "raw")
	}

	validation := validateAddress(value, def, opts)
	return ok(value, validation.errors, validation.warnings)
}

func ParseOrThrow(input string, options ...Options) (*Address, error) {
	result := Parse(input, options...)
	if result.OK {
		return result.Value, nil
	}
	if len(result.Errors) == 0 {
		return nil, errors.New("Connparse failed")
	}
	messages := make([]string, len(result.Errors))
	for i, item := range result.Errors {
		messages[i] = item.Message
	}
	return nil, errors.New(strings.Join(messages, "; "))
}

func inferDefinition(raw string, registry *Registry, options Options) (string, Definition, bool) {
	if options.Provider != "" {
		provider := strings.ToLower(options.Provider)
		if def, ok := registry.ByID(provider); ok {
			return provider, def, true
		}
		if def, ok := registry.ByScheme(provider); ok {
			return provider, def, true
		}
		return provider, Definition{}, false
	}

	if isClickHouseJDBC(raw) {
		def, ok := registry.ByScheme("clickhouse")
		return "jdbc:clickhouse", def, ok
	}
	if regexp.MustCompile(`(?i)^jdbc:postgresql:\/\/`).MatchString(raw) {
		def, ok := registry.ByScheme("postgres")
		return "jdbc:postgresql", def, ok
	}
	if regexp.MustCompile(`(?i)^jdbc:mysql:\/\/`).MatchString(raw) {
		def, ok := registry.ByScheme("mysql")
		return "jdbc:mysql", def, ok
	}
	if regexp.MustCompile(`(?i)^jdbc:mariadb(?::[a-z-]+)?:\/\/`).MatchString(raw) {
		def, ok := registry.ByScheme("mariadb")
		return "jdbc:mariadb", def, ok
	}
	if isQuestDBConfig(raw) {
		def, ok := registry.ByScheme("questdb")
		return "questdb", def, ok
	}
	if looksLikeDuckDBPath(raw) {
		def, ok := registry.ByScheme("duckdb")
		return "duckdb", def, ok
	}
	if isS3HTTPURL(raw) {
		def, ok := registry.ByScheme("s3")
		return "s3", def, ok
	}

	scheme := extractScheme(raw)
	if scheme == "" && looksLikeFilePath(raw) {
		def, ok := registry.ByScheme("file")
		return "file", def, ok
	}
	if scheme == "" {
		return "", Definition{}, false
	}
	def, ok := registry.ByScheme(scheme)
	return scheme, def, ok
}

func parseUnknown(raw string, scheme string, strict bool) Result {
	warning := diagnostic("UNKNOWN_SCHEME", fmt.Sprintf("%s does not have a registered Connparse definition", scheme), "scheme")
	if strict {
		return fail(warning.Code, warning.Message, warning.Path)
	}

	p, err := parseHierarchical(raw)
	if err != nil {
		return fail("INVALID_URL", fmt.Sprintf("Could not parse %s address", scheme), "raw")
	}
	name, _ := firstRest(p.PathSegments)
	value := baseAddress(
		Definition{Type: "unknown"},
		scheme,
		raw,
		Mask(raw),
		map[string]any{"host": p.Host, "port": p.Port},
		Resource{Type: "unknown", Name: nullable(name)},
		p.Pathname,
		p.Query,
		p.Fragment,
		nil,
		nil,
	)
	return ok(value, nil, []Diagnostic{warning})
}
