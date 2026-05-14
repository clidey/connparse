# Connparse v1 Provider Formats

This document records the connection-string formats included for the v1 target
providers. It also calls out formats that are common in docs but are ambiguous
without a provider hint.

## Provider Hints

Some common connection strings are not self-identifying:

- `https://host:9200` could be Elasticsearch, ClickHouse HTTP, or a generic API.
- `host=localhost dbname=app user=me` is a PostgreSQL/libpq-style conninfo
  string, but it has no URI scheme.
- `localhost:6379,password=secret` is a StackExchange.Redis configuration
  string, but it has no URI scheme.

For these, use:

```js
parse(input, { provider: 'postgres' });
parse(input, { provider: 'clickhouse' });
parse(input, { provider: 'elasticsearch' });
```

Self-identifying strings still parse without a provider hint.

## Included Formats

| Provider | Included formats | Notes |
| --- | --- | --- |
| PostgreSQL | `postgres://`, `postgresql://`, `jdbc:postgresql://`, libpq keyword/value conninfo with `provider: 'postgres'` | Multi-host URI support is included. |
| MySQL | `mysql://`, `mysqlx://`, `mysqlx+srv://`, `jdbc:mysql://`, schemeless MySQL URI-like strings with `provider: 'mysql'` | MySQL key-value object syntax is documented but not included yet. |
| MariaDB | `mariadb://`, `jdbc:mariadb://`, `jdbc:mariadb:<mode>://` | JDBC failover/load-balancing modes are represented in `options.mode`. |
| SQLite | `sqlite:`, `sqlite://`, `sqlite::memory:`, SQLite `file:` URI filenames with `provider: 'sqlite'` | Bare `file:` defaults to the file adapter unless a SQLite provider hint is passed. |
| DuckDB | `duckdb:`, `duckdb://`, `duckdb::memory:`, bare `.duckdb` and `.ddb` paths | Bare `.db` is not inferred as DuckDB because it is ambiguous with SQLite and other file-backed databases. |
| ClickHouse | `jdbc:clickhouse:<protocol>://`, `jdbc:ch:<protocol>://`, `clickhouse://`, `ch://`, plain HTTP(S) URL with `provider: 'clickhouse'` | Plain HTTP(S) is provider-hinted only because it is ambiguous. |
| Memcached | `memcached://`, `memcacheds://`, host lists with `provider: 'memcached'` | No official universal memcached connection-string format was found; this is a Connparse URI convention plus host/port support. |
| Redis | `redis://`, `rediss://`, StackExchange.Redis comma configuration with `provider: 'redis'` | Redis Cluster root-node arrays are API configuration, not a single connection string. |
| Elasticsearch | `elasticsearch://`, `elasticsearch+http://`, `elasticsearch+https://`, plain HTTP(S) URL with `provider: 'elasticsearch'` | Elastic Cloud ID configuration is not a URL and is not included yet. |
| MongoDB | `mongodb://`, `mongodb+srv://` | Standard and SRV connection strings are included. |
| CockroachDB | `cockroach://`, `cockroachdb://`, PostgreSQL URL/conninfo with `provider: 'cockroachdb'` | Official CockroachDB URLs are PostgreSQL URLs, so provider hints are needed to classify them as CockroachDB. |
| QuestDB | QuestDB ILP config strings like `http::addr=host:9000;`, `https::`, `tcp::`, `tcps::`, plus `questdb://` for PostgreSQL-wire connections | The supplied QuestDB doc is for ingestion clients; SQL connections are PostgreSQL-compatible and use `questdb://` as the Connparse self-identifying form. |
| YugabyteDB | `yugabyte://`, `yugabytedb://`, PostgreSQL URL/conninfo with `provider: 'yugabytedb'` | Official YSQL URLs are PostgreSQL-compatible, so provider hints are needed to classify them as YugabyteDB. |

## Excluded or Deferred Formats

| Provider | Format | Reason |
| --- | --- | --- |
| MySQL | JSON-like key/value pairs such as `{user:'myuser', host:'example.com'}` | Common in MySQL Shell/X DevAPI docs, but not a connection string shape Connparse can classify without a broader object parser. |
| Elasticsearch | Elastic Cloud ID plus API key object config | Official clients expose this as structured client configuration rather than a URL. Needs a dedicated model if included later. |
| ClickHouse | Plain HTTP(S) URL without `provider: 'clickhouse'` | Ambiguous with Elasticsearch and generic APIs. |
| Elasticsearch | Plain HTTP(S) URL without `provider: 'elasticsearch'` | Ambiguous with ClickHouse and generic APIs. |
| Memcached | Official universal connection-string syntax | No official universal syntax found; official/server docs describe host/port endpoints and client libraries vary. |
| S3 and file paths | Existing helper support | Not part of the requested v1 provider target for now. |

## Source Notes

- PostgreSQL docs define URI syntax as `postgresql://[userspec@][hostspec][/dbname][?paramspec]`, allow `postgresql://` and `postgres://`, and document keyword/value connection strings.
- MySQL docs cover URI-like strings, optional schemes, `mysql`, `mysqlx`, `mysqlx+srv`, and key-value pairs.
- MariaDB official Connector/J docs cover `jdbc:mariadb:` URLs, multi-host descriptions, and failover/load-balancing modes.
- SQLite docs cover filenames, `file:` URI filenames, `:memory:`, URI query parameters, and the rule that non-empty authorities must be `localhost`.
- Redis Node docs cover `redis[s]://[[username][:password]@][host][:port][/db-number]`; StackExchange.Redis docs cover comma-separated configuration.
- MongoDB docs cover standard `mongodb://` and SRV `mongodb+srv://` strings.
- DuckDB docs emphasize connecting by database file path or in-memory database.
- ClickHouse docs cover JDBC URLs and JavaScript client `url` settings.
- QuestDB docs cover ILP configuration strings with `<protocol>::<key>=<value>;...;`.
- CockroachDB docs state that most clients use PostgreSQL connection URLs and document Cockroach-specific defaults/options.
- YugabyteDB docs state that YSQL is PostgreSQL-compatible and show PostgreSQL connection strings, including smart-driver parameters.
