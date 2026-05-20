# @clidey/connparse

Connparse parses database connection strings, DSNs, URLs, file paths, and cloud
storage URIs into one predictable JavaScript object.

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

```bash
npm install @clidey/connparse
```

## Basic Usage

```ts
import { parse } from '@clidey/connparse';

const result = parse('postgres://user:pass@localhost:5432/app?sslmode=require');

if (!result.ok) {
  console.error(result.errors);
  process.exit(1);
}

console.log(result.value);
```

Result:

```json
{
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
}
```

## Recommended Usage

Use `parse()` for form handling, validation, and showing parsed connection
details to users.

```ts
const result = parse(input);

if (result.ok) {
  saveConnection({
    host: result.value.authority.host,
    port: result.value.authority.port,
    database: result.value.resource.name,
    safeLabel: result.value.safe
  });
}
```

Use `safe` for logs and UI labels. Do not log `raw` or `credentials` unless the
user explicitly asks to reveal secrets.

```ts
logger.info({ connection: result.value.safe });
```

Use `parseNormalize()` when you need a stable identity for dedupe, cache keys,
or config comparison. It also returns provider-normalized semantic fields for
consumers that want stable form values instead of provider-specific query keys.

```ts
import { parseNormalize } from '@clidey/connparse';

const result = parseNormalize('postgresql://LOCALHOST:5432/app?sslmode=require&search_path=tenant_a');

result.value.canonical;
// "postgres://localhost/app?search_path=tenant_a&sslmode=require"

result.value.semantic;
// {
//   provider: 'postgres',
//   fields: { ssl_mode: 'required', search_path: 'tenant_a' },
//   consumed: { query: ['search_path', 'sslmode'] }
// }
```

Use `provider` when the string does not clearly identify the source type.

```ts
parse('host=db.example.com port=5432 dbname=app user=alice', {
  provider: 'postgres'
});

parse('https://clickhouse.example.com:8443/default', {
  provider: 'clickhouse'
});
```

Use `strict: true` when you want unknown query parameters to fail validation.

```ts
parse('postgres://localhost/app?unexpected=1', { strict: true });
```

## Examples

Each example below shows the kind of data Connparse extracts. The full result
always has the same top-level shape: `scheme`, `type`, `authority`, `resource`,
`path`, `query`, `fragment`, `credentials`, `options`, `raw`, and `safe`.

| Source | Input | Parsed result |
| --- | --- | --- |
| PostgreSQL | `postgres://user:pass@localhost:5432/app?sslmode=require` | `authority.host = "localhost"`, `authority.port = 5432`, `resource.name = "app"`, `query.sslmode = "require"` |
| MySQL | `mysql://root:secret@127.0.0.1/shop?charset=utf8mb4` | `authority.host = "127.0.0.1"`, `authority.port = 3306`, `resource.name = "shop"`, `query.charset = "utf8mb4"` |
| MariaDB | `mariadb://root:secret@mariadb.example.com:3306/app` | `authority.host = "mariadb.example.com"`, `authority.port = 3306`, `resource.name = "app"` |
| SQLite | `sqlite::memory:` | `scheme = "sqlite"`, `resource.name = ":memory:"`, `path = ":memory:"`, `options.memory = true` |
| DuckDB | `duckdb:///tmp/analytics.duckdb?access_mode=read_only` | `scheme = "duckdb"`, `path = "/tmp/analytics.duckdb"`, `query.access_mode = "read_only"` |
| ClickHouse | `jdbc:clickhouse:http://localhost:8123/analytics?ssl=false` | `authority.host = "localhost"`, `authority.port = 8123`, `resource.name = "analytics"`, `options.protocol = "http"` |
| Memcached | `memcached://cache.example.com` | `authority.host = "cache.example.com"`, `authority.port = 11211`, `type = "cache"` |
| Redis | `rediss://:pass@cache.example.com/0` | `authority.host = "cache.example.com"`, `authority.port = 6379`, `resource.name = "0"`, `options.tls = true` |
| Elasticsearch | `elasticsearch+https://elastic:secret@es.example.com:9243/logs?api_key=abc` | `authority.host = "es.example.com"`, `authority.port = 9243`, `resource.name = "logs"`, `credentials.api_key = "abc"` |
| MongoDB | `mongodb+srv://user:pass@cluster.mongodb.net/app?retryWrites=true` | `authority.host = "cluster.mongodb.net"`, `resource.name = "app"`, `query.retryWrites = "true"`, `options.srv = true` |
| CockroachDB | `cockroach://root@servername:26257/mydb?sslmode=disable` | `authority.host = "servername"`, `authority.port = 26257`, `resource.name = "mydb"`, `options.compatible_with = "postgres"` |
| QuestDB | `https::addr=questdb.example.com:9000;username=admin;password=quest;auto_flush_rows=5000;` | `authority.host = "questdb.example.com"`, `authority.port = 9000`, `query.auto_flush_rows = "5000"`, `options.ingestion = true` |
| YugabyteDB | `yugabyte://yugabyte:yugabyte@localhost:5433/yugabyte?loadBalance=any` | `authority.host = "localhost"`, `authority.port = 5433`, `resource.name = "yugabyte"`, `query.loadBalance = "any"` |
| S3 | `s3://my-bucket/path/to/file.csv?versionId=123` | `authority.bucket = "my-bucket"`, `resource.name = "my-bucket"`, `path = "path/to/file.csv"` |
| File | `file:///tmp/data.csv#header` | `scheme = "file"`, `path = "/tmp/data.csv"`, `fragment = "header"` |

## Multi-Host Example

```ts
parse('postgresql://host1:123,host2:456/somedb?target_session_attrs=any');
```

Result:

```json
{
  "authority": {
    "hosts": [
      { "host": "host1", "port": 123 },
      { "host": "host2", "port": 456 }
    ]
  },
  "resource": {
    "type": "database",
    "name": "somedb"
  },
  "query": {
    "target_session_attrs": "any"
  }
}
```

For multi-host strings, Connparse uses `authority.hosts` instead of duplicating
the first host into `authority.host`.

## CLI

```bash
npx @clidey/connparse 'postgres://user:pass@localhost/app'
```

By default the CLI redacts secrets. Use `--include-secrets` only when you really
need the raw credentials in the output.
