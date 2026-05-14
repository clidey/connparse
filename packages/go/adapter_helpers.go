package connparse

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

func firstRest(items []string) (string, []string) {
	if len(items) == 0 {
		return "", []string{}
	}
	return items[0], items[1:]
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func resType(def Definition, fallback string) string {
	if def.ResourceRule.Type != "" {
		return def.ResourceRule.Type
	}
	return fallback
}

func splitNonEmpty(value string, separator string) []string {
	raw := strings.Split(value, separator)
	out := make([]string, 0, len(raw))
	for _, part := range raw {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func endpointAuthority(hosts []map[string]any, defaultPort int) map[string]any {
	if len(hosts) > 1 {
		out := make([]map[string]any, len(hosts))
		for i, host := range hosts {
			out[i] = map[string]any{"host": host["host"], "port": host["port"]}
			if out[i]["port"] == nil && defaultPort != 0 {
				out[i]["port"] = defaultPort
			}
		}
		return map[string]any{"hosts": out}
	}

	host := ""
	var port any
	if len(hosts) == 1 {
		host = asString(hosts[0]["host"])
		port = hosts[0]["port"]
	}
	if port == nil && host != "" && defaultPort != 0 {
		port = defaultPort
	}
	return map[string]any{"host": host, "port": port}
}

func stringIn(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func stripMeta(input string) (string, map[string]any, any) {
	path := input
	var fragment any
	if hash := strings.Index(path, "#"); hash != -1 {
		fragment = safeDecode(path[hash+1:])
		path = path[:hash]
	}
	query := map[string]any{}
	if q := strings.Index(path, "?"); q != -1 {
		query = parseQuery(path[q+1:])
		path = path[:q]
	}
	return path, query, fragment
}

func mustURL(input string) *url.URL {
	u, err := url.Parse(input)
	if err != nil {
		return &url.URL{}
	}
	return u
}

func isClickHouseJDBC(input string) bool {
	return regexp.MustCompile(`(?i)^jdbc:(clickhouse|ch)(?::[a-z]+)?:\/\/`).MatchString(input)
}

func normalizeCHScheme(scheme string) string {
	if scheme == "ch" {
		return "clickhouse"
	}
	return scheme
}

func clickhouseDefaultPort(protocol string, def Definition) int {
	switch protocol {
	case "https":
		return 8443
	case "http":
		return 8123
	case "grpc":
		return 9100
	default:
		if port := defaultPort(def); port != 0 {
			return port
		}
		return 9000
	}
}

func jdbcDefaultPort(provider string, protocol string, def Definition) int {
	switch provider {
	case "clickhouse", "ch":
		return clickhouseDefaultPort(protocol, def)
	default:
		return defaultPort(def)
	}
}

func isQuestDBConfig(input string) bool {
	return regexp.MustCompile(`(?i)^(http|https|tcp|tcps)::`).MatchString(input)
}

func parseS3Host(host string) (string, string) {
	virtual := regexp.MustCompile(`^(.+)\.s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$`)
	if match := virtual.FindStringSubmatch(strings.ToLower(host)); len(match) > 0 {
		return host[:len(match[1])], match[2]
	}

	pathStyle := regexp.MustCompile(`^s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$`)
	if match := pathStyle.FindStringSubmatch(strings.ToLower(host)); len(match) > 0 {
		return "", match[1]
	}

	return "", ""
}

func isS3HTTPURL(input string) bool {
	u, err := url.Parse(input)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(u.Scheme)
	return (scheme == "http" || scheme == "https") && strings.Contains(strings.ToLower(u.Host), "s3")
}

func parseConninfo(input string, def Definition, raw string) (*Address, error) {
	fields := splitConninfo(input)
	authority := parseHostLists(fields["host"], fields["hostaddr"], fields["port"], defaultPort(def))
	credentials := map[string]string{}
	if fields["user"] != "" {
		credentials["username"] = fields["user"]
	}
	if fields["password"] != "" {
		credentials["password"] = fields["password"]
	}

	query := map[string]any{}
	for key, value := range fields {
		switch key {
		case "host", "hostaddr", "port", "dbname", "user", "password":
			continue
		default:
			query[key] = value
		}
	}

	options := map[string]any{"conninfo": true}
	for key, value := range def.Options {
		options[key] = value
	}

	return baseAddress(def, def.Schemes[0], raw, Mask(raw), authority, Resource{Type: resType(def, "database"), Name: nullable(fields["dbname"])}, "", query, nil, credentials, options), nil
}

func splitConninfo(input string) map[string]string {
	fields := map[string]string{}
	text := strings.TrimSpace(input)
	index := 0

	for index < len(text) {
		for index < len(text) && isSpace(text[index]) {
			index++
		}

		start := index
		for index < len(text) && text[index] != '=' {
			index++
		}
		if start == index || index >= len(text) || text[index] != '=' {
			break
		}
		key := strings.TrimSpace(text[start:index])
		index++

		value := strings.Builder{}
		if index < len(text) && text[index] == '\'' {
			index++
			for index < len(text) {
				if text[index] == '\\' && index+1 < len(text) {
					value.WriteByte(text[index+1])
					index += 2
					continue
				}
				if text[index] == '\'' {
					index++
					break
				}
				value.WriteByte(text[index])
				index++
			}
		} else {
			for index < len(text) && !isSpace(text[index]) {
				value.WriteByte(text[index])
				index++
			}
		}

		if key != "" {
			fields[key] = value.String()
		}
	}

	return fields
}

func isSpace(ch byte) bool {
	return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
}

func parseHostLists(hostValue string, hostAddrValue string, portValue string, defaultPort int) map[string]any {
	source := hostValue
	if source == "" {
		source = hostAddrValue
	}
	hosts := splitNonEmpty(source, ",")
	ports := splitNonEmpty(portValue, ",")
	if len(hosts) > 1 {
		out := make([]map[string]any, len(hosts))
		for i, host := range hosts {
			port := any(nil)
			if i < len(ports) && ports[i] != "" {
				if p, err := strconv.Atoi(ports[i]); err == nil {
					port = p
				}
			} else if defaultPort != 0 {
				port = defaultPort
			}
			out[i] = map[string]any{"host": host, "port": port}
		}
		return map[string]any{"hosts": out}
	}

	host := ""
	if len(hosts) == 1 {
		host = hosts[0]
	}
	parsed := parseHostPort(host)
	port := parsed["port"]
	if port == nil && len(ports) > 0 && ports[0] != "" {
		if p, err := strconv.Atoi(ports[0]); err == nil {
			port = p
		}
	}
	if port == nil && host != "" && defaultPort != 0 {
		port = defaultPort
	}
	return map[string]any{"host": parsed["host"], "port": port}
}
