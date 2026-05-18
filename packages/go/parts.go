package connparse

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var hierRE = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$`)

func parseHierarchical(input string) (parts, error) {
	m := hierRE.FindStringSubmatch(input)
	if len(m) == 0 {
		u, err := url.Parse(input)
		if err != nil {
			return parts{}, err
		}
		return fromURL(u), nil
	}

	scheme, authorityText, pathname, search := strings.ToLower(m[1]), m[2], m[3], m[4]
	var fragment any
	if len(m) > 5 && m[5] != "" {
		fragment = safeDecode(m[5])
	}
	at := strings.LastIndex(authorityText, "@")
	userInfo := ""
	hostText := authorityText
	if at != -1 {
		userInfo = authorityText[:at]
		hostText = authorityText[at+1:]
	}
	username, password := "", ""
	if userInfo != "" {
		info := strings.Split(userInfo, ":")
		username = safeDecode(info[0])
		if len(info) > 1 {
			password = safeDecode(strings.Join(info[1:], ":"))
		}
	}
	hosts := []map[string]any{}
	for _, host := range strings.Split(hostText, ",") {
		if host == "" {
			continue
		}
		hosts = append(hosts, parseHostPort(host))
	}
	host := ""
	var port any
	if len(hosts) > 0 {
		host = asString(hosts[0]["host"])
		port = hosts[0]["port"]
	}
	return parts{Scheme: scheme, Username: username, Password: password, Host: host, Port: port, Hosts: hosts, Pathname: pathname, PathSegments: splitPath(pathname), Query: parseQuery(search), Fragment: fragment}, nil
}

func fromURL(u *url.URL) parts {
	port := any(nil)
	if u.Port() != "" {
		if p, err := strconv.Atoi(u.Port()); err == nil {
			port = p
		}
	}
	host := u.Hostname()
	return parts{
		Scheme:   strings.TrimSuffix(strings.ToLower(u.Scheme), ":"),
		Username: safeDecode(u.User.Username()),
		Password: func() string { p, _ := u.User.Password(); return safeDecode(p) }(),
		Host:     host, Port: port,
		Hosts:    []map[string]any{{"host": host, "port": port}},
		Pathname: u.Path, PathSegments: splitPath(u.Path), Query: parseQuery(u.RawQuery),
		Fragment: func() any {
			if u.Fragment == "" {
				return nil
			}
			return safeDecode(u.Fragment)
		}(),
	}
}

func credentialsFromParts(p parts) map[string]string {
	creds := map[string]string{}
	if p.Username != "" {
		creds["username"] = p.Username
	}
	if p.Password != "" {
		creds["password"] = p.Password
	}
	return creds
}

func applyDefaultPort(authority map[string]any, def Definition) map[string]any {
	port := defaultPort(def)
	if port == 0 {
		return authority
	}
	if authority["port"] == nil && asString(authority["host"]) != "" {
		authority["port"] = port
	}
	if rawHosts, ok := authority["hosts"].([]map[string]any); ok {
		for _, host := range rawHosts {
			if host["port"] == nil {
				host["port"] = port
			}
		}
	}
	return authority
}

func authorityFromParts(p parts, def Definition, omitPorts bool) map[string]any {
	if len(p.Hosts) > 1 {
		hosts := make([]map[string]any, len(p.Hosts))
		for i, h := range p.Hosts {
			hosts[i] = map[string]any{"host": h["host"], "port": h["port"]}
			if omitPorts {
				hosts[i]["port"] = nil
			}
		}
		auth := map[string]any{"hosts": hosts}
		if !omitPorts {
			return applyDefaultPort(auth, def)
		}
		return auth
	}
	auth := map[string]any{"host": p.Host, "port": p.Port}
	if omitPorts {
		auth["port"] = nil
		return auth
	}
	return applyDefaultPort(auth, def)
}

func baseAddress(def Definition, scheme, raw, safe string, authority map[string]any, resource Resource, path string, query map[string]any, fragment any, credentials map[string]string, options map[string]any) *Address {
	if authority == nil {
		authority = map[string]any{}
	}
	if query == nil {
		query = map[string]any{}
	}
	if credentials == nil {
		credentials = map[string]string{}
	}
	if options == nil {
		options = map[string]any{}
	}
	if def.Options != nil {
		merged := map[string]any{}
		for key, value := range def.Options {
			merged[key] = value
		}
		for key, value := range options {
			merged[key] = value
		}
		options = merged
	}
	if resource.Type == "" {
		resource = Resource{Type: "none", Name: nil}
	}
	return &Address{Scheme: scheme, Type: def.Type, Authority: authority, Resource: resource, Path: path, Query: query, Fragment: fragment, Credentials: credentials, Options: options, Raw: raw, Safe: safe}
}
