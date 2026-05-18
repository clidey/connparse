// Package connparse parses database connection strings, DSNs, URLs, file paths,
// and cloud storage URIs into a safe structured result.
//
// Connparse supports PostgreSQL, MySQL, MariaDB, SQLite, DuckDB, ClickHouse,
// Redis, Memcached, Elasticsearch, MongoDB, CockroachDB, QuestDB, YugabyteDB,
// TiDB, Valkey, Dragonfly, OpenSearch, FerretDB, ElastiCache, DocumentDB,
// SQL Server, Oracle, Snowflake, Cassandra, BigQuery, Redshift, Aurora, Neo4j,
// Trino, Databricks, DynamoDB, StarRocks, SAP HANA, Athena, Spanner, Google
// Cloud Storage, Azure Blob, Azure Data Lake Storage, Azure Files, Azure Cosmos
// DB, Business Central, TallyPrime, Amazon S3, and local file paths. It extracts
// common fields such as host,
// port, database, bucket, path, credentials, query options, and a redacted Safe
// value for logs or UI labels.
//
// Use Parse when you need the faithful parsed address. Use ParseNormalize,
// Canonicalize, or Equivalent when you need stable comparison keys for dedupe,
// caching, or configuration drift checks.
package connparse
