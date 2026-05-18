package connparse

import (
	"net/url"
	"regexp"
	"strings"
)

func parseGenericURI(input string, def Definition, raw string) (*Address, error) {
	p, err := parseHierarchical(input)
	if err != nil {
		return nil, err
	}
	name, rest := firstRest(p.PathSegments)
	return baseAddress(def, p.Scheme, raw, Mask(raw, def), authorityFromParts(p, def, false), Resource{Type: resType(def, "resource"), Name: nullable(name)}, strings.Join(rest, "/"), p.Query, p.Fragment, credentialsFromParts(p), nil), nil
}

func parseMongoDB(input string, def Definition, raw string) (*Address, error) {
	p, err := parseHierarchical(input)
	if err != nil {
		return nil, err
	}
	name, rest := firstRest(p.PathSegments)
	srv := strings.HasSuffix(p.Scheme, "+srv")
	return baseAddress(def, p.Scheme, raw, Mask(raw, def), authorityFromParts(p, def, srv), Resource{Type: resType(def, "database"), Name: nullable(name)}, strings.Join(rest, "/"), p.Query, p.Fragment, credentialsFromParts(p), map[string]any{"srv": srv}), nil
}

func parseRedis(input string, def Definition, raw string) (*Address, error) {
	if strings.Contains(input, "://") {
		p, err := parseHierarchical(input)
		if err != nil {
			return nil, err
		}
		name, _ := firstRest(p.PathSegments)
		defaultTLS, _ := def.Options["tls"].(bool)
		tls := isRedisTLSScheme(p.Scheme) || defaultTLS
		return baseAddress(def, p.Scheme, raw, Mask(raw, def), authorityFromParts(p, def, false), Resource{Type: resType(def, "database_index"), Name: nullable(name)}, "", p.Query, p.Fragment, credentialsFromParts(p), map[string]any{"tls": tls}), nil
	}
	entries := splitNonEmpty(input, ",")
	endpoints, opts, creds := []map[string]any{}, map[string]any{}, map[string]string{}
	for _, entry := range entries {
		if !strings.Contains(entry, "=") {
			h := parseHostPort(entry)
			if h["port"] == nil {
				h["port"] = defaultPort(def)
			}
			endpoints = append(endpoints, h)
			continue
		}
		kv := strings.SplitN(entry, "=", 2)
		key, val := kv[0], kv[1]
		switch strings.ToLower(key) {
		case "password":
			creds["password"] = val
		case "user", "username":
			creds["username"] = val
		default:
			opts[key] = val
		}
	}
	db := opts["defaultDatabase"]
	if db == nil {
		db = opts["defaultdatabase"]
	}
	delete(opts, "defaultDatabase")
	delete(opts, "defaultdatabase")
	defaultTLS, _ := def.Options["tls"].(bool)
	opts["tls"] = strings.EqualFold(asString(opts["ssl"]), "true") || strings.EqualFold(asString(opts["tls"]), "true") || defaultTLS
	return baseAddress(def, "redis", raw, Mask(raw, def), endpointAuthority(endpoints, defaultPort(def)), Resource{Type: resType(def, "database_index"), Name: db}, "", map[string]any{}, nil, creds, opts), nil
}

func parseObjectStorage(input string, def Definition, raw string) (*Address, error) {
	p, err := parseHierarchical(input)
	if err != nil {
		return nil, err
	}
	segments := append([]string{}, p.PathSegments...)
	resourceType := resType(def, "container")
	authority := map[string]any{}
	resourceName := ""
	path := ""
	credentials := credentialsFromParts(p)

	switch {
	case p.Scheme == "gs" || (p.Scheme == "gcs" && p.Host != "storage.googleapis.com"):
		resourceName = p.Host
		path = strings.Join(segments, "/")
		authority["bucket"] = resourceName
	case (p.Scheme == "gcs" || p.Scheme == "https") && p.Host == "storage.googleapis.com":
		if len(segments) > 0 {
			resourceName = segments[0]
			segments = segments[1:]
		}
		path = strings.Join(segments, "/")
		authority["bucket"] = resourceName
	case p.Scheme == "abfs" || p.Scheme == "abfss":
		resourceName = p.Username
		path = strings.Join(segments, "/")
		authority["host"] = p.Host
		authority["account"] = accountFromHost(p.Host)
		credentials = map[string]string{}
	default:
		if len(segments) > 0 {
			resourceName = segments[0]
			segments = segments[1:]
		}
		path = strings.Join(segments, "/")
		authority["host"] = p.Host
		authority["account"] = accountFromHost(p.Host)
	}

	if project := firstQueryString(p.Query, "project", "project_id", "projectId"); project != "" {
		authority["project"] = project
	}

	return baseAddress(def, p.Scheme, raw, Mask(raw, def), authority, Resource{Type: resourceType, Name: nullable(resourceName)}, path, p.Query, p.Fragment, credentials, map[string]any{"source_scheme": p.Scheme, "tls": p.Scheme == "https" || p.Scheme == "abfss"}), nil
}

func accountFromHost(host string) string {
	return strings.Split(host, ".")[0]
}

func firstQueryString(query map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := query[key]; value != nil {
			return asString(value)
		}
	}
	return ""
}

func isRedisTLSScheme(scheme string) bool {
	switch scheme {
	case "rediss", "valkeys", "dragonflys", "elasticaches", "memorydbs", "azure-managed-rediss":
		return true
	default:
		return false
	}
}

func parseFile(input string, def Definition, raw string) (*Address, error) {
	path, query, fragment, auth := input, map[string]any{}, any(nil), map[string]any{}
	if strings.HasPrefix(strings.ToLower(input), "file:") {
		u, err := url.Parse(input)
		if err != nil {
			return nil, err
		}
		path = safeDecode(u.Path)
		query = parseQuery(u.RawQuery)
		if u.Fragment != "" {
			fragment = safeDecode(u.Fragment)
		}
		if u.Host != "" {
			auth["host"] = u.Host
		}
	} else {
		path, query, fragment = stripMeta(path)
	}
	return baseAddress(def, "file", raw, Mask(raw, def), auth, Resource{Type: "none", Name: nil}, path, query, fragment, nil, nil), nil
}

func parseSQLite(input string, def Definition, raw string) (*Address, error) {
	path, query, fragment, opts := "", map[string]any{}, any(nil), map[string]any{}
	if input == "sqlite::memory:" || input == "sqlite:///:memory:" {
		path = ":memory:"
		opts["memory"] = true
	} else if strings.HasPrefix(strings.ToLower(input), "file:") || strings.HasPrefix(strings.ToLower(input), "sqlite:file:") {
		source := regexp.MustCompile(`(?i)^sqlite:file:`).ReplaceAllString(input, "file:")
		if regexp.MustCompile(`(?i)^file:[^/]`).MatchString(source) {
			path, query, fragment = stripMeta(regexp.MustCompile(`(?i)^file:`).ReplaceAllString(source, ""))
		} else {
			u, err := url.Parse(source)
			if err != nil {
				return nil, err
			}
			path = safeDecode(u.Path)
			query = parseQuery(u.RawQuery)
			if u.Fragment != "" {
				fragment = safeDecode(u.Fragment)
			}
		}
	} else if strings.HasPrefix(strings.ToLower(input), "sqlite://") {
		u, err := url.Parse(input)
		if err != nil {
			return nil, err
		}
		path = safeDecode(u.Path)
		query = parseQuery(u.RawQuery)
		if u.Fragment != "" {
			fragment = safeDecode(u.Fragment)
		}
	} else {
		path, query, fragment = stripMeta(regexp.MustCompile(`(?i)^sqlite:`).ReplaceAllString(input, ""))
	}
	return baseAddress(def, "sqlite", raw, Mask(raw, def), map[string]any{}, Resource{Type: resType(def, "database"), Name: nullable(path)}, path, query, fragment, nil, opts), nil
}

func parseDuckDB(input string, def Definition, raw string) (*Address, error) {
	path, query, fragment, opts := "", map[string]any{}, any(nil), map[string]any{}
	if input == "duckdb::memory:" || input == ":memory:" {
		path = ":memory:"
		opts["memory"] = true
	} else if strings.HasPrefix(strings.ToLower(input), "duckdb://") {
		u, err := url.Parse(input)
		if err != nil {
			return nil, err
		}
		path = safeDecode(u.Path)
		query = parseQuery(u.RawQuery)
		if u.Fragment != "" {
			fragment = safeDecode(u.Fragment)
		}
	} else {
		path, query, fragment = stripMeta(regexp.MustCompile(`(?i)^duckdb:`).ReplaceAllString(input, ""))
	}
	return baseAddress(def, "duckdb", raw, Mask(raw, def), map[string]any{}, Resource{Type: resType(def, "database"), Name: nullable(path)}, path, query, fragment, nil, opts), nil
}

func parseJDBC(input string, def Definition, raw string) (*Address, error) {
	re := regexp.MustCompile(`(?i)^jdbc:([a-z]+)(?::([a-z-]+))?://`)
	m := re.FindStringSubmatch(input)
	provider, proto := strings.ToLower(m[1]), ""
	if len(m) > 2 {
		proto = strings.ToLower(m[2])
	}
	rest := input[len(m[0]):]
	mode := ""
	if provider == "mariadb" && stringIn([]string{"replication", "loadbalance", "sequential", "load-balance-read"}, proto) {
		mode = proto
		proto = ""
	}
	parseScheme := provider
	if provider == "ch" {
		parseScheme = "clickhouse"
	}
	p, err := parseHierarchical(parseScheme + "://" + rest)
	if err != nil {
		return nil, err
	}
	port := jdbcDefaultPort(provider, proto, def)
	hosts := make([]map[string]any, len(p.Hosts))
	for i, h := range p.Hosts {
		hosts[i] = map[string]any{"host": h["host"], "port": h["port"]}
		if hosts[i]["port"] == nil && port != 0 {
			hosts[i]["port"] = port
		}
	}
	name, restPath := firstRest(p.PathSegments)
	opts := map[string]any{"jdbc": true}
	if proto != "" {
		opts["protocol"] = proto
	}
	if mode != "" {
		opts["mode"] = mode
	}
	return baseAddress(def, "jdbc:"+provider, raw, Mask(raw, def), endpointAuthority(hosts, port), Resource{Type: resType(def, "database"), Name: nullable(name)}, strings.Join(restPath, "/"), p.Query, p.Fragment, credentialsFromParts(p), opts), nil
}

func parseClickHouse(input string, def Definition, raw string) (*Address, error) {
	if isClickHouseJDBC(input) {
		return parseJDBC(input, def, raw)
	}
	source := input
	if strings.HasPrefix(strings.ToLower(source), "clickhouse:") {
		source = "clickhouse:" + strings.TrimPrefix(source[len("clickhouse:"):], "")
	}
	p, err := parseHierarchical(source)
	if err != nil {
		return nil, err
	}
	name, rest := firstRest(p.PathSegments)
	proto := "native"
	if p.Scheme == "http" || p.Scheme == "https" {
		proto = p.Scheme
	}
	auth := authorityFromParts(p, def, false)
	if auth["port"] == nil {
		auth["port"] = clickhouseDefaultPort(proto, def)
	}
	return baseAddress(def, normalizeCHScheme(p.Scheme), raw, Mask(raw, def), auth, Resource{Type: "database", Name: nullable(name)}, strings.Join(rest, "/"), p.Query, p.Fragment, credentialsFromParts(p), map[string]any{"protocol": proto}), nil
}

func parseMemcached(input string, def Definition, raw string) (*Address, error) {
	hosts, creds, query, tls := []map[string]any{}, map[string]string{}, map[string]any{}, false
	if strings.Contains(input, "://") {
		p, err := parseHierarchical(input)
		if err != nil {
			return nil, err
		}
		for _, h := range p.Hosts {
			if h["port"] == nil {
				h["port"] = defaultPort(def)
			}
			hosts = append(hosts, h)
		}
		creds = credentialsFromParts(p)
		query = p.Query
		tls = p.Scheme == "memcacheds"
	} else {
		for _, entry := range splitNonEmpty(input, ",") {
			h := parseHostPort(entry)
			if h["port"] == nil {
				h["port"] = defaultPort(def)
			}
			hosts = append(hosts, h)
		}
	}
	return baseAddress(def, "memcached", raw, Mask(raw, def), endpointAuthority(hosts, defaultPort(def)), Resource{Type: "none", Name: nil}, "", query, nil, creds, map[string]any{"tls": tls}), nil
}

func parseElasticsearch(input string, def Definition, raw string) (*Address, error) {
	source := input
	lower := strings.ToLower(source)
	if strings.HasPrefix(lower, "elasticsearch+https://") {
		source = "https://" + source[len("elasticsearch+https://"):]
	} else if strings.HasPrefix(lower, "elasticsearch+http://") {
		source = "http://" + source[len("elasticsearch+http://"):]
	} else if strings.HasPrefix(lower, "elasticsearch://") {
		source = "http://" + source[len("elasticsearch://"):]
	} else if strings.HasPrefix(lower, "elastic://") {
		source = "http://" + source[len("elastic://"):]
	}
	p, err := parseHierarchical(source)
	if err != nil {
		return nil, err
	}
	name, rest := firstRest(p.PathSegments)
	creds := credentialsFromParts(p)
	for _, key := range []string{"api_key", "apiKey", "token"} {
		if p.Query[key] != nil {
			k := key
			if key == "apiKey" {
				k = "api_key"
			}
			creds[k] = asString(p.Query[key])
		}
	}
	auth := authorityFromParts(p, def, false)
	if auth["port"] == nil {
		auth["port"] = defaultPort(def)
	}
	return baseAddress(def, "elasticsearch", raw, Mask(raw, def), auth, Resource{Type: "index", Name: nullable(name)}, strings.Join(rest, "/"), p.Query, p.Fragment, creds, map[string]any{"protocol": p.Scheme, "tls": p.Scheme == "https"}), nil
}

func parseS3(input string, def Definition, raw string) (*Address, error) {
	scheme := extractScheme(input)
	bucket, key, region := "", "", ""
	query := map[string]any{}
	var fragment any
	opts := map[string]any{}
	if scheme == "s3" {
		p, err := parseHierarchical(input)
		if err != nil {
			return nil, err
		}
		bucket = p.Host
		key = strings.Join(p.PathSegments, "/")
		query = p.Query
		fragment = p.Fragment
		region = asString(query["region"])
	} else {
		p := fromURL(mustURL(input))
		b, r := parseS3Host(p.Host)
		bucket, region, query, fragment = b, r, p.Query, p.Fragment
		opts["source_scheme"] = scheme
		if bucket != "" {
			key = strings.Join(p.PathSegments, "/")
		} else {
			var rest []string
			bucket, rest = firstRest(p.PathSegments)
			key = strings.Join(rest, "/")
		}
	}
	return baseAddress(def, "s3", raw, Mask(raw, def), map[string]any{"bucket": bucket, "region": region}, Resource{Type: "bucket", Name: nullable(bucket)}, key, query, fragment, nil, opts), nil
}

func parseQuestDB(input string, def Definition, raw string) (*Address, error) {
	if isQuestDBConfig(input) {
		protocol, body, _ := strings.Cut(input, "::")
		grouped := map[string]any{}
		for _, entry := range splitNonEmpty(body, ";") {
			key, value, ok := strings.Cut(entry, "=")
			key = strings.TrimSpace(key)
			value = strings.TrimSpace(value)
			if !ok {
				value = ""
			}
			if existing, ok := grouped[key]; ok {
				switch current := existing.(type) {
				case []any:
					grouped[key] = append(current, value)
				default:
					grouped[key] = []any{current, value}
				}
			} else if key != "" {
				grouped[key] = value
			}
		}

		defaultPort := 9009
		if protocol == "http" || protocol == "https" {
			defaultPort = 9000
		}

		addrs := []any{}
		switch value := grouped["addr"].(type) {
		case []any:
			addrs = value
		case string:
			if value != "" {
				addrs = append(addrs, value)
			}
		}

		hosts := make([]map[string]any, 0, len(addrs))
		for _, addr := range addrs {
			host := parseHostPort(asString(addr))
			if host["port"] == nil {
				host["port"] = defaultPort
			}
			hosts = append(hosts, host)
		}

		query := map[string]any{}
		for key, value := range grouped {
			if key != "addr" {
				query[key] = value
			}
		}

		credentials := map[string]string{}
		for _, key := range []string{"username", "password", "token"} {
			if value, ok := query[key]; ok {
				credentials[key] = asString(value)
				delete(query, key)
			}
		}

		return baseAddress(def, "questdb", raw, Mask(raw, def), endpointAuthority(hosts, defaultPort), Resource{Type: "endpoint", Name: nil}, "", query, nil, credentials, map[string]any{"ingestion": true, "protocol": protocol, "tls": protocol == "https" || protocol == "tcps"}), nil
	}

	p, err := parseHierarchical(input)
	if err != nil {
		return nil, err
	}
	name, rest := firstRest(p.PathSegments)
	auth := authorityFromParts(p, def, false)
	if auth["port"] == nil {
		auth["port"] = defaultPort(def)
	}
	return baseAddress(def, p.Scheme, raw, Mask(raw, def), auth, Resource{Type: "database", Name: nullable(name)}, strings.Join(rest, "/"), p.Query, p.Fragment, credentialsFromParts(p), map[string]any{"compatible_with": "postgres"}), nil
}

func parsePostgresCompatible(input string, def Definition, raw string) (*Address, error) {
	if strings.HasPrefix(strings.ToLower(input), "jdbc:postgresql://") {
		return parseJDBC(input, def, raw)
	}
	if strings.Contains(input, "://") {
		a, err := parseGenericURI(input, def, raw)
		if a != nil && def.Options != nil {
			for k, v := range def.Options {
				a.Options[k] = v
			}
		}
		return a, err
	}
	return parseConninfo(input, def, raw)
}

func parseMySQLCompatible(input string, def Definition, raw string) (*Address, error) {
	if regexp.MustCompile(`(?i)^jdbc:(mysql|mariadb)(?::[a-z-]+)?://`).MatchString(input) {
		return parseJDBC(input, def, raw)
	}
	if strings.Contains(input, "://") {
		return parseGenericURI(input, def, raw)
	}
	return parseGenericURI(def.Schemes[0]+"://"+input, def, raw)
}
