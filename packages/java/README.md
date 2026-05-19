# connparse for Java

Connparse parses connection strings from databases, caches, object storage,
files, and cloud systems into one structured object.

It supports PostgreSQL, MySQL, MariaDB, SQLite, DuckDB, ClickHouse, Redis,
Memcached, Elasticsearch, MongoDB, CockroachDB, QuestDB, YugabyteDB, TiDB,
Valkey, Dragonfly, OpenSearch, FerretDB, ElastiCache, DocumentDB, SQL Server,
Oracle, Snowflake, Cassandra, BigQuery, Redshift, Aurora, Neo4j, Trino,
Databricks, DynamoDB, StarRocks, SAP HANA, Athena, Spanner, Google Cloud
Storage, Azure Blob, Azure Data Lake Storage, Azure Files, Azure Cosmos DB,
Business Central, TallyPrime, Amazon S3, and local file paths.

CPDS means Connparse Definition Specification. The Java package embeds generated
definitions from the shared CPDS YAML files in `specs/definitions`.

## Usage

Maven:

```xml
<dependency>
  <groupId>com.clidey</groupId>
  <artifactId>connparse</artifactId>
  <version>0.3.0</version>
</dependency>
```

```java
import com.clidey.connparse.Connparse;
import com.clidey.connparse.ParseOptions;
import com.clidey.connparse.ParseResult;

ParseResult result = Connparse.parse(
    "postgres://user:pass@localhost:5432/app?sslmode=require"
);

if (!result.ok) {
    System.err.println(result.errors);
} else {
    System.out.println(result.value.safe);
    System.out.println(result.value.resource.name);
}
```

The parsed value contains the same top-level fields as the other packages:

```json
{
  "scheme": "postgres",
  "type": "database",
  "authority": { "host": "localhost", "port": 5432 },
  "resource": { "type": "database", "name": "app" },
  "path": "",
  "query": { "sslmode": "require" },
  "fragment": null,
  "credentials": { "username": "user", "password": "pass" },
  "options": {},
  "raw": "postgres://user:pass@localhost:5432/app?sslmode=require",
  "safe": "postgres://user:***@localhost:5432/app?sslmode=require"
}
```

## Provider Hints

Some inputs need a provider because the string itself does not identify one:

```java
ParseResult result = Connparse.parse(
    "host=db.example.com dbname=app user=alice",
    new ParseOptions().withProvider("postgres")
);
```

## Strict Mode

By default, unknown query parameters become warnings. Strict mode rejects them:

```java
ParseResult result = Connparse.parse(
    "postgres://localhost/app?unexpected=1",
    new ParseOptions().withStrict(true)
);
```

## Development

From the repository root:

```bash
pnpm test:java
pnpm check:java
pnpm generate:definitions
```
