# Connparse v1 Reference

This document lists the v1 keys used by Connparse addresses, parse results,
diagnostics, CPDS definitions, built-in adapters, and fixtures.

## Parse Result

`parse(input, options?)` returns:

```ts
type ParseResult = {
  ok: boolean;
  value: ConnparseAddress | null;
  errors: ConnparseDiagnostic[];
  warnings: ConnparseDiagnostic[];
};
```

Keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `ok` | `boolean` | `true` when parsing and validation completed without errors. |
| `value` | `ConnparseAddress \| null` | Normalized address when `ok` is true; `null` when there are errors. |
| `errors` | `ConnparseDiagnostic[]` | Blocking parse or validation failures. |
| `warnings` | `ConnparseDiagnostic[]` | Non-blocking issues, such as unknown query parameters in permissive mode. |

## Connparse Address

Every successful parse returns exactly this top-level shape:

```ts
type ConnparseAddress = {
  scheme: string;
  type: ConnparseType;
  authority: Record<string, unknown>;
  resource: ConnparseResource;
  path: string;
  query: Record<string, string | string[]>;
  fragment: string | null;
  credentials: Record<string, string>;
  options: Record<string, unknown>;
  raw: string;
  safe: string;
};
```

Top-level keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `scheme` | `string` | Normalized scheme used for the parsed address, such as `postgres`, `s3`, or `file`. |
| `type` | `ConnparseType` | High-level source class. |
| `authority` | `object` | Where the source lives, such as host, port, bucket, or region. |
| `resource` | `object` | Primary logical container, such as database, bucket, dataset, or topic. |
| `path` | `string` | Deeper hierarchy inside the resource, such as object key, file path, collection, or object path. |
| `query` | `object` | Parsed query parameters. Repeated parameters become arrays. |
| `fragment` | `string \| null` | URI fragment without `#`, when present. |
| `credentials` | `object` | Sensitive credentials extracted from the input. Do not log this by default. |
| `options` | `object` | Derived normalized flags or adapter-specific metadata. |
| `raw` | `string` | Original input string, unmodified. |
| `safe` | `string` | Redacted string intended for logs and UI. |

Allowed `type` values:

| Value | Meaning |
| --- | --- |
| `database` | Database or database-like source. |
| `object_storage` | Object storage source. |
| `file` | Local or remote filesystem-style source. |
| `stream` | Streaming system. Reserved for definitions and future built-ins. |
| `cache` | Cache or key-value source. |
| `analytics` | Analytics warehouse or analytical service. |
| `api` | Generic API-backed source. |
| `unknown` | Source parsed without a registered definition. |

## Authority Keys

`authority` is provider-dependent. These are the v1 keys used or reserved by the
model:

| Key | Type | Used by | Meaning |
| --- | --- | --- | --- |
| `host` | `string` | Most network providers | Primary host for single-endpoint addresses. |
| `port` | `number \| null` | Most network providers | Primary port, with defaults applied where configured. |
| `hosts` | `{ host: string; port: number \| null }[]` | Multi-host providers | Multi-host list when the input contains more than one host. |
| `bucket` | `string` | S3 | Object storage bucket name. |
| `region` | `string` | S3 | Region parsed from virtual-host URLs or query/default data. |
| `project` | `string` | Reserved | Project identifier for future analytics/cloud definitions. |
| `cluster` | `string` | Reserved | Cluster identifier for future distributed systems. |

Provider notes:

- Multi-host URLs populate `authority.hosts` and omit top-level
  `authority.host` and `authority.port` to avoid duplicating endpoint state.
- MongoDB SRV URLs set `authority.port` to `null`; SRV resolution is not
  performed.
- S3 stores the bucket in both `authority.bucket` and `resource.name`.

## Resource Keys

`resource` has a stable shape:

```ts
type ConnparseResource = {
  type: string;
  name: string | null;
};
```

Keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `type` | `string` | Logical resource kind, such as `database`, `bucket`, `database_index`, `collection`, `endpoint`, or `none`. |
| `name` | `string \| null` | Logical resource name, if one exists. |

Current built-in resource types:

| Value | Used by | Meaning |
| --- | --- | --- |
| `database` | SQL/document/file-backed databases | Database name or file-backed database identifier. |
| `database_index` | Redis | Redis database index from the path. |
| `endpoint` | QuestDB ILP config strings | Network ingestion endpoint. |
| `index` | Elasticsearch | Elasticsearch index name parsed from the first path segment. |
| `bucket` | S3 | Object storage bucket. |
| `none` | File | No logical resource container. |

## Query Keys

`query` contains parsed URI query parameters:

```ts
type QueryValue = string | string[];
```

Rules:

- Query values are strings.
- Repeated query parameters become arrays.
- Known query parameters are declared by CPDS definitions.
- Unknown query parameters are warnings by default.
- Unknown query parameters are errors when `strict: true`.

Examples:

```json
{
  "sslmode": "require"
}
```

```json
{
  "tag": ["a", "b"]
}
```

Current built-in query parameters:

| Provider | Keys |
| --- | --- |
| Postgres | `sslmode`, `target_session_attrs`, `application_name`, `connect_timeout`, `options`, SSL certificate keys |
| MySQL | `auth-method`, `get-server-public-key`, `ssl-mode`, `ssl-*`, `charset`, `tls-version` |
| MariaDB | `sslMode`, `user`, `password` |
| MongoDB | `authSource`, `authMechanism`, `connectTimeoutMS`, `directConnection`, `replicaSet`, `retryWrites`, `serverSelectionTimeoutMS`, `tls*`, `ssl`, `w` |
| Redis | `protocol`; StackExchange.Redis config values are placed in `options` when parsed with `provider: 'redis'` |
| ClickHouse | `database`, `ssl`, `sslmode`, `readonly`, `debug`, `createDatabaseIfNotExist` |
| Elasticsearch | `api_key`, `apiKey`, `token` |
| CockroachDB | `application_name`, `options`, `password`, `results_buffer_size`, `sslmode`, SSL certificate keys |
| QuestDB | `auto_flush`, `auto_flush_rows`, `protocol_version`, `retry_timeout`, `tls_verify`, buffer/timeout keys |
| YugabyteDB | `loadBalance`, `ssl`, `sslmode`, `sslrootcert`, `topologyKeys`, `ybServersRefreshInterval` |
| S3 | `versionId`, `region` |
| SQLite | `mode`, `cache` |
| File | none |

## Credential Keys

`credentials` contains sensitive extracted values.

| Key | Type | Meaning |
| --- | --- | --- |
| `username` | `string` | Username or user identifier from URI user info. |
| `password` | `string` | Password from URI user info. |
| `api_key` | `string` | API key from provider-specific query/config fields. |
| `access_key` | `string` | Reserved for providers that encode access keys. |
| `secret_key` | `string` | Reserved for providers that encode secret keys. |
| `token` | `string` | Reserved for providers that encode tokens. |

Security rules:

- Do not log `credentials` by default.
- Use `safe` or `mask(input)` for logs and UI.
- `safe` redacts URI passwords and known sensitive query parameters.

## Options Keys

`options` contains derived flags and adapter metadata.

Current built-in keys:

| Key | Type | Used by | Meaning |
| --- | --- | --- | --- |
| `srv` | `boolean` | MongoDB | `true` for `mongodb+srv` inputs. |
| `tls` | `boolean` | Redis, Memcached, Elasticsearch, QuestDB | Derived TLS flag. |
| `jdbc` | `boolean` | JDBC-backed adapters | `true` when the input was a JDBC URL. |
| `mode` | `string` | MariaDB JDBC | Failover/load-balancing mode such as `sequential`. |
| `protocol` | `string` | ClickHouse, Elasticsearch, QuestDB | Transport protocol such as `http`, `https`, `tcp`, or `native`. |
| `conninfo` | `boolean` | PostgreSQL-compatible adapters | `true` when a keyword/value conninfo string was parsed. |
| `compatible_with` | `string` | CockroachDB, QuestDB, YugabyteDB | Compatibility family, currently `postgres`. |
| `ingestion` | `boolean` | QuestDB | `true` for QuestDB ILP ingestion config strings. |
| `source_scheme` | `string` | S3 HTTPS URLs | Original source scheme, such as `https`, when normalized to `s3`. |
| `memory` | `boolean` | SQLite, DuckDB | `true` for in-memory databases. |

Definitions and future adapters may add additional option keys.

## Diagnostics

Diagnostics have this shape:

```ts
type ConnparseDiagnostic = {
  code: string;
  message: string;
  path?: string;
};
```

Keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `code` | `string` | Stable-ish diagnostic code. |
| `message` | `string` | Human-readable explanation. |
| `path` | `string` | Optional dotted path to the relevant field. |

Current diagnostic codes:

| Code | Meaning |
| --- | --- |
| `INVALID_INPUT_TYPE` | Input was not a string. |
| `EMPTY_INPUT` | Input was an empty string. |
| `MISSING_SCHEME` | Input had no URI scheme and did not look like a file path. |
| `UNKNOWN_SCHEME` | No registered definition matched the scheme. |
| `INVALID_URL` | Unknown-scheme fallback could not parse the input as a URL. |
| `UNKNOWN_ADAPTER` | A definition referenced an adapter that is not registered. |
| `PARSE_FAILED` | Adapter parsing failed. |
| `MISSING_HOST` | Definition requires a host but none was parsed. |
| `MISSING_RESOURCE` | Definition requires a resource but none was parsed. |
| `MISSING_PATH` | Definition requires a path but none was parsed. |
| `INVALID_PORT` | Port is outside the configured allowed range. |
| `UNKNOWN_QUERY_PARAMETER` | Query parameter is not declared in the matched definition. |
| `INVALID_QUERY_PARAMETER_TYPE` | Query parameter value does not match the declared type. |
| `INVALID_QUERY_PARAMETER_VALUE` | Query parameter value is not in the declared allowed list. |

## Parse Options

```ts
type ParseOptions = {
  definitions?: ConnparseDefinition[];
  provider?: string;
  strict?: boolean;
};
```

Keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `definitions` | `ConnparseDefinition[]` | Extra CPDS definitions merged with built-ins for this parse call. |
| `provider` | `string` | Forces parsing with a provider definition for ambiguous strings, such as plain HTTP URLs or keyword/value conninfo. |
| `strict` | `boolean` | Turns unknown query parameter warnings into errors. |

Custom definitions are merged after built-ins. If a custom definition uses an
existing scheme, that scheme resolves to the custom definition for the parse
call.

## CPDS Definition Keys

Connparse Definition Files are JSON or YAML.

Top-level keys:

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable definition identifier. |
| `name` | `string` | no | Human-readable provider name. |
| `type` | `ConnparseType` | yes | High-level source type assigned to parsed addresses. |
| `schemes` | `string[]` | yes | URI schemes handled by this definition. |
| `adapter` | `string` | no | Parser adapter. Defaults to `generic-uri`. |
| `defaults` | `object` | no | Default values applied by adapters, currently mainly `port`. |
| `authority` | `object` | no | Declares authority fields used by the source. |
| `resource` | `object` | no | Declares resource type and whether it is required. |
| `path` | `object` | no | Declares path type and whether it is required. |
| `credentials` | `object` | no | Declares supported credential fields. |
| `query_parameters` | `object` | no | Declares allowed/typed query parameters. |
| `validation` | `object` | no | Declares validation rules. |

### `adapter`

Built-in adapter names:

| Adapter | Meaning |
| --- | --- |
| `generic-uri` | Standard hierarchical URI parser for host/resource/path style addresses. |
| `postgres-compatible` | PostgreSQL URI, JDBC, and keyword/value conninfo parser. |
| `mysql-compatible` | MySQL/MariaDB URI-like parser with JDBC support. |
| `jdbc` | Shared JDBC URL parser for supported JDBC providers. |
| `clickhouse` | ClickHouse URI/JDBC/HTTP parser. |
| `duckdb` | DuckDB path, URI, and memory parser. |
| `elasticsearch` | Elasticsearch explicit scheme and provider-hinted HTTP(S) parser. |
| `memcached` | Memcached URI and provider-hinted host-list parser. |
| `mongodb` | MongoDB parser with SRV and multi-host handling. |
| `questdb` | QuestDB ILP config string and PostgreSQL-wire parser. |
| `redis` | Redis URL and provider-hinted StackExchange.Redis parser. |
| `s3` | S3 URI and common S3 HTTPS URL parser. |
| `file` | File URI and local path parser. |
| `sqlite` | SQLite file and memory database parser. |

### `defaults`

Current keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `port` | `number` | Default port applied when no port is present. |

### `authority`

Declaration keys currently used by built-ins:

| Key | Type | Meaning |
| --- | --- | --- |
| `host` | `boolean` | Source uses a host. |
| `port` | `boolean` | Source uses a port. |
| `multi_host` | `boolean` | Source may include multiple hosts. |
| `bucket` | `boolean` | Source uses an object storage bucket. |
| `region` | `boolean` | Source uses a region. |

### `resource`

Keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `type` | `string` | Resource kind assigned to `resource.type`. |
| `required` | `boolean` | Whether `resource.name` is required. |

### `path`

Keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `type` | `string` | Path kind, such as `object_path`, `object_key`, `filesystem_path`, `collection`, or `none`. |
| `required` | `boolean` | Whether `path` must be non-empty. |

### `credentials`

Common declaration keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `username` | `boolean` | Source accepts username in URI user info. |
| `password` | `boolean` | Source accepts password in URI user info. |
| `access_key` | `boolean` | Source accepts access key. |
| `secret_key` | `boolean` | Source accepts secret key. |
| `token` | `boolean` | Source accepts token. |

### `query_parameters`

Each query parameter is declared by name:

```yaml
query_parameters:
  sslmode:
    type: string
    allowed: [disable, require, verify-full]
```

Rule keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `type` | `string` | `string`, `boolean`, or `number`. |
| `allowed` | `string[]` | Optional allowed values. |

### `validation`

Keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `require_host` | `boolean` | Requires either `authority.host` or `authority.hosts`. |
| `port_range` | `{ min: number; max: number }` | Validates parsed ports. |

## Fixture Format

Fixtures live in `specs/fixtures/v1.json`.

They are used by tests today, but their larger purpose is to be the portable
compatibility contract for Connparse implementations. A Go or Rust
implementation should be able to run the same fixture file and produce the same
observable fields.

Fixture keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Human-readable test case name. |
| `input` | `string` | Raw address string passed to `parse`. |
| `expected` | `Record<string, unknown>` | Dotted-path assertions against the parsed `ConnparseAddress`. |

Example:

```json
{
  "name": "postgres basic auth",
  "input": "postgres://user:pass@localhost:5432/app?sslmode=require",
  "expected": {
    "authority.host": "localhost",
    "resource.name": "app",
    "safe": "postgres://user:***@localhost:5432/app?sslmode=require"
  }
}
```

The fixture format intentionally asserts selected fields instead of requiring a
full object snapshot. That keeps fixtures readable while still locking down the
important behavior for each address format.
