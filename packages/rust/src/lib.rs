use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

mod builtin_definitions;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Address {
    pub scheme: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub authority: Map<String, Value>,
    pub resource: Resource,
    pub path: String,
    pub query: Map<String, Value>,
    pub fragment: Option<String>,
    pub credentials: BTreeMap<String, String>,
    pub options: Map<String, Value>,
    pub raw: String,
    pub safe: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NormalizedAddress {
    pub scheme: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub authority: Map<String, Value>,
    pub resource: Resource,
    pub path: String,
    pub query: Map<String, Value>,
    pub fragment: Option<String>,
    pub credentials: BTreeMap<String, String>,
    pub options: Map<String, Value>,
    pub raw: String,
    pub safe: String,
    pub canonical: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Resource {
    #[serde(rename = "type")]
    pub kind: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Diagnostic {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParseResult {
    pub ok: bool,
    pub value: Option<Address>,
    pub errors: Vec<Diagnostic>,
    pub warnings: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NormalizedResult {
    pub ok: bool,
    pub value: Option<NormalizedAddress>,
    pub errors: Vec<Diagnostic>,
    pub warnings: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Default)]
pub struct ParseOptions {
    pub provider: Option<String>,
    pub strict: bool,
    pub definitions: Vec<Definition>,
}

#[derive(Debug, Clone, Default)]
pub struct CanonicalizeOptions {
    pub parse: ParseOptions,
    pub definition: Option<Definition>,
    pub include_credentials: bool,
    pub include_default_port: bool,
    pub include_sensitive: bool,
    pub include_fragment: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Definition {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub schemes: Vec<String>,
    #[serde(default)]
    pub adapter: String,
    #[serde(default)]
    pub defaults: Map<String, Value>,
    #[serde(default)]
    pub authority: Map<String, Value>,
    #[serde(default)]
    pub resource: Rule,
    #[serde(default)]
    pub path: Rule,
    #[serde(default)]
    pub credentials: Map<String, Value>,
    #[serde(default)]
    pub query_parameters: BTreeMap<String, QueryRule>,
    #[serde(default)]
    pub validation: ValidationRule,
    #[serde(default)]
    pub options: Map<String, Value>,
    #[serde(default)]
    pub redaction: RedactionRule,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Rule {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct QueryRule {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub allowed: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ValidationRule {
    #[serde(default)]
    pub require_host: bool,
    #[serde(default)]
    pub port_range: Option<PortRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct PortRange {
    pub min: i64,
    pub max: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct RedactionRule {
    #[serde(default)]
    pub safe_credentials: Vec<String>,
    #[serde(default)]
    pub sensitive_keys: Vec<String>,
}

#[derive(Debug, Clone)]
struct Parts {
    scheme: String,
    username: String,
    password: String,
    host: String,
    port: Option<i64>,
    hosts: Vec<Map<String, Value>>,
    pathname: String,
    path_segments: Vec<String>,
    query: Map<String, Value>,
    fragment: Option<String>,
}

pub fn built_in_definitions() -> Vec<Definition> {
    serde_json::from_str(builtin_definitions::BUILT_IN_DEFINITIONS_JSON)
        .expect("generated built-in definitions must be valid")
}

pub fn parse(input: &str, options: Option<ParseOptions>) -> ParseResult {
    let opts = options.unwrap_or_default();
    if input.trim().is_empty() {
        return fail("EMPTY_INPUT", "Connparse input cannot be empty", "raw");
    }

    let registry = Registry::new([built_in_definitions(), opts.definitions.clone()].concat());
    let (scheme, definition) = infer_definition(input, &registry, &opts);
    let Some(scheme) = scheme else {
        return fail(
            "MISSING_SCHEME",
            "Input must include a scheme or look like a file path",
            "scheme",
        );
    };
    let Some(definition) = definition else {
        return parse_unknown(input, &scheme, opts.strict);
    };

    let safe = mask(input, Some(&definition));
    let value = match definition.adapter.as_str() {
        "clickhouse" => parse_clickhouse(input, &definition, input, &safe),
        "duckdb" => parse_duckdb(input, &definition, input, &safe),
        "elasticsearch" => parse_elasticsearch(input, &definition, input, &safe),
        "file" => parse_file(input, &definition, input, &safe),
        "generic-uri" | "" => parse_generic_uri(input, &definition, input, &safe),
        "jdbc" => parse_jdbc(input, &definition, input, &safe),
        "memcached" => parse_memcached(input, &definition, input, &safe),
        "mongodb" => parse_mongodb(input, &definition, input, &safe),
        "mysql-compatible" => parse_mysql_compatible(input, &definition, input, &safe),
        "postgres-compatible" => parse_postgres_compatible(input, &definition, input, &safe),
        "questdb" => parse_questdb(input, &definition, input, &safe),
        "redis" => parse_redis(input, &definition, input, &safe),
        "s3" => parse_s3(input, &definition, input, &safe),
        "sqlite" => parse_sqlite(input, &definition, input, &safe),
        other => {
            return fail(
                "UNKNOWN_ADAPTER",
                &format!("{} references missing adapter {}", definition.id, other),
                "adapter",
            )
        }
    };

    match value {
        Ok(address) => {
            let validation = validate_address(&address, &definition, &opts);
            ok(address, validation.0, validation.1)
        }
        Err(message) => fail("PARSE_FAILED", &message, "raw"),
    }
}

pub fn parse_or_throw(input: &str, options: Option<ParseOptions>) -> Result<Address, String> {
    let result = parse(input, options);
    if result.ok {
        return Ok(result.value.expect("ok result has value"));
    }
    Err(result
        .errors
        .iter()
        .map(|item| item.message.clone())
        .collect::<Vec<_>>()
        .join("; "))
}

pub fn canonicalize(input: &str, options: Option<CanonicalizeOptions>) -> Result<String, String> {
    let opts = options.unwrap_or_default();
    let address = parse_or_throw(input, Some(opts.parse.clone()))?;
    Ok(canonicalize_address(&address, &opts))
}

pub fn equivalent(
    left: &str,
    right: &str,
    options: Option<CanonicalizeOptions>,
) -> Result<bool, String> {
    let opts = options.unwrap_or_default();
    Ok(canonicalize(left, Some(opts.clone()))? == canonicalize(right, Some(opts))?)
}

pub fn parse_normalize(input: &str, options: Option<CanonicalizeOptions>) -> NormalizedResult {
    let opts = options.unwrap_or_default();
    let result = parse(input, Some(opts.parse.clone()));
    if !result.ok {
        return NormalizedResult {
            ok: false,
            value: None,
            errors: result.errors,
            warnings: result.warnings,
        };
    }
    NormalizedResult {
        ok: true,
        value: Some(normalize_address(
            &result.value.expect("ok result has value"),
            &opts,
        )),
        errors: result.errors,
        warnings: result.warnings,
    }
}

pub fn normalize_address(address: &Address, options: &CanonicalizeOptions) -> NormalizedAddress {
    let definition = definition_for(address, options);
    let canonical = canonicalize_address(address, options);
    NormalizedAddress {
        scheme: canonical_scheme(address, &definition),
        kind: address.kind.clone(),
        authority: normalized_authority(address, &definition, options),
        resource: address.resource.clone(),
        path: address.path.clone(),
        query: normalized_query(address, &definition, options),
        fragment: if options.include_fragment {
            address.fragment.clone()
        } else {
            None
        },
        credentials: normalized_credentials(address, options),
        options: sorted_map(&address.options),
        raw: canonical.clone(),
        safe: canonical.clone(),
        canonical,
    }
}

fn ok(value: Address, errors: Vec<Diagnostic>, warnings: Vec<Diagnostic>) -> ParseResult {
    ParseResult {
        ok: errors.is_empty(),
        value: if errors.is_empty() { Some(value) } else { None },
        errors,
        warnings,
    }
}

fn fail(code: &str, message: &str, path: &str) -> ParseResult {
    ParseResult {
        ok: false,
        value: None,
        errors: vec![diagnostic(code, message, path)],
        warnings: vec![],
    }
}

fn diagnostic(code: &str, message: &str, path: &str) -> Diagnostic {
    Diagnostic {
        code: code.to_string(),
        message: message.to_string(),
        path: if path.is_empty() {
            None
        } else {
            Some(path.to_string())
        },
    }
}

#[derive(Debug, Clone)]
struct Registry {
    by_id: BTreeMap<String, Definition>,
    by_scheme: BTreeMap<String, Definition>,
}

impl Registry {
    fn new(definitions: Vec<Definition>) -> Self {
        let mut by_id = BTreeMap::new();
        let mut by_scheme = BTreeMap::new();
        for definition in definitions {
            by_id.insert(definition.id.clone(), definition.clone());
            for scheme in &definition.schemes {
                by_scheme.insert(scheme.to_lowercase(), definition.clone());
            }
        }
        Self { by_id, by_scheme }
    }

    fn by_id(&self, id: &str) -> Option<Definition> {
        self.by_id.get(id).cloned()
    }

    fn by_scheme(&self, scheme: &str) -> Option<Definition> {
        self.by_scheme.get(&scheme.to_lowercase()).cloned()
    }
}

fn infer_definition(
    raw: &str,
    registry: &Registry,
    options: &ParseOptions,
) -> (Option<String>, Option<Definition>) {
    if let Some(provider) = &options.provider {
        let provider = provider.to_lowercase();
        return (
            Some(provider.clone()),
            registry
                .by_id(&provider)
                .or_else(|| registry.by_scheme(&provider)),
        );
    }
    if is_clickhouse_jdbc(raw) {
        return (
            Some("jdbc:clickhouse".to_string()),
            registry.by_scheme("clickhouse"),
        );
    }
    if starts_ci(raw, "jdbc:postgresql://") {
        return (
            Some("jdbc:postgresql".to_string()),
            registry.by_scheme("postgres"),
        );
    }
    if starts_ci(raw, "jdbc:mysql://") {
        return (Some("jdbc:mysql".to_string()), registry.by_scheme("mysql"));
    }
    if is_mariadb_jdbc(raw) {
        return (
            Some("jdbc:mariadb".to_string()),
            registry.by_scheme("mariadb"),
        );
    }
    if is_questdb_config(raw) {
        return (Some("questdb".to_string()), registry.by_scheme("questdb"));
    }
    if looks_like_duckdb_path(raw) {
        return (Some("duckdb".to_string()), registry.by_scheme("duckdb"));
    }
    if is_s3_http_url(raw) {
        return (Some("s3".to_string()), registry.by_scheme("s3"));
    }
    let scheme = extract_scheme(raw);
    if scheme.is_none() && looks_like_file_path(raw) {
        return (Some("file".to_string()), registry.by_scheme("file"));
    }
    if let Some(scheme) = scheme {
        return (Some(scheme.clone()), registry.by_scheme(&scheme));
    }
    (None, None)
}

fn parse_unknown(raw: &str, scheme: &str, strict: bool) -> ParseResult {
    let warning = diagnostic(
        "UNKNOWN_SCHEME",
        &format!("{} does not have a registered Connparse definition", scheme),
        "scheme",
    );
    if strict {
        return fail(
            &warning.code,
            &warning.message,
            warning.path.as_deref().unwrap_or(""),
        );
    }
    match parse_hierarchical(raw) {
        Ok(parts) => ok(
            base_address(
                &Definition {
                    kind: "unknown".into(),
                    ..Default::default()
                },
                scheme,
                raw,
                &mask(raw, None),
                map_from_pairs(vec![
                    ("host", string_value(&parts.host)),
                    ("port", optional_i64(parts.port)),
                ]),
                Resource {
                    kind: "unknown".into(),
                    name: parts.path_segments.first().cloned(),
                },
                parts.pathname,
                parts.query,
                parts.fragment,
                BTreeMap::new(),
                Map::new(),
            ),
            vec![],
            vec![warning],
        ),
        Err(_) => fail(
            "INVALID_URL",
            &format!("Could not parse {} address", scheme),
            "raw",
        ),
    }
}

fn parse_generic_uri(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let parts = parse_hierarchical(input)?;
    let resource_name = parts.path_segments.first().cloned();
    Ok(base_address(
        definition,
        &parts.scheme,
        raw,
        safe,
        authority_from_parts(&parts, &definition.defaults, false),
        Resource {
            kind: rule_type(&definition.resource, "resource"),
            name: resource_name,
        },
        parts
            .path_segments
            .iter()
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join("/"),
        parts.query.clone(),
        parts.fragment.clone(),
        credentials_from_parts(&parts),
        Map::new(),
    ))
}

fn parse_jdbc(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let lower = input.to_lowercase();
    if !lower.starts_with("jdbc:") {
        return Err("Invalid JDBC URL".into());
    }
    let rest_start = input
        .find("://")
        .ok_or_else(|| "Invalid JDBC URL".to_string())?;
    let prefix = &input[5..rest_start];
    let mut prefix_parts = prefix.split(':');
    let provider = prefix_parts.next().unwrap_or("").to_lowercase();
    let mut protocol = prefix_parts.next().unwrap_or("").to_lowercase();
    let mut mode = String::new();
    if provider == "mariadb"
        && matches!(
            protocol.as_str(),
            "replication" | "loadbalance" | "sequential" | "load-balance-read"
        )
    {
        mode = protocol.clone();
        protocol.clear();
    }
    let rest = &input[rest_start + 3..];
    let parse_scheme = if provider == "ch" {
        "clickhouse"
    } else {
        &provider
    };
    let parts = parse_hierarchical(&format!("{}://{}", parse_scheme, rest))?;
    let database = parts.path_segments.first().cloned();
    let default_port = jdbc_default_port(&provider, &protocol, &definition.defaults);
    let hosts = parts
        .hosts
        .iter()
        .map(|entry| {
            let mut host = entry.clone();
            if host.get("port").is_none_or(Value::is_null) {
                if let Some(port) = default_port {
                    host.insert("port".into(), json!(port));
                }
            }
            host
        })
        .collect::<Vec<_>>();
    let authority = if hosts.len() > 1 {
        map_from_pairs(vec![(
            "hosts",
            Value::Array(hosts.into_iter().map(Value::Object).collect()),
        )])
    } else {
        let first = hosts.first();
        map_from_pairs(vec![
            (
                "host",
                first
                    .and_then(|v| v.get("host"))
                    .cloned()
                    .unwrap_or_else(|| json!("")),
            ),
            (
                "port",
                first
                    .and_then(|v| v.get("port"))
                    .cloned()
                    .unwrap_or(Value::Null),
            ),
        ])
    };
    let mut options = Map::new();
    options.insert("jdbc".into(), json!(true));
    if !protocol.is_empty() {
        options.insert("protocol".into(), json!(protocol));
    }
    if !mode.is_empty() {
        options.insert("mode".into(), json!(mode));
    }
    Ok(base_address(
        definition,
        &format!("jdbc:{}", if provider == "ch" { "ch" } else { &provider }),
        raw,
        safe,
        authority,
        Resource {
            kind: rule_type(&definition.resource, "database"),
            name: database,
        },
        parts
            .path_segments
            .iter()
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join("/"),
        parts.query.clone(),
        parts.fragment.clone(),
        credentials_from_parts(&parts),
        options,
    ))
}

fn parse_mysql_compatible(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    if is_mysql_jdbc(input) {
        return parse_jdbc(input, definition, raw, safe);
    }
    if has_hierarchical_scheme(input) {
        return parse_generic_uri(input, definition, raw, safe);
    }
    parse_generic_uri(
        &format!(
            "{}://{}",
            definition
                .schemes
                .first()
                .map(String::as_str)
                .unwrap_or("mysql"),
            input
        ),
        definition,
        raw,
        safe,
    )
}

fn parse_postgres_compatible(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    if starts_ci(input, "jdbc:postgresql://") {
        return parse_jdbc(input, definition, raw, safe);
    }
    if has_hierarchical_scheme(input) {
        let parts = parse_hierarchical(input)?;
        let database = parts.path_segments.first().cloned();
        return Ok(base_address(
            definition,
            &parts.scheme,
            raw,
            safe,
            authority_from_parts(&parts, &definition.defaults, false),
            Resource {
                kind: rule_type(&definition.resource, "database"),
                name: database,
            },
            parts
                .path_segments
                .iter()
                .skip(1)
                .cloned()
                .collect::<Vec<_>>()
                .join("/"),
            parts.query.clone(),
            parts.fragment.clone(),
            credentials_from_parts(&parts),
            definition.options.clone(),
        ));
    }
    let fields = split_conninfo(input);
    let mut credentials = BTreeMap::new();
    if let Some(user) = fields.get("user") {
        credentials.insert("username".into(), user.clone());
    }
    if let Some(password) = fields.get("password") {
        credentials.insert("password".into(), password.clone());
    }
    let mut query = Map::new();
    for (key, value) in &fields {
        if !["host", "hostaddr", "port", "dbname", "user", "password"].contains(&key.as_str()) {
            query.insert(key.clone(), json!(value));
        }
    }
    Ok(base_address(
        definition,
        definition
            .schemes
            .first()
            .map(String::as_str)
            .unwrap_or("postgres"),
        raw,
        safe,
        parse_host_lists(
            fields
                .get("host")
                .or_else(|| fields.get("hostaddr"))
                .map(String::as_str)
                .unwrap_or(""),
            fields.get("port").map(String::as_str).unwrap_or(""),
            &definition.defaults,
        ),
        Resource {
            kind: rule_type(&definition.resource, "database"),
            name: fields.get("dbname").cloned(),
        },
        "",
        query,
        None,
        credentials,
        map_from_pairs(vec![("conninfo", json!(true))]),
    ))
}

fn parse_mongodb(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let parts = parse_hierarchical(input)?;
    let srv = parts.scheme == "mongodb+srv";
    Ok(base_address(
        definition,
        &parts.scheme,
        raw,
        safe,
        authority_from_parts(&parts, &definition.defaults, srv),
        Resource {
            kind: rule_type(&definition.resource, "database"),
            name: parts.path_segments.first().cloned(),
        },
        parts
            .path_segments
            .iter()
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join("/"),
        parts.query.clone(),
        parts.fragment.clone(),
        credentials_from_parts(&parts),
        map_from_pairs(vec![("srv", json!(srv))]),
    ))
}

fn parse_redis(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    if has_hierarchical_scheme(input) {
        let parts = parse_hierarchical(input)?;
        let scheme = parts.scheme.clone();
        return Ok(base_address(
            definition,
            &scheme,
            raw,
            safe,
            apply_default_port(
                map_from_pairs(vec![
                    ("host", json!(parts.host)),
                    ("port", optional_i64(parts.port)),
                ]),
                &definition.defaults,
            ),
            Resource {
                kind: rule_type(&definition.resource, "database_index"),
                name: parts.path_segments.first().cloned(),
            },
            "",
            parts.query.clone(),
            parts.fragment.clone(),
            credentials_from_parts(&parts),
            map_from_pairs(vec![("tls", json!(scheme == "rediss"))]),
        ));
    }
    let mut endpoints = vec![];
    let mut options = Map::new();
    let mut credentials = BTreeMap::new();
    for entry in input.split(',').map(str::trim).filter(|v| !v.is_empty()) {
        if let Some((key, value)) = entry.split_once('=') {
            match key.to_lowercase().as_str() {
                "password" => {
                    credentials.insert("password".into(), value.into());
                }
                "user" | "username" => {
                    credentials.insert("username".into(), value.into());
                }
                _ => {
                    options.insert(key.into(), json!(value));
                }
            }
        } else {
            let parsed = parse_host_port(entry);
            endpoints.push(map_from_pairs(vec![
                ("host", json!(parsed.0)),
                (
                    "port",
                    json!(parsed
                        .1
                        .or_else(|| default_port(&definition.defaults))
                        .unwrap_or(6379)),
                ),
            ]));
        }
    }
    let database = options
        .remove("defaultDatabase")
        .or_else(|| options.remove("defaultdatabase"))
        .and_then(|v| v.as_str().map(str::to_string));
    let tls = options
        .get("ssl")
        .or_else(|| options.get("tls"))
        .and_then(Value::as_str)
        .is_some_and(|v| v.eq_ignore_ascii_case("true"));
    options.insert("tls".into(), json!(tls));
    let authority = if endpoints.len() > 1 {
        map_from_pairs(vec![(
            "hosts",
            Value::Array(endpoints.into_iter().map(Value::Object).collect()),
        )])
    } else {
        map_from_pairs(vec![
            (
                "host",
                endpoints
                    .first()
                    .and_then(|v| v.get("host"))
                    .cloned()
                    .unwrap_or_else(|| json!("")),
            ),
            (
                "port",
                endpoints
                    .first()
                    .and_then(|v| v.get("port"))
                    .cloned()
                    .unwrap_or_else(|| json!(6379)),
            ),
        ])
    };
    Ok(base_address(
        definition,
        "redis",
        raw,
        safe,
        authority,
        Resource {
            kind: rule_type(&definition.resource, "database_index"),
            name: database,
        },
        "",
        Map::new(),
        None,
        credentials,
        options,
    ))
}

fn parse_file(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let mut authority = Map::new();
    let (path, query, fragment) = if starts_ci(input, "file:") {
        let parts = parse_hierarchical(input)?;
        if !parts.host.is_empty() {
            authority.insert("host".into(), json!(parts.host));
        }
        (safe_decode(&parts.pathname), parts.query, parts.fragment)
    } else {
        strip_file_meta(input)
    };
    Ok(base_address(
        definition,
        "file",
        raw,
        safe,
        authority,
        Resource {
            kind: "none".into(),
            name: None,
        },
        path,
        query,
        fragment,
        BTreeMap::new(),
        Map::new(),
    ))
}

fn parse_sqlite(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let mut options = Map::new();
    let (path, query, fragment) = if input == "sqlite::memory:" || input == "sqlite:///:memory:" {
        options.insert("memory".into(), json!(true));
        (":memory:".into(), Map::new(), None)
    } else if (starts_ci(input, "sqlite:") || starts_ci(input, "file:"))
        && !input.eq_ignore_ascii_case("sqlite::memory:")
    {
        let source = replace_prefix_ci(input, "sqlite:file:", "file:");
        if starts_ci(&source, "file:") && !source[5..].starts_with('/') {
            strip_file_meta(&source[5..])
        } else {
            let parts = parse_hierarchical(&source)?;
            (safe_decode(&parts.pathname), parts.query, parts.fragment)
        }
    } else {
        strip_file_meta(&replace_prefix_ci(input, "sqlite:", ""))
    };
    Ok(base_address(
        definition,
        "sqlite",
        raw,
        safe,
        Map::new(),
        Resource {
            kind: rule_type(&definition.resource, "database"),
            name: if path.is_empty() {
                basename(&path)
            } else {
                Some(path.clone())
            },
        },
        path,
        query,
        fragment,
        BTreeMap::new(),
        options,
    ))
}

fn parse_duckdb(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let mut options = Map::new();
    let (path, query, fragment) = if input == "duckdb::memory:" || input == ":memory:" {
        options.insert("memory".into(), json!(true));
        (":memory:".into(), Map::new(), None)
    } else if starts_ci(input, "duckdb://") {
        let parts = parse_hierarchical(input)?;
        (safe_decode(&parts.pathname), parts.query, parts.fragment)
    } else {
        strip_file_meta(&replace_prefix_ci(input, "duckdb:", ""))
    };
    Ok(base_address(
        definition,
        "duckdb",
        raw,
        safe,
        Map::new(),
        Resource {
            kind: rule_type(&definition.resource, "database"),
            name: if path.is_empty() {
                basename(&path)
            } else {
                Some(path.clone())
            },
        },
        path,
        query,
        fragment,
        BTreeMap::new(),
        options,
    ))
}

fn parse_clickhouse(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    if is_clickhouse_jdbc(input) {
        return parse_jdbc(input, definition, raw, safe);
    }
    let parts = parse_hierarchical(input)?;
    let protocol = if parts.scheme == "http" || parts.scheme == "https" {
        parts.scheme.clone()
    } else {
        "native".into()
    };
    let port = parts
        .port
        .unwrap_or_else(|| clickhouse_default_port(&protocol, &definition.defaults));
    Ok(base_address(
        definition,
        if parts.scheme == "ch" {
            "clickhouse"
        } else {
            &parts.scheme
        },
        raw,
        safe,
        map_from_pairs(vec![("host", json!(parts.host)), ("port", json!(port))]),
        Resource {
            kind: "database".into(),
            name: parts.path_segments.first().cloned(),
        },
        parts
            .path_segments
            .iter()
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join("/"),
        parts.query.clone(),
        parts.fragment.clone(),
        credentials_from_parts(&parts),
        map_from_pairs(vec![("protocol", json!(protocol))]),
    ))
}

fn parse_memcached(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let mut hosts = vec![];
    let mut credentials = BTreeMap::new();
    let mut query = Map::new();
    let mut tls = false;
    if has_hierarchical_scheme(input) {
        let parts = parse_hierarchical(input)?;
        hosts = parts
            .hosts
            .iter()
            .map(|entry| {
                map_from_pairs(vec![
                    (
                        "host",
                        entry.get("host").cloned().unwrap_or_else(|| json!("")),
                    ),
                    (
                        "port",
                        entry
                            .get("port")
                            .and_then(Value::as_i64)
                            .or_else(|| default_port(&definition.defaults))
                            .map_or(Value::Null, |v| json!(v)),
                    ),
                ])
            })
            .collect();
        credentials = credentials_from_parts(&parts);
        query = parts.query;
        tls = parts.scheme == "memcacheds";
    } else {
        for part in input.split(',').map(str::trim).filter(|v| !v.is_empty()) {
            let parsed = parse_host_port(part);
            hosts.push(map_from_pairs(vec![
                ("host", json!(parsed.0)),
                (
                    "port",
                    json!(parsed
                        .1
                        .or_else(|| default_port(&definition.defaults))
                        .unwrap_or(11211)),
                ),
            ]));
        }
    }
    let authority = if hosts.len() > 1 {
        map_from_pairs(vec![(
            "hosts",
            Value::Array(hosts.into_iter().map(Value::Object).collect()),
        )])
    } else {
        map_from_pairs(vec![
            (
                "host",
                hosts
                    .first()
                    .and_then(|v| v.get("host"))
                    .cloned()
                    .unwrap_or_else(|| json!("")),
            ),
            (
                "port",
                hosts
                    .first()
                    .and_then(|v| v.get("port"))
                    .cloned()
                    .unwrap_or_else(|| json!(11211)),
            ),
        ])
    };
    Ok(base_address(
        definition,
        "memcached",
        raw,
        safe,
        authority,
        Resource {
            kind: "none".into(),
            name: None,
        },
        "",
        query,
        None,
        credentials,
        map_from_pairs(vec![("tls", json!(tls))]),
    ))
}

fn parse_elasticsearch(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let source = replace_prefix_ci(
        &replace_prefix_ci(
            &replace_prefix_ci(
                &replace_prefix_ci(input, "elasticsearch+https", "https"),
                "elasticsearch+http",
                "http",
            ),
            "elasticsearch://",
            "http://",
        ),
        "elastic://",
        "http://",
    );
    let parts = parse_hierarchical(&source)?;
    let mut credentials = credentials_from_parts(&parts);
    for key in ["api_key", "apiKey", "token"] {
        if let Some(value) = parts.query.get(key).and_then(Value::as_str) {
            credentials.insert(
                if key == "apiKey" { "api_key" } else { key }.into(),
                value.into(),
            );
        }
    }
    Ok(base_address(
        definition,
        "elasticsearch",
        raw,
        safe,
        map_from_pairs(vec![
            ("host", json!(parts.host)),
            (
                "port",
                json!(parts
                    .port
                    .or_else(|| default_port(&definition.defaults))
                    .unwrap_or(9200)),
            ),
        ]),
        Resource {
            kind: "index".into(),
            name: parts.path_segments.first().cloned(),
        },
        parts
            .path_segments
            .iter()
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join("/"),
        parts.query,
        parts.fragment,
        credentials,
        map_from_pairs(vec![
            ("protocol", json!(parts.scheme.clone())),
            ("tls", json!(parts.scheme == "https")),
        ]),
    ))
}

fn parse_questdb(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    if is_questdb_config(input) {
        let (protocol, body) = input.split_once("::").unwrap_or((input, ""));
        let mut grouped = Map::new();
        for part in body.split(';').map(str::trim).filter(|v| !v.is_empty()) {
            let (key, value) = part.split_once('=').unwrap_or((part, ""));
            append_query(&mut grouped, key, value);
        }
        let default_port = if protocol == "http" || protocol == "https" {
            9000
        } else {
            9009
        };
        let addrs = grouped.get("addr").cloned();
        let mut hosts = vec![];
        for addr in value_strings(addrs.as_ref()) {
            let parsed = parse_host_port(&addr);
            hosts.push(map_from_pairs(vec![
                ("host", json!(parsed.0)),
                ("port", json!(parsed.1.unwrap_or(default_port))),
            ]));
        }
        grouped.remove("addr");
        let mut credentials = BTreeMap::new();
        for key in ["username", "password", "token"] {
            if let Some(value) = grouped
                .remove(key)
                .and_then(|v| v.as_str().map(str::to_string))
            {
                credentials.insert(key.into(), value);
            }
        }
        let authority = if hosts.len() > 1 {
            map_from_pairs(vec![(
                "hosts",
                Value::Array(hosts.into_iter().map(Value::Object).collect()),
            )])
        } else {
            map_from_pairs(vec![
                (
                    "host",
                    hosts
                        .first()
                        .and_then(|v| v.get("host"))
                        .cloned()
                        .unwrap_or_else(|| json!("")),
                ),
                (
                    "port",
                    hosts
                        .first()
                        .and_then(|v| v.get("port"))
                        .cloned()
                        .unwrap_or_else(|| json!(default_port)),
                ),
            ])
        };
        return Ok(base_address(
            definition,
            "questdb",
            raw,
            safe,
            authority,
            Resource {
                kind: "endpoint".into(),
                name: None,
            },
            "",
            grouped,
            None,
            credentials,
            map_from_pairs(vec![
                ("ingestion", json!(true)),
                ("protocol", json!(protocol)),
                ("tls", json!(protocol == "https" || protocol == "tcps")),
            ]),
        ));
    }
    let parts = parse_hierarchical(input)?;
    Ok(base_address(
        definition,
        &parts.scheme,
        raw,
        safe,
        map_from_pairs(vec![
            ("host", json!(parts.host)),
            (
                "port",
                json!(parts
                    .port
                    .or_else(|| default_port(&definition.defaults))
                    .unwrap_or(8812)),
            ),
        ]),
        Resource {
            kind: "database".into(),
            name: parts.path_segments.first().cloned(),
        },
        parts
            .path_segments
            .iter()
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join("/"),
        parts.query.clone(),
        parts.fragment.clone(),
        credentials_from_parts(&parts),
        map_from_pairs(vec![("compatible_with", json!("postgres"))]),
    ))
}

fn parse_s3(
    input: &str,
    definition: &Definition,
    raw: &str,
    safe: &str,
) -> Result<Address, String> {
    let raw_scheme = extract_scheme(input).unwrap_or_default();
    let (bucket, key, region, query, fragment, options) = if raw_scheme == "s3" {
        let parts = parse_hierarchical(input)?;
        let region = parts
            .query
            .get("region")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        (
            parts.host,
            parts.path_segments.join("/"),
            region,
            parts.query,
            parts.fragment,
            Map::new(),
        )
    } else {
        let parts = parse_hierarchical(input)?;
        let host_info = parse_s3_host(&parts.host);
        let mut options = Map::new();
        options.insert("source_scheme".into(), json!(raw_scheme));
        if !host_info.0.is_empty() {
            (
                host_info.0,
                parts.path_segments.join("/"),
                host_info.1,
                parts.query,
                parts.fragment,
                options,
            )
        } else {
            let bucket = parts.path_segments.first().cloned().unwrap_or_default();
            (
                bucket,
                parts
                    .path_segments
                    .iter()
                    .skip(1)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("/"),
                host_info.1,
                parts.query,
                parts.fragment,
                options,
            )
        }
    };
    Ok(base_address(
        definition,
        "s3",
        raw,
        safe,
        map_from_pairs(vec![
            ("bucket", json!(bucket.clone())),
            ("region", json!(region)),
        ]),
        Resource {
            kind: rule_type(&definition.resource, "bucket"),
            name: if bucket.is_empty() {
                None
            } else {
                Some(bucket)
            },
        },
        key,
        query,
        fragment,
        BTreeMap::new(),
        options,
    ))
}

fn base_address(
    definition: &Definition,
    scheme: &str,
    raw: &str,
    safe: &str,
    authority: Map<String, Value>,
    resource: Resource,
    path: impl Into<String>,
    query: Map<String, Value>,
    fragment: Option<String>,
    credentials: BTreeMap<String, String>,
    options: Map<String, Value>,
) -> Address {
    Address {
        scheme: scheme.to_string(),
        kind: if definition.kind.is_empty() {
            "unknown".into()
        } else {
            definition.kind.clone()
        },
        authority,
        resource,
        path: path.into(),
        query,
        fragment,
        credentials,
        options,
        raw: raw.into(),
        safe: safe.into(),
    }
}

fn parse_hierarchical(input: &str) -> Result<Parts, String> {
    let scheme_end = input.find("://").ok_or_else(|| "Invalid URL".to_string())?;
    let scheme = input[..scheme_end].to_lowercase();
    let rest = &input[scheme_end + 3..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority_text = &rest[..authority_end];
    let after_authority = &rest[authority_end..];
    let path_end = after_authority
        .find(['?', '#'])
        .unwrap_or(after_authority.len());
    let pathname = &after_authority[..path_end];
    let mut search = "";
    let mut fragment = None;
    let mut remaining = &after_authority[path_end..];
    if remaining.starts_with('?') {
        remaining = &remaining[1..];
        let query_end = remaining.find('#').unwrap_or(remaining.len());
        search = &remaining[..query_end];
        remaining = &remaining[query_end..];
    }
    if let Some(rest) = remaining.strip_prefix('#') {
        fragment = Some(safe_decode(rest));
    }

    let at = authority_text.rfind('@');
    let user_info = at.map(|index| &authority_text[..index]).unwrap_or("");
    let host_text = at
        .map(|index| &authority_text[index + 1..])
        .unwrap_or(authority_text);
    let (username, password) = if user_info.is_empty() {
        (String::new(), String::new())
    } else {
        let mut parts = user_info.split(':');
        let username = safe_decode(parts.next().unwrap_or(""));
        let password_parts = parts.collect::<Vec<_>>();
        let password = if password_parts.is_empty() {
            String::new()
        } else {
            safe_decode(&password_parts.join(":"))
        };
        (username, password)
    };
    let hosts = host_text
        .split(',')
        .filter(|v| !v.is_empty())
        .map(|part| {
            let parsed = parse_host_port(part);
            map_from_pairs(vec![
                ("host", json!(parsed.0)),
                ("port", optional_i64(parsed.1)),
            ])
        })
        .collect::<Vec<_>>();
    Ok(Parts {
        scheme,
        username,
        password,
        host: hosts
            .first()
            .and_then(|h| h.get("host"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        port: hosts
            .first()
            .and_then(|h| h.get("port"))
            .and_then(Value::as_i64),
        hosts,
        pathname: pathname.into(),
        path_segments: split_path(pathname),
        query: parse_query(search),
        fragment,
    })
}

fn parse_host_port(value: &str) -> (String, Option<i64>) {
    if value.is_empty() {
        return ("".into(), None);
    }
    if let Some(rest) = value.strip_prefix('[') {
        if let Some(close) = rest.find(']') {
            let host = rest[..close].to_string();
            let tail = &rest[close + 1..];
            return (host, tail.strip_prefix(':').and_then(|v| v.parse().ok()));
        }
    }
    if let Some(colon) = value.rfind(':') {
        if value.find(':') == Some(colon) && value[colon + 1..].chars().all(|c| c.is_ascii_digit())
        {
            return (value[..colon].into(), value[colon + 1..].parse().ok());
        }
    }
    (value.into(), None)
}

fn parse_query(search: &str) -> Map<String, Value> {
    let mut query = Map::new();
    let search = search.strip_prefix('?').unwrap_or(search);
    if search.is_empty() {
        return query;
    }
    for pair in search.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        append_query(&mut query, &safe_decode(key), &safe_decode(value));
    }
    query
}

fn append_query(query: &mut Map<String, Value>, key: &str, value: &str) {
    if let Some(current) = query.get_mut(key) {
        match current {
            Value::Array(items) => items.push(json!(value)),
            item => {
                let old = item.take();
                *item = Value::Array(vec![old, json!(value)]);
            }
        }
    } else {
        query.insert(key.into(), json!(value));
    }
}

fn split_path(pathname: &str) -> Vec<String> {
    let text = pathname.strip_prefix('/').unwrap_or(pathname);
    if text.is_empty() {
        vec![]
    } else {
        text.split('/').map(safe_decode).collect()
    }
}

fn safe_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                out.push(hex);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| value.into())
}

fn encode_component(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

fn encode_path(path: &str) -> String {
    if path.is_empty() {
        String::new()
    } else {
        path.split('/')
            .map(encode_component)
            .collect::<Vec<_>>()
            .join("/")
    }
}

fn credentials_from_parts(parts: &Parts) -> BTreeMap<String, String> {
    let mut credentials = BTreeMap::new();
    if !parts.username.is_empty() {
        credentials.insert("username".into(), parts.username.clone());
    }
    if !parts.password.is_empty() {
        credentials.insert("password".into(), parts.password.clone());
    }
    credentials
}

fn authority_from_parts(
    parts: &Parts,
    defaults: &Map<String, Value>,
    omit_ports: bool,
) -> Map<String, Value> {
    let empty_defaults = Map::new();
    let active_defaults = if omit_ports {
        &empty_defaults
    } else {
        defaults
    };
    if parts.hosts.len() > 1 {
        let hosts = parts
            .hosts
            .iter()
            .map(|entry| {
                if omit_ports {
                    map_from_pairs(vec![
                        (
                            "host",
                            entry.get("host").cloned().unwrap_or_else(|| json!("")),
                        ),
                        ("port", Value::Null),
                    ])
                } else {
                    entry.clone()
                }
            })
            .collect::<Vec<_>>();
        return apply_default_port(
            map_from_pairs(vec![(
                "hosts",
                Value::Array(hosts.into_iter().map(Value::Object).collect()),
            )]),
            active_defaults,
        );
    }
    apply_default_port(
        map_from_pairs(vec![
            ("host", json!(parts.host)),
            (
                "port",
                if omit_ports {
                    Value::Null
                } else {
                    optional_i64(parts.port)
                },
            ),
        ]),
        active_defaults,
    )
}

fn apply_default_port(
    mut authority: Map<String, Value>,
    defaults: &Map<String, Value>,
) -> Map<String, Value> {
    let Some(port) = default_port(defaults) else {
        return authority;
    };
    if authority.get("port").is_none_or(Value::is_null)
        && authority
            .get("host")
            .and_then(Value::as_str)
            .is_some_and(|v| !v.is_empty())
    {
        authority.insert("port".into(), json!(port));
    }
    if let Some(Value::Array(hosts)) = authority.get_mut("hosts") {
        for host in hosts {
            if let Value::Object(object) = host {
                if object.get("port").is_none_or(Value::is_null) {
                    object.insert("port".into(), json!(port));
                }
            }
        }
    }
    authority
}

fn split_conninfo(input: &str) -> BTreeMap<String, String> {
    let mut pairs = BTreeMap::new();
    let chars = input.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < chars.len() {
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }
        let mut key = String::new();
        while index < chars.len() && chars[index] != '=' {
            key.push(chars[index]);
            index += 1;
        }
        if key.is_empty() || index >= chars.len() || chars[index] != '=' {
            break;
        }
        index += 1;
        let mut value = String::new();
        if index < chars.len() && chars[index] == '\'' {
            index += 1;
            while index < chars.len() {
                if chars[index] == '\\' && index + 1 < chars.len() {
                    value.push(chars[index + 1]);
                    index += 2;
                } else if chars[index] == '\'' {
                    index += 1;
                    break;
                } else {
                    value.push(chars[index]);
                    index += 1;
                }
            }
        } else {
            while index < chars.len() && !chars[index].is_whitespace() {
                value.push(chars[index]);
                index += 1;
            }
        }
        pairs.insert(key.trim().into(), value);
    }
    pairs
}

fn parse_host_lists(
    host_value: &str,
    port_value: &str,
    defaults: &Map<String, Value>,
) -> Map<String, Value> {
    let hosts = host_value
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>();
    let ports = port_value.split(',').map(str::trim).collect::<Vec<_>>();
    if hosts.len() > 1 {
        let values = hosts
            .iter()
            .enumerate()
            .map(|(index, host)| {
                map_from_pairs(vec![
                    ("host", json!(host)),
                    (
                        "port",
                        ports
                            .get(index)
                            .filter(|v| !v.is_empty())
                            .and_then(|v| v.parse::<i64>().ok())
                            .or_else(|| default_port(defaults))
                            .map_or(Value::Null, |v| json!(v)),
                    ),
                ])
            })
            .collect::<Vec<_>>();
        return map_from_pairs(vec![(
            "hosts",
            Value::Array(values.into_iter().map(Value::Object).collect()),
        )]);
    }
    let parsed = parse_host_port(hosts.first().copied().unwrap_or(""));
    map_from_pairs(vec![
        ("host", json!(parsed.0)),
        (
            "port",
            parsed
                .1
                .or_else(|| {
                    ports
                        .first()
                        .filter(|v| !v.is_empty())
                        .and_then(|v| v.parse().ok())
                })
                .or_else(|| default_port(defaults))
                .map_or(Value::Null, |v| json!(v)),
        ),
    ])
}

fn strip_file_meta(value: &str) -> (String, Map<String, Value>, Option<String>) {
    let mut body = value.to_string();
    let mut fragment = None;
    let mut query = Map::new();
    if let Some(hash) = body.find('#') {
        fragment = Some(safe_decode(&body[hash + 1..]));
        body.truncate(hash);
    }
    if let Some(question) = body.find('?') {
        query = parse_query(&body[question + 1..]);
        body.truncate(question);
    }
    (body, query, fragment)
}

fn parse_s3_host(host: &str) -> (String, String) {
    let lower = host.to_lowercase();
    if let Some(prefix) = lower.find(".s3") {
        if lower.ends_with(".amazonaws.com") {
            let bucket = host[..prefix].to_string();
            let rest = &lower[prefix + 3..lower.len() - ".amazonaws.com".len()];
            let region = rest
                .strip_prefix('.')
                .or_else(|| rest.strip_prefix('-'))
                .unwrap_or("")
                .to_string();
            return (bucket, region);
        }
    }
    if lower.starts_with("s3.") && lower.ends_with(".amazonaws.com") {
        return (
            "".into(),
            lower["s3.".len()..lower.len() - ".amazonaws.com".len()].into(),
        );
    }
    if lower.starts_with("s3-") && lower.ends_with(".amazonaws.com") {
        return (
            "".into(),
            lower["s3-".len()..lower.len() - ".amazonaws.com".len()].into(),
        );
    }
    ("".into(), "".into())
}

fn validate_address(
    address: &Address,
    definition: &Definition,
    options: &ParseOptions,
) -> (Vec<Diagnostic>, Vec<Diagnostic>) {
    let mut errors = vec![];
    let mut warnings = vec![];
    let has_host = address
        .authority
        .get("host")
        .and_then(Value::as_str)
        .is_some_and(|v| !v.is_empty());
    let has_hosts = address
        .authority
        .get("hosts")
        .and_then(Value::as_array)
        .is_some_and(|v| !v.is_empty());
    if definition.validation.require_host && !has_host && !has_hosts {
        errors.push(diagnostic(
            "MISSING_HOST",
            &format!("{} requires a host", display_name(definition)),
            "authority",
        ));
    }
    if definition.resource.required && address.resource.name.is_none() {
        errors.push(diagnostic(
            "MISSING_RESOURCE",
            &format!("{} requires a resource", display_name(definition)),
            "resource.name",
        ));
    }
    if definition.path.required && address.path.is_empty() {
        errors.push(diagnostic(
            "MISSING_PATH",
            &format!("{} requires a path", display_name(definition)),
            "path",
        ));
    }
    if let Some(range) = &definition.validation.port_range {
        for port in collect_ports(&address.authority) {
            if port < range.min || port > range.max {
                errors.push(diagnostic(
                    "INVALID_PORT",
                    &format!("Port must be between {} and {}", range.min, range.max),
                    "authority.port",
                ));
            }
        }
    }
    for (key, value) in &address.query {
        if let Some(rule) = definition.query_parameters.get(key) {
            errors.extend(validate_query_value(rule, key, value));
        } else {
            let item = diagnostic(
                "UNKNOWN_QUERY_PARAMETER",
                &format!("{} is not declared for {}", key, definition.id),
                &format!("query.{}", key),
            );
            if options.strict {
                errors.push(item);
            } else {
                warnings.push(item);
            }
        }
    }
    (errors, warnings)
}

fn validate_query_value(rule: &QueryRule, key: &str, value: &Value) -> Vec<Diagnostic> {
    let mut errors = vec![];
    for item in value_items(value) {
        let text = value_to_string(item);
        if rule.kind == "boolean"
            && !matches!(
                text.to_lowercase().as_str(),
                "true" | "false" | "1" | "0" | "yes" | "no"
            )
        {
            errors.push(diagnostic(
                "INVALID_QUERY_PARAMETER_TYPE",
                &format!("{} must be a boolean", key),
                &format!("query.{}", key),
            ));
        }
        if rule.kind == "number" && text.parse::<f64>().is_err() {
            errors.push(diagnostic(
                "INVALID_QUERY_PARAMETER_TYPE",
                &format!("{} must be a number", key),
                &format!("query.{}", key),
            ));
        }
        if !rule.allowed.is_empty()
            && !rule
                .allowed
                .iter()
                .any(|allowed| value_to_string(allowed) == text)
        {
            errors.push(diagnostic(
                "INVALID_QUERY_PARAMETER_VALUE",
                &format!(
                    "{} must be one of: {}",
                    key,
                    rule.allowed
                        .iter()
                        .map(value_to_string)
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                &format!("query.{}", key),
            ));
        }
    }
    errors
}

pub fn mask(input: &str, definition: Option<&Definition>) -> String {
    mask_sensitive_key_values(
        &mask_sensitive_query(&mask_userinfo(input), definition),
        definition,
    )
}

fn mask_userinfo(value: &str) -> String {
    let marker = value.find("://");
    let start = marker.map_or(0, |index| index + 3);
    let end = value[start..]
        .find(['/', '?', '#'])
        .map_or(value.len(), |index| start + index);
    let authority = &value[start..end];
    let Some(at) = authority.rfind('@') else {
        return value.into();
    };
    let user_info = &authority[..at];
    if marker.is_none() && !user_info.contains(':') {
        return value.into();
    }
    let Some(colon) = user_info.find(':') else {
        return value.into();
    };
    format!(
        "{}{}:***@{}{}",
        &value[..start],
        &user_info[..colon],
        &authority[at + 1..],
        &value[end..]
    )
}

fn mask_sensitive_query(value: &str, definition: Option<&Definition>) -> String {
    mask_delimited(value, definition, &['?', '&'], &['&', '#'], false)
}

fn mask_sensitive_key_values(value: &str, definition: Option<&Definition>) -> String {
    mask_delimited(
        value,
        definition,
        &[';', ',', '&', ' ', '\t', '\n'],
        &[';', ',', '&', ' ', '\t', '\n'],
        true,
    )
}

fn mask_delimited(
    value: &str,
    definition: Option<&Definition>,
    starts: &[char],
    ends: &[char],
    allow_initial: bool,
) -> String {
    let sensitive = sensitive_keys(definition);
    if sensitive.is_empty() {
        return value.into();
    }
    let chars = value.chars().collect::<Vec<_>>();
    let mut out = String::new();
    let mut index = 0;
    while index < chars.len() {
        let prefix_ok = (allow_initial && index == 0) || starts.contains(&chars[index]);
        if prefix_ok {
            let prefix = if starts.contains(&chars[index]) {
                let ch = chars[index];
                index += 1;
                Some(ch)
            } else {
                None
            };
            let key_start = index;
            while index < chars.len() && chars[index] != '=' && !ends.contains(&chars[index]) {
                index += 1;
            }
            if index < chars.len() && chars[index] == '=' {
                let key = chars[key_start..index].iter().collect::<String>();
                index += 1;
                let value_start = index;
                while index < chars.len() && !ends.contains(&chars[index]) {
                    index += 1;
                }
                if let Some(prefix) = prefix {
                    out.push(prefix);
                }
                out.push_str(&key);
                out.push('=');
                if sensitive.contains(&normalize_key(&safe_decode(&key))) {
                    out.push_str("***");
                } else {
                    out.push_str(&chars[value_start..index].iter().collect::<String>());
                }
                continue;
            }
            if let Some(prefix) = prefix {
                out.push(prefix);
            }
            out.push_str(&chars[key_start..index].iter().collect::<String>());
            continue;
        }
        out.push(chars[index]);
        index += 1;
    }
    out
}

fn canonicalize_address(address: &Address, options: &CanonicalizeOptions) -> String {
    let definition = definition_for(address, options);
    let scheme = canonical_scheme(address, &definition);
    let authority = canonical_authority(address, &definition, options);
    let path = canonical_path(address);
    let query = canonical_query(address, &definition, options);
    let fragment = canonical_fragment(address, options);
    if scheme == "file" && authority.is_empty() {
        return if path.starts_with('/') {
            format!("file://{}{}{}", path, query, fragment)
        } else {
            format!("file:{}{}{}", path, query, fragment)
        };
    }
    if authority.is_empty() {
        return format!("{}:{}{}{}", scheme, path, query, fragment);
    }
    format!(
        "{}://{}{}{}{}{}",
        scheme,
        canonical_userinfo(address, options),
        authority,
        path,
        query,
        fragment
    )
}

fn definition_for(address: &Address, options: &CanonicalizeOptions) -> Definition {
    if let Some(definition) = &options.definition {
        return definition.clone();
    }
    let registry =
        Registry::new([built_in_definitions(), options.parse.definitions.clone()].concat());
    if let Some(provider) = &options.parse.provider {
        let provider = provider.to_lowercase();
        if let Some(definition) = registry
            .by_id(&provider)
            .or_else(|| registry.by_scheme(&provider))
        {
            return definition;
        }
    }
    if address.scheme.to_lowercase().starts_with("jdbc:") {
        if let Some(provider) = address.scheme.split(':').nth(1) {
            if let Some(definition) = registry.by_scheme(provider) {
                return definition;
            }
        }
    }
    registry.by_scheme(&address.scheme).unwrap_or_default()
}

fn canonical_scheme(address: &Address, definition: &Definition) -> String {
    let scheme = address.scheme.to_lowercase();
    if scheme.starts_with("jdbc:") {
        return scheme;
    }
    if definition
        .schemes
        .iter()
        .any(|item| item.eq_ignore_ascii_case(&scheme))
    {
        return definition
            .schemes
            .first()
            .map(|v| v.to_lowercase())
            .unwrap_or(scheme);
    }
    scheme
}

fn canonical_authority(
    address: &Address,
    definition: &Definition,
    options: &CanonicalizeOptions,
) -> String {
    authority_entries(address)
        .iter()
        .map(|entry| {
            format!(
                "{}{}",
                format_host(entry.0.as_str()),
                format_port(entry.1.as_ref(), definition, options)
            )
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn authority_entries(address: &Address) -> Vec<(String, Option<Value>)> {
    if let Some(hosts) = address.authority.get("hosts").and_then(Value::as_array) {
        return hosts
            .iter()
            .filter_map(Value::as_object)
            .map(|host| {
                (
                    host.get("host")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .into(),
                    host.get("port").cloned(),
                )
            })
            .collect();
    }
    if let Some(host) = address
        .authority
        .get("host")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
    {
        return vec![(host.into(), address.authority.get("port").cloned())];
    }
    if let Some(bucket) = address
        .authority
        .get("bucket")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
    {
        return vec![(bucket.into(), None)];
    }
    if address.resource.kind == "bucket" {
        if let Some(name) = &address.resource.name {
            return vec![(name.clone(), None)];
        }
    }
    vec![]
}

fn canonical_path(address: &Address) -> String {
    if address.kind == "file" || address.scheme == "file" {
        return encode_path(&address.path);
    }
    let mut segments = vec![];
    if address.resource.kind != "none" && address.resource.kind != "bucket" {
        if let Some(name) = &address.resource.name {
            if !name.is_empty() {
                segments.push(encode_component(name));
            }
        }
    }
    if !address.path.is_empty() {
        segments.extend(
            address
                .path
                .split('/')
                .filter(|v| !v.is_empty())
                .map(encode_component),
        );
    }
    if segments.is_empty() {
        String::new()
    } else {
        format!("/{}", segments.join("/"))
    }
}

fn canonical_query(
    address: &Address,
    definition: &Definition,
    options: &CanonicalizeOptions,
) -> String {
    let mut parts = vec![];
    for (key, value) in &address.query {
        for item in value_items(value) {
            parts.push(format!(
                "{}={}",
                encode_component(key),
                encode_component(&normalize_query_value(key, item, definition, options))
            ));
        }
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!("?{}", parts.join("&"))
    }
}

fn normalize_query_value(
    key: &str,
    value: &Value,
    definition: &Definition,
    options: &CanonicalizeOptions,
) -> String {
    if !options.include_sensitive && sensitive_keys(Some(definition)).contains(&normalize_key(key))
    {
        return "***".into();
    }
    let text = value_to_string(value);
    if definition
        .query_parameters
        .get(key)
        .is_some_and(|rule| rule.kind == "boolean")
    {
        return match text.to_lowercase().as_str() {
            "true" | "1" | "yes" => "true".into(),
            "false" | "0" | "no" => "false".into(),
            _ => text,
        };
    }
    text
}

fn canonical_fragment(address: &Address, options: &CanonicalizeOptions) -> String {
    if !options.include_fragment {
        return String::new();
    }
    address
        .fragment
        .as_ref()
        .filter(|v| !v.is_empty())
        .map(|v| format!("#{}", encode_component(v)))
        .unwrap_or_default()
}

fn canonical_userinfo(address: &Address, options: &CanonicalizeOptions) -> String {
    if !options.include_credentials {
        return String::new();
    }
    let username = address
        .credentials
        .get("username")
        .map(String::as_str)
        .unwrap_or("");
    let password = address
        .credentials
        .get("password")
        .map(String::as_str)
        .unwrap_or("");
    if username.is_empty() && password.is_empty() {
        return String::new();
    }
    format!(
        "{}{}@",
        encode_component(username),
        if password.is_empty() {
            String::new()
        } else {
            format!(":{}", encode_component(password))
        }
    )
}

fn normalized_authority(
    address: &Address,
    definition: &Definition,
    options: &CanonicalizeOptions,
) -> Map<String, Value> {
    let entries = authority_entries(address);
    if entries.is_empty() {
        return Map::new();
    }
    if entries.len() > 1 {
        return map_from_pairs(vec![(
            "hosts",
            Value::Array(
                entries
                    .into_iter()
                    .map(|(host, port)| {
                        Value::Object(map_from_pairs(vec![
                            ("host", json!(host.to_lowercase())),
                            ("port", normalized_port(port.as_ref(), definition, options)),
                        ]))
                    })
                    .collect(),
            ),
        )]);
    }
    let (host, port) = &entries[0];
    if address.resource.kind == "bucket" {
        let mut output = map_from_pairs(vec![("bucket", json!(host.to_lowercase()))]);
        if let Some(region) = address
            .authority
            .get("region")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
        {
            output.insert("region".into(), json!(region));
        }
        return output;
    }
    map_from_pairs(vec![
        ("host", json!(host.to_lowercase())),
        ("port", normalized_port(port.as_ref(), definition, options)),
    ])
}

fn normalized_query(
    address: &Address,
    definition: &Definition,
    options: &CanonicalizeOptions,
) -> Map<String, Value> {
    let mut output = Map::new();
    for (key, value) in &address.query {
        let values = value_items(value)
            .into_iter()
            .map(|item| normalize_query_value(key, item, definition, options))
            .collect::<Vec<_>>();
        output.insert(
            key.clone(),
            if values.len() == 1 {
                json!(values[0])
            } else {
                Value::Array(values.into_iter().map(Value::String).collect())
            },
        );
    }
    output
}

fn normalized_credentials(
    address: &Address,
    options: &CanonicalizeOptions,
) -> BTreeMap<String, String> {
    if !options.include_credentials {
        return BTreeMap::new();
    }
    address.credentials.clone()
}

fn normalized_port(
    port: Option<&Value>,
    definition: &Definition,
    options: &CanonicalizeOptions,
) -> Value {
    let Some(numeric) = port.and_then(Value::as_i64) else {
        return Value::Null;
    };
    if !options.include_default_port && Some(numeric) == default_port(&definition.defaults) {
        Value::Null
    } else {
        json!(numeric)
    }
}

fn value_items(value: &Value) -> Vec<&Value> {
    value
        .as_array()
        .map(|items| items.iter().collect())
        .unwrap_or_else(|| vec![value])
}

fn value_strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items.iter().map(value_to_string).collect(),
        Some(item) => vec![value_to_string(item)],
        None => vec![],
    }
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(value) => value.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn collect_ports(authority: &Map<String, Value>) -> Vec<i64> {
    let mut ports = vec![];
    if let Some(port) = authority.get("port").and_then(Value::as_i64) {
        ports.push(port);
    }
    if let Some(hosts) = authority.get("hosts").and_then(Value::as_array) {
        for host in hosts {
            if let Some(port) = host.get("port").and_then(Value::as_i64) {
                ports.push(port);
            }
        }
    }
    ports
}

fn sensitive_keys(definition: Option<&Definition>) -> BTreeSet<String> {
    definition
        .map(|definition| {
            definition
                .redaction
                .sensitive_keys
                .iter()
                .map(|key| normalize_key(key))
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_key(key: &str) -> String {
    key.trim().to_lowercase()
}

fn display_name(definition: &Definition) -> &str {
    if definition.name.is_empty() {
        &definition.id
    } else {
        &definition.name
    }
}

fn rule_type(rule: &Rule, fallback: &str) -> String {
    if rule.kind.is_empty() {
        fallback.into()
    } else {
        rule.kind.clone()
    }
}

fn default_port(defaults: &Map<String, Value>) -> Option<i64> {
    defaults.get("port").and_then(Value::as_i64)
}

fn jdbc_default_port(provider: &str, protocol: &str, defaults: &Map<String, Value>) -> Option<i64> {
    if provider == "clickhouse" || provider == "ch" {
        return Some(match protocol {
            "https" => 8443,
            "grpc" => 9100,
            _ => default_port(defaults).unwrap_or(8123),
        });
    }
    default_port(defaults)
}

fn clickhouse_default_port(protocol: &str, defaults: &Map<String, Value>) -> i64 {
    match protocol {
        "https" => 8443,
        "http" => 8123,
        "grpc" => 9100,
        _ => default_port(defaults).unwrap_or(9000),
    }
}

fn basename(path: &str) -> Option<String> {
    path.split('/')
        .filter(|v| !v.is_empty())
        .last()
        .map(str::to_string)
        .or_else(|| Some(path.into()))
}

fn optional_i64(value: Option<i64>) -> Value {
    value.map_or(Value::Null, |value| json!(value))
}

fn string_value(value: &str) -> Value {
    json!(value)
}

fn map_from_pairs(pairs: Vec<(&str, Value)>) -> Map<String, Value> {
    pairs
        .into_iter()
        .map(|(key, value)| (key.into(), value))
        .collect()
}

fn sorted_map(map: &Map<String, Value>) -> Map<String, Value> {
    map.iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

fn extract_scheme(input: &str) -> Option<String> {
    let colon = input.find(':')?;
    let scheme = &input[..colon];
    let mut chars = scheme.chars();
    if !chars.next().is_some_and(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    if chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-')) {
        Some(scheme.to_lowercase())
    } else {
        None
    }
}

fn has_hierarchical_scheme(input: &str) -> bool {
    extract_scheme(input).is_some() && input.contains("://")
}

fn starts_ci(value: &str, prefix: &str) -> bool {
    value.len() >= prefix.len() && value[..prefix.len()].eq_ignore_ascii_case(prefix)
}

fn replace_prefix_ci(value: &str, prefix: &str, replacement: &str) -> String {
    if starts_ci(value, prefix) {
        format!("{}{}", replacement, &value[prefix.len()..])
    } else {
        value.into()
    }
}

fn looks_like_file_path(input: &str) -> bool {
    input.starts_with('/')
        || input.starts_with("./")
        || input.starts_with("../")
        || input.starts_with("~/")
        || (input.len() > 2
            && input.as_bytes()[1] == b':'
            && matches!(input.as_bytes()[2], b'/' | b'\\'))
}

fn looks_like_duckdb_path(input: &str) -> bool {
    let lower = input.to_lowercase();
    lower.ends_with(".duckdb")
        || lower.contains(".duckdb?")
        || lower.contains(".duckdb#")
        || lower.ends_with(".ddb")
        || lower.contains(".ddb?")
        || lower.contains(".ddb#")
}

fn is_clickhouse_jdbc(input: &str) -> bool {
    let lower = input.to_lowercase();
    (lower.starts_with("jdbc:clickhouse") || lower.starts_with("jdbc:ch")) && lower.contains("://")
}

fn is_mysql_jdbc(input: &str) -> bool {
    let lower = input.to_lowercase();
    (lower.starts_with("jdbc:mysql") || lower.starts_with("jdbc:mariadb")) && lower.contains("://")
}

fn is_mariadb_jdbc(input: &str) -> bool {
    let lower = input.to_lowercase();
    lower.starts_with("jdbc:mariadb") && lower.contains("://")
}

fn is_questdb_config(input: &str) -> bool {
    ["http::", "https::", "tcp::", "tcps::"]
        .iter()
        .any(|prefix| starts_ci(input, prefix))
}

fn is_s3_http_url(input: &str) -> bool {
    if !(starts_ci(input, "http://") || starts_ci(input, "https://")) {
        return false;
    }
    parse_hierarchical(input).ok().is_some_and(|parts| {
        let host = parts.host.to_lowercase();
        let parsed = parse_s3_host(&host);
        !parsed.0.is_empty() || host.starts_with("s3.")
    })
}

fn format_host(host: &str) -> String {
    let value = host.to_lowercase();
    if value.contains(':') && !value.starts_with('[') {
        format!("[{}]", value)
    } else {
        value
    }
}

fn format_port(
    port: Option<&Value>,
    definition: &Definition,
    options: &CanonicalizeOptions,
) -> String {
    let Some(numeric) = port.and_then(Value::as_i64) else {
        return String::new();
    };
    if !options.include_default_port && Some(numeric) == default_port(&definition.defaults) {
        String::new()
    } else {
        format!(":{}", numeric)
    }
}
