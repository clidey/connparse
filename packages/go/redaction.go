package connparse

import (
	"net/url"
	"regexp"
	"strings"
)

func Mask(input string, definitions ...Definition) string {
	return maskSensitiveKeyValues(maskSensitiveQuery(maskUserInfo(input), definitions...), definitions...)
}

func maskUserInfo(value string) string {
	marker := strings.Index(value, "://")
	start := 0
	if marker != -1 {
		start = marker + 3
	}
	end := len(value)
	for _, ch := range []string{"/", "?", "#"} {
		if idx := strings.Index(value[start:], ch); idx != -1 && start+idx < end {
			end = start + idx
		}
	}
	authority := value[start:end]
	at := strings.LastIndex(authority, "@")
	if at == -1 {
		return value
	}
	userInfo := authority[:at]
	if marker == -1 && !strings.Contains(userInfo, ":") {
		return value
	}
	host := authority[at+1:]
	colon := strings.Index(userInfo, ":")
	if colon == -1 {
		return value
	}
	masked := userInfo[:colon] + ":***"
	return value[:start] + masked + "@" + host + value[end:]
}

func maskSensitiveQuery(value string, definitions ...Definition) string {
	re := regexp.MustCompile(`([?&])([^=&#]+)=([^&#]*)`)
	return re.ReplaceAllStringFunc(value, func(match string) string {
		parts := re.FindStringSubmatch(match)
		key, err := url.QueryUnescape(parts[2])
		if err != nil {
			key = parts[2]
		}
		if isSensitiveKey(key, definitions...) {
			return parts[1] + parts[2] + "=***"
		}
		return match
	})
}

func maskSensitiveKeyValues(value string, definitions ...Definition) string {
	re := regexp.MustCompile(`(^|[;,&\s])([^=;,&\s]+)=([^;,&\s]*)`)
	return re.ReplaceAllStringFunc(value, func(match string) string {
		parts := re.FindStringSubmatch(match)
		if isSensitiveKey(parts[2], definitions...) {
			return parts[1] + parts[2] + "=***"
		}
		return match
	})
}

func isSensitiveKey(key string, definitions ...Definition) bool {
	normalized := normalizeRedactionKey(key)
	for _, def := range definitions {
		for _, item := range def.Redaction.SensitiveKeys {
			if normalizeRedactionKey(item) == normalized {
				return true
			}
		}
	}
	return false
}

func normalizeRedactionKey(key string) string {
	return strings.ToLower(strings.TrimSpace(key))
}
