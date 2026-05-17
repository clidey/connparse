# Connparse v1 Scope

This document tracks the provider set intended for Connparse v1 and the work
needed to make each provider release-ready.

## V1 Provider Set

The v1 target providers are:

- PostgreSQL
- MySQL
- MariaDB
- SQLite
- DuckDB
- ClickHouse
- Memcached
- Redis
- Elasticsearch
- MongoDB
- CockroachDB
- QuestDB
- YugabyteDB
- Amazon S3
- File paths

## Support Matrix

| Provider | Status | Likely v1 approach |
| --- | --- | --- |
| PostgreSQL | Implemented | URI, JDBC URL, multi-host URI, and provider-hinted libpq conninfo. |
| MySQL | Implemented | URI-like strings, MySQL X schemes, JDBC URL, and provider-hinted schemeless URI-like strings. |
| MariaDB | Implemented | MariaDB URI and Connector/J JDBC strings, including multi-host modes. |
| SQLite | Implemented | SQLite URI/file forms and in-memory databases. |
| DuckDB | Implemented | DuckDB URI forms, in-memory database, and `.duckdb`/`.ddb` paths. |
| ClickHouse | Implemented | JDBC URL, `clickhouse://`/`ch://`, and provider-hinted HTTP(S) URLs. |
| Memcached | Implemented with caveat | Connparse `memcached://` convention and provider-hinted host lists; no official universal connection-string syntax found. |
| Redis | Implemented | Redis URLs and provider-hinted StackExchange.Redis comma configuration. |
| Elasticsearch | Implemented with caveat | Connparse explicit schemes and provider-hinted HTTP(S) endpoint URLs; Elastic Cloud ID is deferred. |
| MongoDB | Implemented | Standard and SRV MongoDB connection strings. |
| CockroachDB | Implemented | Connparse explicit schemes and provider-hinted PostgreSQL-compatible URLs/conninfo. |
| QuestDB | Implemented | QuestDB ILP config strings and Connparse `questdb://` PostgreSQL-wire URLs. |
| YugabyteDB | Implemented | Connparse explicit schemes and provider-hinted PostgreSQL-compatible URLs/conninfo. |
| Amazon S3 | Implemented | `s3://` URIs and common S3 HTTPS virtual-host/path-style URLs. |
| File paths | Implemented | `file://` URIs and local relative/absolute paths. |

## Release-Ready Criteria

Each v1 provider should have:

- A built-in CPDS definition in `packages/js/src/builtin-definitions.js`.
- A YAML CPDS example in `specs/definitions/`.
- An adapter only when generic URI parsing is not enough.
- Valid fixtures in `specs/fixtures/v1.json`.
- Negative fixtures or focused tests for invalid values where validation is
  meaningful.
- Reference documentation for provider-specific authority, resource, query,
  credential, and option keys.
- Safe redaction behavior for credentials and CPDS-declared sensitive keys.

## Research Needed

For each provider, use official provider or official driver documentation to
classify the supported connection-string flavor:

- URI/URL
- JDBC URL
- DSN
- keyword-value string
- file path
- cloud-specific endpoint
- driver-specific options

V1 should prefer URI-style and file-style formats. JDBC, ODBC, and
keyword-value syntaxes can be added if they are central to a requested provider,
but they should be modeled as explicit adapter behavior rather than hidden in
generic URI parsing.

The current included/excluded format matrix is documented in
[v1-provider-formats.md](v1-provider-formats.md).

## Current Decisions

- Single-host addresses use `authority.host` and `authority.port`.
- Multi-host addresses use `authority.hosts` and omit top-level
  `authority.host` and `authority.port`.
- Unknown query parameters are warnings by default and errors in strict mode.
- Fixtures are the cross-implementation compatibility contract, not just local
  JavaScript test data.
