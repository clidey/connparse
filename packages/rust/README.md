# connparse

Connparse parses database connection strings, DSNs, URLs, file paths, and cloud
storage URIs into one predictable Rust value.

Connparse is useful when your app accepts connection strings from different
systems and you want to pull out the host, port, database, bucket, path,
credentials, query options, and a safe redacted string.

Supported sources include PostgreSQL, MySQL, MariaDB, SQLite, DuckDB,
ClickHouse, Redis, Memcached, Elasticsearch, MongoDB, CockroachDB, QuestDB,
YugabyteDB, TiDB, Valkey, Dragonfly, OpenSearch, FerretDB, ElastiCache,
DocumentDB, SQL Server, Oracle, Snowflake, Cassandra, BigQuery, Redshift,
Aurora, Neo4j, Trino, Databricks, DynamoDB, StarRocks, SAP HANA, Athena,
Spanner, Google Cloud Storage, Azure Blob, Azure Data Lake Storage, Azure Files,
Azure Cosmos DB, Business Central, TallyPrime, Amazon S3, and local file paths.

## Install

```toml
[dependencies]
connparse = "0.3"
```

## Basic Usage

```rust
use connparse::parse;

fn main() {
    let result = parse("postgres://user:pass@localhost:5432/app?sslmode=require", None);

    if !result.ok {
        eprintln!("{:?}", result.errors);
        return;
    }

    let address = result.value.unwrap();
    println!("{}", address.safe);
}
```

`parse()` returns the same JSON-shaped result contract as the JavaScript, Go,
and Python packages:

```json
{
  "ok": true,
  "value": {
    "scheme": "postgres",
    "type": "database",
    "authority": {
      "host": "localhost",
      "port": 5432
    },
    "resource": {
      "type": "database",
      "name": "app"
    },
    "path": "",
    "query": {
      "sslmode": "require"
    },
    "fragment": null,
    "credentials": {
      "username": "user",
      "password": "pass"
    },
    "options": {},
    "raw": "postgres://user:pass@localhost:5432/app?sslmode=require",
    "safe": "postgres://user:***@localhost:5432/app?sslmode=require"
  },
  "errors": [],
  "warnings": []
}
```

Use `safe` for logs and UI labels. Do not log `raw` or `credentials` unless the
user explicitly asks to reveal secrets.

For stable comparison keys, use `parse_normalize()`:

```rust
use connparse::parse_normalize;

let result = parse_normalize("postgresql://LOCALHOST:5432/app?sslmode=require", None);
assert_eq!(
    result.value.unwrap().canonical,
    "postgres://localhost/app?sslmode=require"
);
```
