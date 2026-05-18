package io.github.clidey.connparse;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Connparse {
    private static final Pattern SCHEME_PATTERN = Pattern.compile("^([A-Za-z][A-Za-z0-9+.-]*):");
    private static final Pattern HIERARCHICAL_PATTERN = Pattern.compile("^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(?:\\?([^#]*))?(?:#(.*))?$");

    private Connparse() {}

    public static ParseResult parse(String input) {
        return parse(input, null);
    }

    public static ParseResult parse(String input, ParseOptions options) {
        ParseOptions opts = options == null ? new ParseOptions() : options;
        if (input == null) return fail("INVALID_INPUT_TYPE", "Connparse input must be a string", "raw");
        if (input.trim().isEmpty()) return fail("EMPTY_INPUT", "Connparse input cannot be empty", "raw");

        Registry registry = new Registry(joinDefinitions(builtInDefinitions(), opts.definitions));
        Match match = inferDefinition(input, registry, opts);
        if (match.scheme == null || match.scheme.isEmpty()) {
            return fail("MISSING_SCHEME", "Input must include a scheme or look like a file path", "scheme");
        }
        if (match.definition == null) return parseUnknown(input, match.scheme, opts.strict);

        Definition definition = match.definition;
        String safe = mask(input, definition);
        try {
            Address value = parseByAdapter(input, definition, input, safe);
            Validation validation = validateAddress(value, definition, opts);
            return ok(value, validation.errors, validation.warnings);
        } catch (RuntimeException error) {
            return fail("PARSE_FAILED", error.getMessage(), "raw");
        }
    }

    public static Address parseOrThrow(String input) {
        return parseOrThrow(input, null);
    }

    public static Address parseOrThrow(String input, ParseOptions options) {
        ParseResult result = parse(input, options);
        if (result.ok) return result.value;
        throw new IllegalArgumentException(joinMessages(result.errors));
    }

    public static List<Definition> builtInDefinitions() {
        List<Definition> output = new ArrayList<>();
        for (Definition definition : BuiltInDefinitions.builtInDefinitions()) output.add(definition.copy());
        return output;
    }

    public static String mask(String input) {
        return mask(input, null);
    }

    public static String mask(String input, Definition definition) {
        return maskSensitiveKeyValues(maskSensitiveQuery(maskUserinfo(String.valueOf(input)), definition), definition);
    }

    private static Address parseByAdapter(String input, Definition definition, String raw, String safe) {
        String adapter = definition.adapter == null || definition.adapter.isEmpty() ? "generic-uri" : definition.adapter;
        return switch (adapter) {
            case "clickhouse" -> parseClickhouse(input, definition, raw, safe);
            case "duckdb" -> parseDuckdb(input, definition, raw, safe);
            case "elasticsearch" -> parseElasticsearch(input, definition, raw, safe);
            case "file" -> parseFile(input, definition, raw, safe);
            case "generic-uri", "" -> parseGenericUri(input, definition, raw, safe);
            case "jdbc" -> parseJdbc(input, definition, raw, safe);
            case "memcached" -> parseMemcached(input, definition, raw, safe);
            case "mongodb" -> parseMongodb(input, definition, raw, safe);
            case "mysql-compatible" -> parseMysqlCompatible(input, definition, raw, safe);
            case "object-storage" -> parseObjectStorage(input, definition, raw, safe);
            case "postgres-compatible" -> parsePostgresCompatible(input, definition, raw, safe);
            case "questdb" -> parseQuestdb(input, definition, raw, safe);
            case "redis" -> parseRedis(input, definition, raw, safe);
            case "s3" -> parseS3(input, definition, raw, safe);
            case "sqlite" -> parseSqlite(input, definition, raw, safe);
            default -> throw new IllegalArgumentException(definition.id + " references missing adapter " + adapter);
        };
    }

    private static Match inferDefinition(String raw, Registry registry, ParseOptions options) {
        if (options.provider != null && !options.provider.isBlank()) {
            String provider = options.provider.toLowerCase(Locale.ROOT);
            return new Match(provider, firstNonNull(registry.byId(provider), registry.byScheme(provider)));
        }
        if (isClickhouseJdbc(raw)) return new Match("jdbc:clickhouse", registry.byScheme("clickhouse"));
        if (matches(raw, "^jdbc:postgresql://")) return new Match("jdbc:postgresql", registry.byScheme("postgres"));
        if (matches(raw, "^jdbc:mysql://")) return new Match("jdbc:mysql", registry.byScheme("mysql"));
        if (matches(raw, "^jdbc:mariadb(?::[a-z-]+)?://")) return new Match("jdbc:mariadb", registry.byScheme("mariadb"));
        if (isQuestdbConfig(raw)) return new Match("questdb", registry.byScheme("questdb"));
        if (looksLikeDuckdbPath(raw)) return new Match("duckdb", registry.byScheme("duckdb"));
        if (isS3HttpUrl(raw)) return new Match("s3", registry.byScheme("s3"));
        String scheme = extractScheme(raw);
        if ((scheme == null || scheme.isEmpty()) && looksLikeFilePath(raw)) return new Match("file", registry.byScheme("file"));
        if (scheme == null || scheme.isEmpty()) return new Match(null, null);
        return new Match(scheme, registry.byScheme(scheme));
    }

    private static ParseResult parseUnknown(String raw, String scheme, boolean strict) {
        Diagnostic warning = diagnostic("UNKNOWN_SCHEME", scheme + " does not have a registered Connparse definition", "scheme");
        if (strict) return fail(warning.code, warning.message, warning.path);
        Parts parts = parseHierarchical(raw);
        Address value = baseAddress(
                new Definition("", "", "unknown", List.of(), "", Map.of(), Map.of(), new Definition.Rule("unknown", false), new Definition.Rule("", false), Map.of(), Map.of(), new Definition.ValidationRule(false, null), Map.of(), new Definition.RedactionRule(List.of(), List.of())),
                scheme,
                raw,
                mask(raw),
                authority("host", parts.host, "port", parts.port),
                new Address.Resource("unknown", parts.pathSegments.isEmpty() ? null : parts.pathSegments.get(0)),
                parts.pathname == null ? "" : safeDecode(parts.pathname),
                parts.query,
                parts.fragment,
                Map.of(),
                Map.of());
        return ok(value, List.of(), List.of(warning));
    }

    private static Address parseGenericUri(String input, Definition definition, String raw, String safe) {
        Parts parts = parseHierarchical(input);
        String resourceName = parts.pathSegments.isEmpty() ? null : parts.pathSegments.get(0);
        return baseAddress(
                definition,
                parts.scheme,
                raw,
                safe,
                authorityFromParts(parts, definition.defaults, false),
                new Address.Resource(defaultString(definition.resource.type, "resource"), resourceName),
                join(parts.pathSegments, 1),
                parts.query,
                parts.fragment,
                credentialsFromParts(parts),
                Map.of());
    }

    private static Address parseJdbc(String input, Definition definition, String raw, String safe) {
        Matcher matcher = Pattern.compile("^jdbc:([a-z]+)(?::([a-z-]+))?://", Pattern.CASE_INSENSITIVE).matcher(input);
        if (!matcher.find()) throw new IllegalArgumentException("Invalid JDBC URL");
        String provider = matcher.group(1).toLowerCase(Locale.ROOT);
        String modeOrProtocol = matcher.group(2) == null ? "" : matcher.group(2).toLowerCase(Locale.ROOT);
        String protocol = modeOrProtocol;
        String mode = "";
        if (provider.equals("mariadb") && Set.of("replication", "loadbalance", "sequential", "load-balance-read").contains(protocol)) {
            mode = protocol;
            protocol = "";
        }
        String parseScheme = provider.equals("ch") ? "clickhouse" : provider;
        Parts parts = parseHierarchical(parseScheme + "://" + input.substring(matcher.end()));
        Long defaultPort = jdbcDefaultPort(provider, protocol, definition.defaults);
        List<Map<String, Object>> hosts = new ArrayList<>();
        for (Map<String, Object> entry : parts.hosts) {
            hosts.add(hostEntry(asString(entry.get("host")), entry.get("port") == null ? defaultPort : asLong(entry.get("port"))));
        }
        Map<String, Object> authority = hosts.size() > 1
                ? authority("hosts", hosts)
                : authority("host", hosts.isEmpty() ? "" : hosts.get(0).get("host"), "port", hosts.isEmpty() ? null : hosts.get(0).get("port"));
        Map<String, Object> options = map("jdbc", true);
        if (!protocol.isEmpty()) options.put("protocol", protocol);
        if (!mode.isEmpty()) options.put("mode", mode);
        return baseAddress(definition, "jdbc:" + (provider.equals("ch") ? "ch" : provider), raw, safe, authority, new Address.Resource(defaultString(definition.resource.type, "database"), first(parts.pathSegments)), join(parts.pathSegments, 1), parts.query, parts.fragment, credentialsFromParts(parts), options);
    }

    private static Address parseMysqlCompatible(String input, Definition definition, String raw, String safe) {
        if (matches(input, "^jdbc:(mysql|mariadb)(?::[a-z-]+)?://")) return parseJdbc(input, definition, raw, safe);
        if (hasUriScheme(input)) return parseGenericUri(input, definition, raw, safe);
        return parseGenericUri(firstScheme(definition) + "://" + input, definition, raw, safe);
    }

    private static Address parsePostgresCompatible(String input, Definition definition, String raw, String safe) {
        if (matches(input, "^jdbc:postgresql://")) return parseJdbc(input, definition, raw, safe);
        if (hasUriScheme(input)) {
            Parts parts = parseHierarchical(input);
            return baseAddress(definition, parts.scheme, raw, safe, authorityFromParts(parts, definition.defaults, false), new Address.Resource(defaultString(definition.resource.type, "database"), first(parts.pathSegments)), join(parts.pathSegments, 1), parts.query, parts.fragment, credentialsFromParts(parts), definition.options);
        }
        Map<String, String> fields = splitConninfo(input);
        Map<String, String> credentials = new LinkedHashMap<>();
        if (fields.containsKey("user")) credentials.put("username", fields.get("user"));
        if (fields.containsKey("password")) credentials.put("password", fields.get("password"));
        Map<String, Object> query = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : fields.entrySet()) query.put(entry.getKey(), entry.getValue());
        for (String key : List.of("host", "hostaddr", "port", "dbname", "user", "password")) query.remove(key);
        return baseAddress(definition, firstScheme(definition), raw, safe, parseHostLists(firstNonBlank(fields.get("host"), fields.get("hostaddr"), ""), fields.getOrDefault("port", ""), definition.defaults), new Address.Resource(defaultString(definition.resource.type, "database"), fields.get("dbname")), "", query, null, credentials, map("conninfo", true));
    }

    private static Address parseMongodb(String input, Definition definition, String raw, String safe) {
        Parts parts = parseHierarchical(input);
        boolean srv = parts.scheme.endsWith("+srv");
        return baseAddress(definition, parts.scheme, raw, safe, authorityFromParts(parts, definition.defaults, srv), new Address.Resource(defaultString(definition.resource.type, "database"), first(parts.pathSegments)), join(parts.pathSegments, 1), parts.query, parts.fragment, credentialsFromParts(parts), map("srv", srv));
    }

    private static Address parseRedis(String input, Definition definition, String raw, String safe) {
        if (hasUriScheme(input)) return parseRedisUri(input, definition, raw, safe);
        List<Map<String, Object>> endpoints = new ArrayList<>();
        Map<String, Object> options = new LinkedHashMap<>();
        Map<String, String> credentials = new LinkedHashMap<>();
        for (String entry : splitNonEmpty(input, ",")) {
            if (!entry.contains("=")) {
                Map<String, Object> parsed = parseHostPort(entry);
                endpoints.add(hostEntry(asString(parsed.get("host")), firstLong(parsed.get("port"), defaultPort(definition, 6379))));
                continue;
            }
            String[] pair = entry.split("=", 2);
            String key = pair[0];
            String value = pair.length > 1 ? pair[1] : "";
            if (key.equalsIgnoreCase("password")) credentials.put("password", value);
            else if (key.equalsIgnoreCase("user") || key.equalsIgnoreCase("username")) credentials.put("username", value);
            else options.put(key, value);
        }
        Object database = firstNonNull(removeIgnoreCase(options, "defaultDatabase"), removeIgnoreCase(options, "defaultdatabase"));
        boolean tls = "true".equalsIgnoreCase(asString(firstNonNull(options.get("ssl"), options.get("tls")))) || Boolean.TRUE.equals(definition.options.get("tls"));
        options.put("tls", tls);
        Map<String, Object> authority = endpoints.size() > 1
                ? authority("hosts", endpoints)
                : authority("host", endpoints.isEmpty() ? "" : endpoints.get(0).get("host"), "port", endpoints.isEmpty() ? 6379L : endpoints.get(0).get("port"));
        return baseAddress(definition, "redis", raw, safe, authority, new Address.Resource(defaultString(definition.resource.type, "database_index"), database == null ? null : String.valueOf(database)), "", Map.of(), null, credentials, options);
    }

    private static Address parseRedisUri(String input, Definition definition, String raw, String safe) {
        Parts parts = parseHierarchical(input);
        boolean tls = Set.of("rediss", "valkeys", "dragonflys", "elasticaches", "memorydbs", "azure-managed-rediss").contains(parts.scheme) || Boolean.TRUE.equals(definition.options.get("tls"));
        return baseAddress(definition, parts.scheme, raw, safe, applyDefaultPort(authority("host", parts.host, "port", parts.port), definition.defaults), new Address.Resource(defaultString(definition.resource.type, "database_index"), first(parts.pathSegments)), "", parts.query, parts.fragment, credentialsFromParts(parts), map("tls", tls));
    }

    private static Address parseObjectStorage(String input, Definition definition, String raw, String safe) {
        Parts parts = parseHierarchical(input);
        List<String> segments = new ArrayList<>(parts.pathSegments);
        Map<String, Object> authority = new LinkedHashMap<>();
        Map<String, String> credentials = credentialsFromParts(parts);
        String resourceName = null;
        String path = "";
        if (parts.scheme.equals("gs") || (parts.scheme.equals("gcs") && !parts.host.equals("storage.googleapis.com"))) {
            resourceName = parts.host;
            path = String.join("/", segments);
            authority.put("bucket", resourceName);
        } else if ((parts.scheme.equals("gcs") || parts.scheme.equals("https")) && parts.host.equals("storage.googleapis.com")) {
            resourceName = segments.isEmpty() ? null : segments.remove(0);
            path = String.join("/", segments);
            authority.put("bucket", resourceName == null ? "" : resourceName);
        } else if (parts.scheme.equals("abfs") || parts.scheme.equals("abfss")) {
            resourceName = parts.username.isEmpty() ? null : parts.username;
            path = String.join("/", segments);
            authority.put("host", parts.host);
            authority.put("account", accountFromHost(parts.host));
            credentials = Map.of();
        } else {
            resourceName = segments.isEmpty() ? null : segments.remove(0);
            path = String.join("/", segments);
            authority.put("host", parts.host);
            authority.put("account", accountFromHost(parts.host));
        }
        Object project = firstNonNull(parts.query.get("project"), parts.query.get("project_id"), parts.query.get("projectId"));
        if (project != null) authority.put("project", String.valueOf(project));
        return baseAddress(definition, parts.scheme, raw, safe, authority, new Address.Resource(defaultString(definition.resource.type, "container"), resourceName), path, parts.query, parts.fragment, credentials, map("source_scheme", parts.scheme, "tls", parts.scheme.equals("https") || parts.scheme.equals("abfss")));
    }

    private static Address parseFile(String input, Definition definition, String raw, String safe) {
        String path = input;
        String fragment = null;
        Map<String, Object> query = new LinkedHashMap<>();
        Map<String, Object> authority = new LinkedHashMap<>();
        if (matches(input, "^file:")) {
            Parts parts = parseHierarchical(input);
            path = safeDecode(parts.pathname);
            fragment = parts.fragment;
            query = parts.query;
            if (!parts.host.isEmpty()) authority.put("host", parts.host);
        } else {
            FileMeta meta = stripFileMeta(path);
            path = meta.path;
            fragment = meta.fragment;
            query = meta.query;
        }
        return baseAddress(definition, "file", raw, safe, authority, new Address.Resource("none", null), path, query, fragment, Map.of(), Map.of());
    }

    private static Address parseSqlite(String input, Definition definition, String raw, String safe) {
        String path = "";
        Map<String, Object> query = new LinkedHashMap<>();
        String fragment = null;
        Map<String, Object> options = new LinkedHashMap<>();
        if (input.equals("sqlite::memory:") || input.equals("sqlite:///:memory:")) {
            path = ":memory:";
            options.put("memory", true);
        } else if (matches(input, "^(sqlite|file):") && !matches(input, "^sqlite::memory:$")) {
            String source = input.replaceFirst("(?i)^sqlite:file:", "file:");
            if (matches(source, "^file:[^/]")) {
                FileMeta meta = stripFileMeta(source.replaceFirst("(?i)^file:", ""));
                path = meta.path;
                fragment = meta.fragment;
                query = meta.query;
            } else {
                Parts parts = parseHierarchical(source);
                path = safeDecode(parts.pathname);
                query = parts.query;
                fragment = parts.fragment;
            }
        } else {
            FileMeta meta = stripFileMeta(input.replaceFirst("(?i)^sqlite:", ""));
            path = meta.path;
            fragment = meta.fragment;
        }
        return baseAddress(definition, "sqlite", raw, safe, Map.of(), new Address.Resource(defaultString(definition.resource.type, "database"), path.isEmpty() ? basename(path) : path), path, query, fragment, Map.of(), options);
    }

    private static Address parseDuckdb(String input, Definition definition, String raw, String safe) {
        String path;
        Map<String, Object> query = new LinkedHashMap<>();
        String fragment = null;
        Map<String, Object> options = new LinkedHashMap<>();
        if (input.equals("duckdb::memory:") || input.equals(":memory:")) {
            path = ":memory:";
            options.put("memory", true);
        } else if (matches(input, "^duckdb://")) {
            Parts parts = parseHierarchical(input);
            path = safeDecode(parts.pathname);
            query = parts.query;
            fragment = parts.fragment;
        } else {
            FileMeta meta = stripFileMeta(input.replaceFirst("(?i)^duckdb:", ""));
            path = meta.path;
            fragment = meta.fragment;
            query = meta.query;
        }
        return baseAddress(definition, "duckdb", raw, safe, Map.of(), new Address.Resource(defaultString(definition.resource.type, "database"), path.isEmpty() ? basename(path) : path), path, query, fragment, Map.of(), options);
    }

    private static Address parseClickhouse(String input, Definition definition, String raw, String safe) {
        if (isClickhouseJdbc(input)) return parseJdbc(input, definition, raw, safe);
        Parts parts = parseHierarchical(input);
        String protocol = (parts.scheme.equals("http") || parts.scheme.equals("https")) ? parts.scheme : "native";
        long port = parts.port == null ? clickhouseDefaultPort(protocol, definition.defaults) : parts.port;
        return baseAddress(definition, parts.scheme.equals("ch") ? "clickhouse" : parts.scheme, raw, safe, authority("host", parts.host, "port", port), new Address.Resource("database", first(parts.pathSegments)), join(parts.pathSegments, 1), parts.query, parts.fragment, credentialsFromParts(parts), map("protocol", protocol));
    }

    private static Address parseMemcached(String input, Definition definition, String raw, String safe) {
        List<Map<String, Object>> hosts = new ArrayList<>();
        Map<String, String> credentials = new LinkedHashMap<>();
        Map<String, Object> query = new LinkedHashMap<>();
        boolean tls = false;
        if (hasUriScheme(input)) {
            Parts parts = parseHierarchical(input);
            for (Map<String, Object> entry : parts.hosts) hosts.add(hostEntry(asString(entry.get("host")), firstLong(entry.get("port"), defaultPort(definition, 11211))));
            credentials = credentialsFromParts(parts);
            query = parts.query;
            tls = parts.scheme.equals("memcacheds");
        } else {
            for (String part : splitNonEmpty(input, ",")) {
                Map<String, Object> parsed = parseHostPort(part);
                hosts.add(hostEntry(asString(parsed.get("host")), firstLong(parsed.get("port"), defaultPort(definition, 11211))));
            }
        }
        Map<String, Object> authority = hosts.size() > 1
                ? authority("hosts", hosts)
                : authority("host", hosts.isEmpty() ? "" : hosts.get(0).get("host"), "port", hosts.isEmpty() ? 11211L : hosts.get(0).get("port"));
        return baseAddress(definition, "memcached", raw, safe, authority, new Address.Resource("none", null), "", query, null, credentials, map("tls", tls));
    }

    private static Address parseElasticsearch(String input, Definition definition, String raw, String safe) {
        String source = input.replaceFirst("(?i)^elasticsearch\\+https", "https")
                .replaceFirst("(?i)^elasticsearch\\+http", "http")
                .replaceFirst("(?i)^elasticsearch://", "http://")
                .replaceFirst("(?i)^elastic://", "http://");
        Parts parts = parseHierarchical(source);
        Map<String, String> credentials = credentialsFromParts(parts);
        for (String key : List.of("api_key", "apiKey", "token")) {
            if (parts.query.get(key) != null) credentials.put(key.equals("apiKey") ? "api_key" : key, String.valueOf(parts.query.get(key)));
        }
        return baseAddress(definition, "elasticsearch", raw, safe, authority("host", parts.host, "port", firstLong(parts.port, defaultPort(definition, 9200))), new Address.Resource("index", first(parts.pathSegments)), join(parts.pathSegments, 1), parts.query, parts.fragment, credentials, map("protocol", parts.scheme, "tls", parts.scheme.equals("https")));
    }

    private static Address parseQuestdb(String input, Definition definition, String raw, String safe) {
        if (isQuestdbConfig(input)) {
            String[] split = input.split("::", 2);
            String protocol = split[0].toLowerCase(Locale.ROOT);
            Map<String, Object> grouped = new LinkedHashMap<>();
            for (String part : splitNonEmpty(split.length > 1 ? split[1] : "", ";")) {
                String[] pair = part.split("=", 2);
                String key = pair[0];
                String value = pair.length > 1 ? pair[1] : "";
                if (grouped.containsKey(key)) grouped.put(key, appendValue(grouped.get(key), value));
                else grouped.put(key, value);
            }
            long defaultPort = protocol.equals("http") || protocol.equals("https") ? 9000L : 9009L;
            List<Object> addrs = valuesFor(grouped.get("addr"));
            List<Map<String, Object>> hosts = new ArrayList<>();
            for (Object addr : addrs) {
                Map<String, Object> parsed = parseHostPort(String.valueOf(addr));
                hosts.add(hostEntry(asString(parsed.get("host")), firstLong(parsed.get("port"), defaultPort)));
            }
            Map<String, Object> query = new LinkedHashMap<>(grouped);
            query.remove("addr");
            Map<String, String> credentials = new LinkedHashMap<>();
            for (String key : List.of("username", "password", "token")) {
                Object value = query.remove(key);
                if (value != null) credentials.put(key, String.valueOf(value));
            }
            Map<String, Object> authority = hosts.size() > 1 ? authority("hosts", hosts) : authority("host", hosts.isEmpty() ? "" : hosts.get(0).get("host"), "port", hosts.isEmpty() ? defaultPort : hosts.get(0).get("port"));
            return baseAddress(definition, "questdb", raw, safe, authority, new Address.Resource("endpoint", null), "", query, null, credentials, map("ingestion", true, "protocol", protocol, "tls", protocol.equals("https") || protocol.equals("tcps")));
        }
        Parts parts = parseHierarchical(input);
        return baseAddress(definition, parts.scheme, raw, safe, authority("host", parts.host, "port", firstLong(parts.port, defaultPort(definition, 8812))), new Address.Resource("database", first(parts.pathSegments)), join(parts.pathSegments, 1), parts.query, parts.fragment, credentialsFromParts(parts), map("compatible_with", "postgres"));
    }

    private static Address parseS3(String input, Definition definition, String raw, String safe) {
        String rawScheme = extractScheme(input);
        String bucket;
        String key;
        String region = "";
        Map<String, Object> query;
        String fragment;
        Map<String, Object> options = new LinkedHashMap<>();
        if ("s3".equals(rawScheme)) {
            Parts parts = parseHierarchical(input);
            bucket = parts.host;
            key = String.join("/", parts.pathSegments);
            Object queryRegion = parts.query.get("region");
            region = queryRegion instanceof String ? (String) queryRegion : "";
            query = parts.query;
            fragment = parts.fragment;
        } else {
            Parts parts = parseHierarchical(input);
            Map<String, String> hostInfo = parseS3Host(parts.host);
            region = hostInfo.get("region");
            query = parts.query;
            fragment = parts.fragment;
            options.put("source_scheme", rawScheme);
            if (!hostInfo.get("bucket").isEmpty()) {
                bucket = hostInfo.get("bucket");
                key = String.join("/", parts.pathSegments);
            } else {
                bucket = first(parts.pathSegments) == null ? "" : first(parts.pathSegments);
                key = join(parts.pathSegments, 1);
            }
        }
        return baseAddress(definition, "s3", raw, safe, authority("bucket", bucket, "region", region), new Address.Resource(defaultString(definition.resource.type, "bucket"), bucket.isEmpty() ? null : bucket), key, query, fragment, Map.of(), options);
    }

    private static Validation validateAddress(Address address, Definition definition, ParseOptions options) {
        List<Diagnostic> errors = new ArrayList<>();
        List<Diagnostic> warnings = new ArrayList<>();
        if (definition.validation.requireHost && !hasHost(address.authority)) {
            errors.add(diagnostic("MISSING_HOST", displayName(definition) + " requires a host", "authority"));
        }
        if (definition.resource.required && (address.resource.name == null || address.resource.name.isEmpty())) {
            errors.add(diagnostic("MISSING_RESOURCE", displayName(definition) + " requires a resource", "resource.name"));
        }
        if (definition.path.required && address.path.isEmpty()) {
            errors.add(diagnostic("MISSING_PATH", displayName(definition) + " requires a path", "path"));
        }
        if (definition.validation.portRange != null) {
            for (Object port : collectPorts(address.authority)) {
                Long numeric = asLong(port);
                if (numeric == null || numeric < definition.validation.portRange.min || numeric > definition.validation.portRange.max) {
                    errors.add(diagnostic("INVALID_PORT", "Port must be between " + definition.validation.portRange.min + " and " + definition.validation.portRange.max, "authority.port"));
                }
            }
        }
        for (Map.Entry<String, Object> entry : address.query.entrySet()) {
            Definition.QueryRule rule = definition.queryParameters.get(entry.getKey());
            if (rule == null) {
                Diagnostic item = diagnostic("UNKNOWN_QUERY_PARAMETER", entry.getKey() + " is not declared for " + definition.id, "query." + entry.getKey());
                if (options.strict) errors.add(item);
                else warnings.add(item);
                continue;
            }
            errors.addAll(validateQueryValue(rule, entry.getKey(), entry.getValue()));
        }
        return new Validation(errors, warnings);
    }

    private static List<Diagnostic> validateQueryValue(Definition.QueryRule rule, String key, Object value) {
        List<Diagnostic> errors = new ArrayList<>();
        for (Object item : valuesFor(value)) {
            String text = String.valueOf(item);
            if (rule.type.equals("boolean") && !Set.of("true", "false", "1", "0", "yes", "no").contains(text.toLowerCase(Locale.ROOT))) {
                errors.add(diagnostic("INVALID_QUERY_PARAMETER_TYPE", key + " must be a boolean", "query." + key));
            }
            if (rule.type.equals("number") && !text.matches("^-?\\d+(\\.\\d+)?$")) {
                errors.add(diagnostic("INVALID_QUERY_PARAMETER_TYPE", key + " must be a number", "query." + key));
            }
            if (!rule.allowed.isEmpty() && rule.allowed.stream().noneMatch(allowed -> Objects.equals(String.valueOf(allowed), text))) {
                errors.add(diagnostic("INVALID_QUERY_PARAMETER_VALUE", key + " must be one of: " + String.join(", ", rule.allowed.stream().map(String::valueOf).toList()), "query." + key));
            }
        }
        return errors;
    }

    private static Address baseAddress(Definition definition, String scheme, String raw, String safe, Map<String, Object> authority, Address.Resource resource, String path, Map<String, Object> query, String fragment, Map<String, String> credentials, Map<String, Object> options) {
        Map<String, Object> mergedOptions = new LinkedHashMap<>(definition.options);
        if (options != null) mergedOptions.putAll(options);
        return new Address(scheme, defaultString(definition.type, "unknown"), authority, resource, path, query, fragment, credentials, mergedOptions, raw, safe);
    }

    private static Map<String, Object> authorityFromParts(Parts parts, Map<String, Object> defaults, boolean omitPorts) {
        if (parts.hosts.size() > 1) {
            List<Map<String, Object>> hosts = new ArrayList<>();
            for (Map<String, Object> entry : parts.hosts) hosts.add(hostEntry(asString(entry.get("host")), omitPorts ? null : asLong(entry.get("port"))));
            return applyDefaultPort(authority("hosts", hosts), omitPorts ? Map.of() : defaults);
        }
        return applyDefaultPort(authority("host", parts.host, "port", omitPorts ? null : parts.port), omitPorts ? Map.of() : defaults);
    }

    private static Map<String, Object> applyDefaultPort(Map<String, Object> authority, Map<String, Object> defaults) {
        Long defaultPort = asLong(defaults == null ? null : defaults.get("port"));
        if (defaultPort == null) return authority;
        if (authority.get("port") == null && authority.get("host") != null && !String.valueOf(authority.get("host")).isEmpty()) authority.put("port", defaultPort);
        Object hosts = authority.get("hosts");
        if (hosts instanceof List<?> list) {
            List<Map<String, Object>> next = new ArrayList<>();
            for (Object item : list) {
                Map<String, Object> entry = copyMap(item);
                if (entry.get("port") == null) entry.put("port", defaultPort);
                next.add(entry);
            }
            authority.put("hosts", next);
        }
        return authority;
    }

    private static Parts parseHierarchical(String input) {
        Matcher matcher = HIERARCHICAL_PATTERN.matcher(input);
        if (!matcher.matches()) return parseLooseUrl(input);
        String scheme = matcher.group(1).toLowerCase(Locale.ROOT);
        String authority = matcher.group(2) == null ? "" : matcher.group(2);
        String pathname = matcher.group(3) == null ? "" : matcher.group(3);
        String search = matcher.group(4) == null ? "" : matcher.group(4);
        String fragment = matcher.group(5);
        int at = authority.lastIndexOf('@');
        String userInfo = at == -1 ? "" : authority.substring(0, at);
        String hostText = at == -1 ? authority : authority.substring(at + 1);
        String[] userParts = userInfo.split(":", -1);
        String username = userInfo.isEmpty() ? "" : safeDecode(userParts[0]);
        String password = userParts.length > 1 ? safeDecode(String.join(":", Arrays.copyOfRange(userParts, 1, userParts.length))) : "";
        List<Map<String, Object>> hosts = new ArrayList<>();
        for (String part : hostText.split(",")) {
            if (!part.isEmpty()) hosts.add(parseHostPort(part));
        }
        return new Parts(scheme, username, password, hosts.isEmpty() ? "" : asString(hosts.get(0).get("host")), hosts.isEmpty() ? null : asLong(hosts.get(0).get("port")), hosts, pathname, splitPath(pathname), parseQuery(search), fragment == null ? null : safeDecode(fragment));
    }

    private static Parts parseLooseUrl(String input) {
        String scheme = extractScheme(input);
        String rest = scheme == null ? input : input.substring(scheme.length() + 1);
        String fragment = null;
        int hash = rest.indexOf('#');
        if (hash >= 0) {
            fragment = safeDecode(rest.substring(hash + 1));
            rest = rest.substring(0, hash);
        }
        String search = "";
        int question = rest.indexOf('?');
        if (question >= 0) {
            search = rest.substring(question + 1);
            rest = rest.substring(0, question);
        }
        String pathname = rest.startsWith("//") ? rest.substring(2) : rest;
        if (pathname.contains("/")) pathname = pathname.substring(pathname.indexOf('/'));
        return new Parts(scheme == null ? "" : scheme, "", "", "", null, List.of(), pathname, splitPath(pathname), parseQuery(search), fragment);
    }

    private static Map<String, Object> parseHostPort(String value) {
        if (value == null || value.isEmpty()) return authority("host", "", "port", null);
        if (value.startsWith("[")) {
            int close = value.indexOf(']');
            if (close != -1) {
                String rest = value.substring(close + 1);
                return authority("host", value.substring(1, close), "port", rest.startsWith(":") && rest.length() > 1 ? Long.parseLong(rest.substring(1)) : null);
            }
        }
        int colon = value.lastIndexOf(':');
        if (colon > -1 && value.indexOf(':') == colon && value.substring(colon + 1).matches("^\\d+$")) {
            return authority("host", value.substring(0, colon), "port", Long.parseLong(value.substring(colon + 1)));
        }
        return authority("host", value, "port", null);
    }

    private static Map<String, Object> parseQuery(String search) {
        Map<String, Object> query = new LinkedHashMap<>();
        if (search == null || search.isEmpty()) return query;
        String text = search.startsWith("?") ? search.substring(1) : search;
        for (String part : text.split("&", -1)) {
            if (part.isEmpty()) continue;
            String[] pair = part.split("=", 2);
            String key = safeDecodeQuery(pair[0]);
            String value = pair.length > 1 ? safeDecodeQuery(pair[1]) : "";
            if (query.containsKey(key)) query.put(key, appendValue(query.get(key), value));
            else query.put(key, value);
        }
        return query;
    }

    private static Map<String, String> splitConninfo(String input) {
        Map<String, String> pairs = new LinkedHashMap<>();
        int index = 0;
        String text = input.trim();
        while (index < text.length()) {
            while (index < text.length() && Character.isWhitespace(text.charAt(index))) index++;
            StringBuilder key = new StringBuilder();
            while (index < text.length() && text.charAt(index) != '=') key.append(text.charAt(index++));
            if (key.isEmpty() || index >= text.length()) break;
            index++;
            StringBuilder value = new StringBuilder();
            if (index < text.length() && text.charAt(index) == '\'') {
                index++;
                while (index < text.length()) {
                    char c = text.charAt(index);
                    if (c == '\\' && index + 1 < text.length()) {
                        value.append(text.charAt(index + 1));
                        index += 2;
                    } else if (c == '\'') {
                        index++;
                        break;
                    } else {
                        value.append(c);
                        index++;
                    }
                }
            } else {
                while (index < text.length() && !Character.isWhitespace(text.charAt(index))) value.append(text.charAt(index++));
            }
            pairs.put(key.toString().trim(), value.toString());
        }
        return pairs;
    }

    private static Map<String, Object> parseHostLists(String hostValue, String portValue, Map<String, Object> defaults) {
        List<String> hosts = splitNonEmpty(hostValue, ",");
        String[] ports = portValue == null ? new String[0] : portValue.split(",", -1);
        Long defaultPort = asLong(defaults == null ? null : defaults.get("port"));
        if (hosts.size() > 1) {
            List<Map<String, Object>> entries = new ArrayList<>();
            for (int i = 0; i < hosts.size(); i++) {
                String port = i < ports.length ? ports[i].trim() : "";
                entries.add(hostEntry(hosts.get(i), port.isEmpty() ? defaultPort : Long.parseLong(port)));
            }
            return authority("hosts", entries);
        }
        Map<String, Object> parsed = parseHostPort(hosts.isEmpty() ? "" : hosts.get(0));
        Long port = parsed.get("port") == null ? (ports.length > 0 && !ports[0].isBlank() ? Long.parseLong(ports[0].trim()) : defaultPort) : asLong(parsed.get("port"));
        return authority("host", parsed.get("host"), "port", port);
    }

    private static FileMeta stripFileMeta(String path) {
        String fragment = null;
        Map<String, Object> query = new LinkedHashMap<>();
        int hash = path.indexOf('#');
        if (hash >= 0) {
            fragment = safeDecode(path.substring(hash + 1));
            path = path.substring(0, hash);
        }
        int question = path.indexOf('?');
        if (question >= 0) {
            query = parseQuery(path.substring(question + 1));
            path = path.substring(0, question);
        }
        return new FileMeta(path, fragment, query);
    }

    private static String maskUserinfo(String value) {
        int marker = value.indexOf("://");
        int start = marker == -1 ? 0 : marker + 3;
        int end = value.length();
        for (String needle : List.of("/", "?", "#")) {
            int found = value.indexOf(needle, start);
            if (found != -1 && found < end) end = found;
        }
        String authority = value.substring(start, end);
        int at = authority.lastIndexOf('@');
        if (at == -1) return value;
        String userInfo = authority.substring(0, at);
        if (marker == -1 && !userInfo.contains(":")) return value;
        int colon = userInfo.indexOf(':');
        if (colon == -1) return value;
        return value.substring(0, start) + userInfo.substring(0, colon) + ":***@" + authority.substring(at + 1) + value.substring(end);
    }

    private static String maskSensitiveQuery(String value, Definition definition) {
        Matcher matcher = Pattern.compile("([?&])([^=&#]+)=([^&#]*)").matcher(value);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            String key = safeDecode(matcher.group(2));
            String replacement = isSensitiveKey(key, definition) ? matcher.group(1) + matcher.group(2) + "=***" : matcher.group(0);
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private static String maskSensitiveKeyValues(String value, Definition definition) {
        Matcher matcher = Pattern.compile("(^|[;,&\\s])([^=;,&\\s]+)=([^;,&\\s]*)").matcher(value);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            String replacement = isSensitiveKey(matcher.group(2), definition) ? matcher.group(1) + matcher.group(2) + "=***" : matcher.group(0);
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private static boolean isSensitiveKey(String key, Definition definition) {
        return sensitiveKeys(definition).contains(normalizedKey(key));
    }

    private static Set<String> sensitiveKeys(Definition definition) {
        Set<String> keys = new LinkedHashSet<>();
        if (definition == null || definition.redaction == null) return keys;
        for (String key : definition.redaction.sensitiveKeys) keys.add(normalizedKey(key));
        return keys;
    }

    private static String normalizedKey(String key) {
        return key == null ? "" : key.trim().toLowerCase(Locale.ROOT);
    }

    private static List<String> splitPath(String pathname) {
        String text = pathname == null ? "" : (pathname.startsWith("/") ? pathname.substring(1) : pathname);
        if (text.isEmpty()) return new ArrayList<>();
        List<String> output = new ArrayList<>();
        for (String part : text.split("/", -1)) output.add(safeDecode(part));
        return output;
    }

    private static String safeDecode(String value) {
        if (value == null || value.indexOf('%') == -1) return value == null ? "" : value;
        byte[] bytes = new byte[value.length()];
        StringBuilder builder = new StringBuilder();
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '%' && i + 2 < value.length()) {
                try {
                    bytes[count++] = (byte) Integer.parseInt(value.substring(i + 1, i + 3), 16);
                    i += 2;
                    continue;
                } catch (NumberFormatException ignored) {
                }
            }
            if (count > 0) {
                builder.append(new String(bytes, 0, count, StandardCharsets.UTF_8));
                count = 0;
            }
            builder.append(c);
        }
        if (count > 0) builder.append(new String(bytes, 0, count, StandardCharsets.UTF_8));
        return builder.toString();
    }

    private static String safeDecodeQuery(String value) {
        return safeDecode(value.replace("+", " "));
    }

    private static String extractScheme(String input) {
        Matcher matcher = SCHEME_PATTERN.matcher(input == null ? "" : input);
        return matcher.find() ? matcher.group(1).toLowerCase(Locale.ROOT) : null;
    }

    private static boolean hasUriScheme(String input) {
        return Pattern.compile("^[A-Za-z][A-Za-z0-9+.-]*://").matcher(input).find();
    }

    private static boolean matches(String input, String pattern) {
        return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(input).find();
    }

    private static boolean looksLikeFilePath(String input) {
        return input.startsWith("/") || input.startsWith("./") || input.startsWith("../") || input.startsWith("~/") || input.matches("^[A-Za-z]:[\\\\/].*");
    }

    private static boolean looksLikeDuckdbPath(String input) {
        return Pattern.compile("\\.(duckdb|ddb)([?#].*)?$", Pattern.CASE_INSENSITIVE).matcher(input).find();
    }

    private static boolean isClickhouseJdbc(String input) {
        return matches(input, "^jdbc:(clickhouse|ch)(?::[a-z]+)?://");
    }

    private static boolean isQuestdbConfig(String input) {
        return matches(input, "^(http|https|tcp|tcps)::");
    }

    private static boolean isS3HttpUrl(String input) {
        if (!matches(input, "^https?://")) return false;
        Parts parts = parseHierarchical(input);
        Map<String, String> info = parseS3Host(parts.host);
        return !info.get("bucket").isEmpty() || parts.host.startsWith("s3.");
    }

    private static Map<String, String> parseS3Host(String host) {
        Matcher virtual = Pattern.compile("^(.+)\\.s3(?:[.-]([a-z0-9-]+))?\\.amazonaws\\.com$", Pattern.CASE_INSENSITIVE).matcher(host);
        if (virtual.matches()) return Map.of("bucket", virtual.group(1), "region", virtual.group(2) == null ? "" : virtual.group(2));
        Matcher pathStyle = Pattern.compile("^s3(?:[.-]([a-z0-9-]+))?\\.amazonaws\\.com$", Pattern.CASE_INSENSITIVE).matcher(host);
        if (pathStyle.matches()) return Map.of("bucket", "", "region", pathStyle.group(1) == null ? "" : pathStyle.group(1));
        return Map.of("bucket", "", "region", "");
    }

    private static Long jdbcDefaultPort(String provider, String protocol, Map<String, Object> defaults) {
        if (provider.equals("clickhouse") || provider.equals("ch")) {
            if (protocol.equals("https")) return 8443L;
            if (protocol.equals("grpc")) return 9100L;
            return firstLong(defaults.get("port"), 8123L);
        }
        return asLong(defaults.get("port"));
    }

    private static long clickhouseDefaultPort(String protocol, Map<String, Object> defaults) {
        if (protocol.equals("https")) return 8443L;
        if (protocol.equals("http")) return 8123L;
        if (protocol.equals("grpc")) return 9100L;
        return firstLong(defaults.get("port"), 9000L);
    }

    private static long defaultPort(Definition definition, long fallback) {
        return firstLong(definition.defaults.get("port"), fallback);
    }

    private static Map<String, String> credentialsFromParts(Parts parts) {
        Map<String, String> credentials = new LinkedHashMap<>();
        if (!parts.username.isEmpty()) credentials.put("username", parts.username);
        if (!parts.password.isEmpty()) credentials.put("password", parts.password);
        return credentials;
    }

    private static List<Object> collectPorts(Map<String, Object> authority) {
        List<Object> ports = new ArrayList<>();
        if (authority.get("port") != null) ports.add(authority.get("port"));
        Object hosts = authority.get("hosts");
        if (hosts instanceof List<?> list) {
            for (Object item : list) {
                Map<String, Object> host = copyMap(item);
                if (host.get("port") != null) ports.add(host.get("port"));
            }
        }
        return ports;
    }

    private static boolean hasHost(Map<String, Object> authority) {
        return (authority.get("host") != null && !String.valueOf(authority.get("host")).isEmpty())
                || (authority.get("hosts") instanceof List<?> list && !list.isEmpty());
    }

    private static Map<String, Object> authority(Object... entries) {
        return map(entries);
    }

    private static Map<String, Object> map(Object... entries) {
        Map<String, Object> output = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) output.put(String.valueOf(entries[i]), entries[i + 1]);
        return output;
    }

    private static Map<String, Object> hostEntry(String host, Object port) {
        return authority("host", host, "port", port);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> copyMap(Object input) {
        if (input instanceof Map<?, ?> map) return new LinkedHashMap<>((Map<String, Object>) map);
        return new LinkedHashMap<>();
    }

    private static Object appendValue(Object current, Object value) {
        List<Object> output = new ArrayList<>();
        if (current instanceof List<?> list) output.addAll(list);
        else output.add(current);
        output.add(value);
        return output;
    }

    private static List<Object> valuesFor(Object value) {
        if (value instanceof List<?> list) return new ArrayList<>(list);
        return List.of(value);
    }

    private static List<Definition> joinDefinitions(List<Definition> builtIns, List<Definition> custom) {
        List<Definition> output = new ArrayList<>(builtIns);
        if (custom != null) output.addAll(custom);
        return output;
    }

    @SafeVarargs
    private static <T> T firstNonNull(T... items) {
        for (T item : items) if (item != null) return item;
        return null;
    }

    private static Object removeIgnoreCase(Map<String, Object> map, String key) {
        for (String existing : new ArrayList<>(map.keySet())) {
            if (existing.equalsIgnoreCase(key)) return map.remove(existing);
        }
        return null;
    }

    private static Long asLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        if (String.valueOf(value).matches("^-?\\d+$")) return Long.parseLong(String.valueOf(value));
        return null;
    }

    private static long firstLong(Object value, long fallback) {
        Long parsed = asLong(value);
        return parsed == null ? fallback : parsed;
    }

    private static String asString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String first(List<String> items) {
        return items == null || items.isEmpty() ? null : items.get(0);
    }

    private static String join(List<String> items, int start) {
        if (items == null || items.size() <= start) return "";
        return String.join("/", items.subList(start, items.size()));
    }

    private static List<String> splitNonEmpty(String input, String delimiter) {
        List<String> output = new ArrayList<>();
        if (input == null || input.isEmpty()) return output;
        for (String part : input.split(Pattern.quote(delimiter))) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) output.add(trimmed);
        }
        return output;
    }

    private static String firstScheme(Definition definition) {
        return definition.schemes.isEmpty() ? definition.id : definition.schemes.get(0);
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value;
        return "";
    }

    private static String accountFromHost(String host) {
        if (host == null || host.isEmpty()) return "";
        int dot = host.indexOf('.');
        return dot == -1 ? host : host.substring(0, dot);
    }

    private static String basename(String pathname) {
        if (pathname == null || pathname.isEmpty()) return pathname;
        String[] parts = pathname.split("/");
        return parts.length == 0 ? pathname : parts[parts.length - 1];
    }

    private static String displayName(Definition definition) {
        return definition.name == null || definition.name.isEmpty() ? definition.id : definition.name;
    }

    private static Diagnostic diagnostic(String code, String message, String path) {
        return new Diagnostic(code, message, path);
    }

    private static ParseResult ok(Address value, List<Diagnostic> errors, List<Diagnostic> warnings) {
        return new ParseResult(errors == null || errors.isEmpty(), errors == null || errors.isEmpty() ? value : null, errors, warnings);
    }

    private static ParseResult fail(String code, String message, String path) {
        return new ParseResult(false, null, List.of(diagnostic(code, message, path)), List.of());
    }

    private static String joinMessages(List<Diagnostic> errors) {
        List<String> messages = new ArrayList<>();
        for (Diagnostic error : errors) messages.add(error.message);
        return String.join("; ", messages);
    }

    private record Match(String scheme, Definition definition) {}

    private record Validation(List<Diagnostic> errors, List<Diagnostic> warnings) {}

    private record FileMeta(String path, String fragment, Map<String, Object> query) {}

    private record Parts(
            String scheme,
            String username,
            String password,
            String host,
            Long port,
            List<Map<String, Object>> hosts,
            String pathname,
            List<String> pathSegments,
            Map<String, Object> query,
            String fragment) {}

    private static final class Registry {
        private final Map<String, Definition> byId = new LinkedHashMap<>();
        private final Map<String, Definition> byScheme = new LinkedHashMap<>();

        Registry(List<Definition> definitions) {
            for (Definition definition : definitions) {
                Definition copy = definition.copy();
                byId.put(copy.id, copy);
                for (String scheme : copy.schemes) byScheme.put(scheme.toLowerCase(Locale.ROOT), copy);
            }
        }

        Definition byId(String id) {
            return byId.get(id);
        }

        Definition byScheme(String scheme) {
            return byScheme.get(scheme == null ? "" : scheme.toLowerCase(Locale.ROOT));
        }
    }
}
