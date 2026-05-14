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

## Support Matrix

| Provider | Status | Likely v1 approach |
| --- | --- | --- |
| PostgreSQL | Implemented, needs deeper parameter coverage | `postgres://` and `postgresql://` URI support. Multi-host support is in scope. |
| MySQL | Implemented, needs deeper parameter coverage | `mysql://` URI support. |
| MariaDB | Implemented as MySQL-compatible scheme | `mariadb://` URI support using MySQL-compatible parsing unless docs show a separate grammar. |
| SQLite | Implemented, needs fixture expansion | `sqlite:` URLs, local database files, and `sqlite::memory:`. |
| DuckDB | Not implemented | Likely file-oriented adapter plus `duckdb:`/driver-specific URL handling after doc review. |
| ClickHouse | Not implemented | Likely URI-style adapter for native and/or HTTP connection URLs after doc review. |
| Memcached | Not implemented | Likely cache endpoint parser; may need multi-server support depending on documented formats. |
| Redis | Implemented, needs deeper parameter coverage | `redis://` and `rediss://` URI support. |
| Elasticsearch | Not implemented | Likely HTTP(S) endpoint parser with credentials and cloud/API-key handling after doc review. |
| MongoDB | Implemented, needs deeper parameter coverage | `mongodb://` and `mongodb+srv://` URI support. Multi-host and SRV are in scope. |
| CockroachDB | Not implemented | PostgreSQL-compatible URI parser with Cockroach-specific options and defaults after doc review. |
| QuestDB | Not implemented | Likely PostgreSQL-compatible endpoint plus QuestDB-specific connection formats after doc review. |
| YugabyteDB | Not implemented | PostgreSQL-compatible URI parser with Yugabyte-specific options and defaults after doc review. |

## Release-Ready Criteria

Each v1 provider should have:

- A built-in CPDS definition in `src/builtin-definitions.js`.
- A YAML CPDS example in `definitions/`.
- An adapter only when generic URI parsing is not enough.
- Valid fixtures in `fixtures/v1.json`.
- Negative fixtures or focused tests for invalid values where validation is
  meaningful.
- Reference documentation for provider-specific authority, resource, query,
  credential, and option keys.
- Safe redaction behavior for credentials and sensitive query parameters.

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

## Current Decisions

- Single-host addresses use `authority.host` and `authority.port`.
- Multi-host addresses use `authority.hosts` and omit top-level
  `authority.host` and `authority.port`.
- Unknown query parameters are warnings by default and errors in strict mode.
- Fixtures are the cross-implementation compatibility contract, not just local
  JavaScript test data.
