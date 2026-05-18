package connparse

import (
	"errors"
	"net/url"
	"sort"
	"strings"
)

type CanonicalizeOptions struct {
	Parse              Options
	Definition         Definition
	IncludeCredentials bool
	IncludeDefaultPort bool
	IncludeSensitive   bool
	OmitFragment       bool
}

type canonicalHost struct {
	Host string
	Port any
}

func Canonicalize(input string, options ...CanonicalizeOptions) (string, error) {
	opts := canonicalOptions(options...)
	result := Parse(input, opts.Parse)
	if !result.OK {
		if len(result.Errors) == 0 {
			return "", nil
		}
		return "", errorsFromDiagnostics(result.Errors)
	}
	return CanonicalizeAddress(result.Value, opts), nil
}

func CanonicalizeAddress(address *Address, options ...CanonicalizeOptions) string {
	opts := canonicalOptions(options...)
	def := definitionForCanonical(address, opts)
	scheme := canonicalScheme(address, def)
	authority := canonicalAuthority(address, def, opts)
	path := canonicalPath(address)
	query := canonicalQuery(address, def, opts)
	fragment := canonicalFragment(address, opts)

	if scheme == "file" && authority == "" {
		if strings.HasPrefix(path, "/") {
			return "file://" + path + query + fragment
		}
		return "file:" + path + query + fragment
	}
	if authority == "" {
		return scheme + ":" + path + query + fragment
	}
	return scheme + "://" + canonicalUserInfo(address, opts) + authority + path + query + fragment
}

func Equivalent(left, right string, options ...CanonicalizeOptions) (bool, error) {
	opts := canonicalOptions(options...)
	leftValue, err := Canonicalize(left, opts)
	if err != nil {
		return false, err
	}
	rightValue, err := Canonicalize(right, opts)
	if err != nil {
		return false, err
	}
	return leftValue == rightValue, nil
}

func ParseNormalize(input string, options ...CanonicalizeOptions) NormalizedResult {
	opts := canonicalOptions(options...)
	result := Parse(input, opts.Parse)
	if !result.OK {
		return NormalizedResult{OK: false, Value: nil, Errors: result.Errors, Warnings: result.Warnings}
	}
	return NormalizedResult{
		OK:       true,
		Value:    NormalizeAddress(result.Value, opts),
		Errors:   result.Errors,
		Warnings: result.Warnings,
	}
}

func NormalizeAddress(address *Address, options ...CanonicalizeOptions) *NormalizedAddress {
	opts := canonicalOptions(options...)
	def := definitionForCanonical(address, opts)
	canonical := CanonicalizeAddress(address, opts)
	return &NormalizedAddress{
		Scheme:      canonicalScheme(address, def),
		Type:        address.Type,
		Authority:   normalizedAuthority(address, def, opts),
		Resource:    address.Resource,
		Path:        address.Path,
		Query:       normalizedQuery(address, def, opts),
		Fragment:    normalizedFragment(address, opts),
		Credentials: normalizedCredentials(address, opts),
		Options:     normalizedOptions(address),
		Raw:         canonical,
		Safe:        canonical,
		Canonical:   canonical,
	}
}

func canonicalOptions(options ...CanonicalizeOptions) CanonicalizeOptions {
	if len(options) == 0 {
		return CanonicalizeOptions{}
	}
	return options[0]
}

func errorsFromDiagnostics(items []Diagnostic) error {
	messages := make([]string, len(items))
	for i, item := range items {
		messages[i] = item.Message
	}
	return errors.New(strings.Join(messages, "; "))
}

func definitionForCanonical(address *Address, opts CanonicalizeOptions) Definition {
	if opts.Definition.ID != "" || len(opts.Definition.Schemes) > 0 {
		return opts.Definition
	}
	definitions := BuiltInDefinitions()
	definitions = append(definitions, opts.Parse.Definitions...)
	registry, err := NewRegistry(definitions)
	if err != nil {
		return Definition{}
	}
	if opts.Parse.Provider != "" {
		provider := strings.ToLower(opts.Parse.Provider)
		if def, ok := registry.ByID(provider); ok {
			return def
		}
		if def, ok := registry.ByScheme(provider); ok {
			return def
		}
	}
	if strings.HasPrefix(strings.ToLower(address.Scheme), "jdbc:") {
		parts := strings.SplitN(address.Scheme, ":", 3)
		if len(parts) > 1 {
			if def, ok := registry.ByScheme(parts[1]); ok {
				return def
			}
		}
	}
	if def, ok := registry.ByScheme(address.Scheme); ok {
		return def
	}
	return Definition{}
}

func canonicalScheme(address *Address, def Definition) string {
	scheme := strings.ToLower(address.Scheme)
	if strings.HasPrefix(scheme, "jdbc:") {
		return scheme
	}
	for _, item := range def.Schemes {
		if strings.ToLower(item) == scheme && len(def.Schemes) > 0 {
			return strings.ToLower(def.Schemes[0])
		}
	}
	return scheme
}

func canonicalAuthority(address *Address, def Definition, opts CanonicalizeOptions) string {
	hosts := canonicalHosts(address)
	parts := make([]string, len(hosts))
	for i, host := range hosts {
		parts[i] = formatCanonicalHost(host.Host) + formatCanonicalPort(host.Port, def, opts)
	}
	return strings.Join(parts, ",")
}

func canonicalHosts(address *Address) []canonicalHost {
	if hosts, ok := address.Authority["hosts"].([]map[string]any); ok {
		out := make([]canonicalHost, len(hosts))
		for i, host := range hosts {
			out[i] = canonicalHost{Host: asString(host["host"]), Port: host["port"]}
		}
		return out
	}
	if host := asString(address.Authority["host"]); host != "" {
		return []canonicalHost{{Host: host, Port: address.Authority["port"]}}
	}
	if bucket := asString(address.Authority["bucket"]); bucket != "" {
		return []canonicalHost{{Host: bucket}}
	}
	if address.Resource.Type == "bucket" && address.Resource.Name != nil {
		return []canonicalHost{{Host: asString(address.Resource.Name)}}
	}
	return nil
}

func formatCanonicalHost(host string) string {
	value := strings.ToLower(host)
	if strings.Contains(value, ":") && !strings.HasPrefix(value, "[") {
		return "[" + value + "]"
	}
	return value
}

func formatCanonicalPort(port any, def Definition, opts CanonicalizeOptions) string {
	if port == nil || asString(port) == "" {
		return ""
	}
	numeric, ok := toInt(port)
	if !ok {
		return ""
	}
	if !opts.IncludeDefaultPort && numeric == defaultPort(def) {
		return ""
	}
	return ":" + toString(numeric)
}

func canonicalPath(address *Address) string {
	path := address.Path
	if address.Type == "file" || address.Scheme == "file" {
		return escapePath(path)
	}
	segments := []string{}
	if address.Resource.Name != nil && address.Resource.Type != "none" && address.Resource.Type != "bucket" {
		if name := asString(address.Resource.Name); name != "" {
			segments = append(segments, pathEscape(name))
		}
	}
	if path != "" {
		for _, item := range strings.Split(path, "/") {
			if item != "" {
				segments = append(segments, pathEscape(item))
			}
		}
	}
	if len(segments) == 0 {
		return ""
	}
	return "/" + strings.Join(segments, "/")
}

func escapePath(path string) string {
	if path == "" {
		return ""
	}
	parts := strings.Split(path, "/")
	for i, item := range parts {
		parts[i] = pathEscape(item)
	}
	return strings.Join(parts, "/")
}

func pathEscape(value string) string {
	return url.PathEscape(value)
}

func canonicalUserInfo(address *Address, opts CanonicalizeOptions) string {
	if !opts.IncludeCredentials {
		return ""
	}
	username := address.Credentials["username"]
	password := address.Credentials["password"]
	if username == "" && password == "" {
		return ""
	}
	if password == "" {
		return queryEscape(username) + "@"
	}
	return queryEscape(username) + ":" + queryEscape(password) + "@"
}

func canonicalQuery(address *Address, def Definition, opts CanonicalizeOptions) string {
	if len(address.Query) == 0 {
		return ""
	}
	keys := make([]string, 0, len(address.Query))
	for key := range address.Query {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := []string{}
	for _, key := range keys {
		for _, value := range valuesFor(address.Query[key]) {
			parts = append(parts, queryEscape(key)+"="+queryEscape(canonicalQueryValue(key, value, def, opts)))
		}
	}
	return "?" + strings.Join(parts, "&")
}

func canonicalQueryValue(key string, value any, def Definition, opts CanonicalizeOptions) string {
	if !opts.IncludeSensitive && canonicalSensitiveKeys(def)[strings.ToLower(strings.TrimSpace(key))] {
		return "***"
	}
	rule, ok := def.QueryParameters[key]
	if ok && rule.Type == "boolean" {
		return canonicalBoolean(value)
	}
	if ok && rule.Type == "number" {
		return canonicalNumber(value)
	}
	return toString(value)
}

func canonicalSensitiveKeys(def Definition) map[string]bool {
	keys := map[string]bool{}
	for _, key := range def.Redaction.SensitiveKeys {
		keys[strings.ToLower(strings.TrimSpace(key))] = true
	}
	return keys
}

func canonicalBoolean(value any) string {
	switch strings.ToLower(toString(value)) {
	case "true", "1", "yes":
		return "true"
	case "false", "0", "no":
		return "false"
	default:
		return toString(value)
	}
}

func canonicalNumber(value any) string {
	return toString(value)
}

func canonicalFragment(address *Address, opts CanonicalizeOptions) string {
	if opts.OmitFragment || address.Fragment == nil || asString(address.Fragment) == "" {
		return ""
	}
	return "#" + queryEscape(asString(address.Fragment))
}

func normalizedAuthority(address *Address, def Definition, opts CanonicalizeOptions) map[string]any {
	hosts := canonicalHosts(address)
	if len(hosts) == 0 {
		return map[string]any{}
	}
	if len(hosts) > 1 {
		out := make([]map[string]any, len(hosts))
		for i, host := range hosts {
			out[i] = map[string]any{
				"host": strings.ToLower(host.Host),
				"port": normalizedPort(host.Port, def, opts),
			}
		}
		return map[string]any{"hosts": out}
	}
	host := hosts[0]
	if address.Resource.Type == "bucket" {
		out := map[string]any{"bucket": strings.ToLower(host.Host)}
		if region := asString(address.Authority["region"]); region != "" {
			out["region"] = region
		}
		return out
	}
	return map[string]any{
		"host": strings.ToLower(host.Host),
		"port": normalizedPort(host.Port, def, opts),
	}
}

func normalizedPort(port any, def Definition, opts CanonicalizeOptions) any {
	if port == nil || asString(port) == "" {
		return nil
	}
	numeric, ok := toInt(port)
	if !ok {
		return nil
	}
	if !opts.IncludeDefaultPort && numeric == defaultPort(def) {
		return nil
	}
	return numeric
}

func normalizedQuery(address *Address, def Definition, opts CanonicalizeOptions) map[string]any {
	out := map[string]any{}
	keys := make([]string, 0, len(address.Query))
	for key := range address.Query {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		values := valuesFor(address.Query[key])
		if len(values) == 1 {
			out[key] = canonicalQueryValue(key, values[0], def, opts)
			continue
		}
		items := make([]any, len(values))
		for i, value := range values {
			items[i] = canonicalQueryValue(key, value, def, opts)
		}
		out[key] = items
	}
	return out
}

func normalizedFragment(address *Address, opts CanonicalizeOptions) any {
	if opts.OmitFragment {
		return nil
	}
	return address.Fragment
}

func normalizedCredentials(address *Address, opts CanonicalizeOptions) map[string]string {
	if !opts.IncludeCredentials {
		return map[string]string{}
	}
	out := map[string]string{}
	keys := make([]string, 0, len(address.Credentials))
	for key := range address.Credentials {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		out[key] = address.Credentials[key]
	}
	return out
}

func normalizedOptions(address *Address) map[string]any {
	out := map[string]any{}
	keys := make([]string, 0, len(address.Options))
	for key := range address.Options {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		out[key] = address.Options[key]
	}
	return out
}

func queryEscape(value string) string {
	escaped := strings.ReplaceAll(url.QueryEscape(value), "+", "%20")
	return strings.ReplaceAll(escaped, "%2A", "*")
}
