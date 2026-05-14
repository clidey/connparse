package connparse

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var schemeRE = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9+.-]*):`)

func extractScheme(input string) string {
	m := schemeRE.FindStringSubmatch(input)
	if len(m) == 0 {
		return ""
	}
	return strings.ToLower(m[1])
}

func safeDecode(value string) string {
	decoded, err := url.PathUnescape(value)
	if err != nil {
		decoded, err = url.QueryUnescape(value)
	}
	if err != nil {
		return value
	}
	return decoded
}

func splitPath(pathname string) []string {
	pathname = strings.TrimPrefix(pathname, "/")
	if pathname == "" {
		return []string{}
	}
	raw := strings.Split(pathname, "/")
	out := make([]string, 0, len(raw))
	for _, part := range raw {
		out = append(out, safeDecode(part))
	}
	return out
}

func parseQuery(search string) map[string]any {
	query := map[string]any{}
	values, _ := url.ParseQuery(strings.TrimPrefix(search, "?"))
	for key, vals := range values {
		if len(vals) == 1 {
			query[key] = vals[0]
		} else {
			items := make([]any, len(vals))
			for i, v := range vals {
				items[i] = v
			}
			query[key] = items
		}
	}
	return query
}

func parseHostPort(value string) map[string]any {
	if value == "" {
		return map[string]any{"host": "", "port": nil}
	}
	if strings.HasPrefix(value, "[") {
		close := strings.Index(value, "]")
		if close != -1 {
			host := value[1:close]
			rest := value[close+1:]
			if strings.HasPrefix(rest, ":") && len(rest) > 1 {
				if port, err := strconv.Atoi(rest[1:]); err == nil {
					return map[string]any{"host": host, "port": port}
				}
			}
			return map[string]any{"host": host, "port": nil}
		}
	}
	colon := strings.LastIndex(value, ":")
	if colon > -1 && strings.Count(value, ":") == 1 {
		if port, err := strconv.Atoi(value[colon+1:]); err == nil {
			return map[string]any{"host": value[:colon], "port": port}
		}
	}
	return map[string]any{"host": value, "port": nil}
}

func looksLikeFilePath(input string) bool {
	return strings.HasPrefix(input, "/") ||
		strings.HasPrefix(input, "./") ||
		strings.HasPrefix(input, "../") ||
		strings.HasPrefix(input, "~/") ||
		regexp.MustCompile(`^[A-Za-z]:[\\/]`).MatchString(input)
}

func looksLikeDuckDBPath(input string) bool {
	return regexp.MustCompile(`(?i)\.(duckdb|ddb)([?#].*)?$`).MatchString(input)
}

func asString(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(toString(value)), `"`), `"`))
}

func toString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		if v == float64(int(v)) {
			return strconv.Itoa(int(v))
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func defaultPort(def Definition) int {
	if def.Defaults == nil {
		return 0
	}
	switch v := def.Defaults["port"].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	}
	return 0
}

func basename(path string) string {
	path = strings.TrimRight(path, "/")
	if path == "" {
		return path
	}
	idx := strings.LastIndex(path, "/")
	if idx == -1 {
		return path
	}
	return path[idx+1:]
}
