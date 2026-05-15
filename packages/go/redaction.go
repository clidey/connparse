package connparse

import (
	"net/url"
	"regexp"
	"strings"
)

var sensitiveKeys = map[string]bool{
	"access_key": true, "accesskey": true, "access_key_id": true,
	"api_key": true, "apikey": true, "aws_access_key_id": true,
	"password": true, "secret": true, "secret_key": true,
	"secretaccesskey": true, "token": true,
}

func Mask(input string) string {
	return maskSensitiveKeyValues(maskSensitiveQuery(maskUserInfo(input)))
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

func maskSensitiveQuery(value string) string {
	re := regexp.MustCompile(`([?&])([^=&#]+)=([^&#]*)`)
	return re.ReplaceAllStringFunc(value, func(match string) string {
		parts := re.FindStringSubmatch(match)
		key, _ := url.QueryUnescape(parts[2])
		if sensitiveKeys[strings.ToLower(key)] {
			return parts[1] + parts[2] + "=***"
		}
		return match
	})
}

func maskSensitiveKeyValues(value string) string {
	re := regexp.MustCompile(`(^|[;,&\s])([^=;,&\s]+)=([^;,&\s]*)`)
	return re.ReplaceAllStringFunc(value, func(match string) string {
		parts := re.FindStringSubmatch(match)
		if sensitiveKeys[strings.ToLower(strings.TrimSpace(parts[2]))] {
			return parts[1] + parts[2] + "=***"
		}
		return match
	})
}
