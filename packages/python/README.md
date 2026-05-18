# connparse

Connparse parses database connection strings, DSNs, URLs, file paths, and cloud
storage URIs into one predictable Python dict.

Connparse is useful when your app accepts connection strings from different
systems and you want to pull out the host, port, database, bucket, path,
credentials, query options, and a safe redacted string.

Supported sources include PostgreSQL, MySQL, MariaDB, SQLite, DuckDB,
ClickHouse, Redis, Memcached, Elasticsearch, MongoDB, CockroachDB, QuestDB,
YugabyteDB, Amazon S3, and local file paths.

## Install

```bash
pip install connparse
```

## Basic Usage

```py
from connparse import parse

result = parse("postgres://user:pass@localhost:5432/app?sslmode=require")

if not result["ok"]:
    print(result["errors"])
else:
    print(result["value"])
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

```py
result = parse(input)

if result["ok"]:
    address = result["value"]
    save_connection(
        host=address["authority"].get("host"),
        port=address["authority"].get("port"),
        database=address["resource"]["name"],
        safe_label=address["safe"],
    )
```

Use `safe` for logs and UI labels. Do not log `raw` or `credentials` unless the
user explicitly asks to reveal secrets.

```py
logger.info("connection=%s", result["value"]["safe"])
```

Use `parse_normalize()` when you need a stable identity for dedupe, cache keys,
or config comparison.

```py
from connparse import parse_normalize

parse_normalize("postgresql://LOCALHOST:5432/app?sslmode=require")["value"]["canonical"]
# "postgres://localhost/app?sslmode=require"
```

Use `provider` when the string does not clearly identify the source type.

```py
parse("host=db.example.com port=5432 dbname=app user=alice", {
    "provider": "postgres",
})

parse("https://clickhouse.example.com:8443/default", {
    "provider": "clickhouse",
})
```

Use `strict` when you want unknown query parameters to fail validation.

```py
parse("postgres://localhost/app?unexpected=1", {"strict": True})
```

## Examples

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
