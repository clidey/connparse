# Connparse

Connparse is a definition-driven parser for data source connection strings and
addresses. It turns database URLs, object storage URIs, file paths, and similar
source identifiers into one safe, normalized object.

This repository currently contains the v1 JavaScript reference implementation
and the shared fixture format that future TypeScript, Go, Rust, or other
implementations can follow.

## Install

This package has one runtime dependency: `yaml`, used to load CPDS definition
files.

```bash
npm install connparse
```

For local development in this repo:

```bash
pnpm install
pnpm test
```

## Quick Start

```js
import { parse } from 'connparse';

const result = parse('postgres://user:pass@localhost:5432/app?sslmode=require');

if (!result.ok) {
  console.error(result.errors);
} else {
  console.log(result.value);
}
```

Output:

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

## Supported in v1

Current v1 target providers:

- PostgreSQL: `postgres`, `postgresql`
- MySQL: `mysql`, `mysqlx`, `mysqlx+srv`
- MariaDB: `mariadb`
- SQLite: `sqlite`
- DuckDB: `duckdb`
- ClickHouse: `clickhouse`, `ch`, `jdbc:clickhouse`, `jdbc:ch`
- Memcached: `memcached`, `memcacheds`
- Redis: `redis`, `rediss`
- Elasticsearch: `elasticsearch`, `elasticsearch+http`, `elasticsearch+https`
- MongoDB: `mongodb`, `mongodb+srv`
- CockroachDB: `cockroach`, `cockroachdb`
- QuestDB: `questdb`, plus ILP config strings such as `http::addr=localhost:9000;`
- YugabyteDB: `yugabyte`, `yugabytedb`
- Amazon S3: `s3`, plus common S3 HTTPS virtual-host/path-style URLs
- File paths: `file:///tmp/data.csv`, `/tmp/data.csv`, `./data.csv`

The target provider set for the first stable v1 release is tracked in
[docs/v1-scope.md](docs/v1-scope.md). The included/excluded connection-string
formats are tracked in [docs/v1-provider-formats.md](docs/v1-provider-formats.md).

## API

### `parse(input, options?)`

Returns a result object:

```ts
type ParseResult = {
  ok: boolean;
  value: ConnparseAddress | null;
  errors: ConnparseDiagnostic[];
  warnings: ConnparseDiagnostic[];
};
```

By default Connparse is permissive: unknown query parameters become warnings.
Use strict mode to turn them into errors:

```js
parse('postgres://localhost/app?unexpected=1', { strict: true });
```

Some common formats require a provider hint because they do not identify their
provider:

```js
parse('host=db.example.com dbname=app user=alice', { provider: 'postgres' });
parse('https://es.example.com:9200/logs', { provider: 'elasticsearch' });
parse('https://clickhouse.example.com:8443/default', { provider: 'clickhouse' });
```

### `parseOrThrow(input, options?)`

Returns a `ConnparseAddress` or throws an `Error`.

### `mask(input)`

Redacts credentials from a raw connection string:

```js
mask('mysql://root:secret@localhost/shop');
// mysql://root:***@localhost/shop
```

### `parseDefinition(input, format?)`

Loads a CPDS definition from JSON or YAML:

```js
import { parse, parseDefinition } from 'connparse';

const definition = parseDefinition(`
id: warehouse
name: Warehouse
type: analytics
schemes:
  - warehouse
adapter: generic-uri
authority:
  host: true
resource:
  type: database
  required: true
path:
  type: object_path
  required: false
query_parameters: {}
validation:
  require_host: true
`);

const result = parse('warehouse://example.com/main/schema', {
  definitions: [definition]
});
```

Custom definitions are merged with the built-ins. If a custom definition uses an
existing scheme, it overrides that scheme for the parse call.

## Connparse Address Shape

Every successful parse returns this top-level shape:

```ts
type ConnparseAddress = {
  scheme: string;
  type:
    | 'database'
    | 'object_storage'
    | 'file'
    | 'stream'
    | 'cache'
    | 'analytics'
    | 'api'
    | 'unknown';
  authority: Record<string, unknown>;
  resource: {
    type: string;
    name: string | null;
  };
  path: string;
  query: Record<string, string | string[]>;
  fragment: string | null;
  credentials: Record<string, string>;
  options: Record<string, unknown>;
  raw: string;
  safe: string;
};
```

Credentials are intentionally separated from `authority` and the `safe` field is
intended for logs and UI. Do not log `credentials` by default.

For the full list of v1 keys, provider-specific fields, diagnostics, CPDS keys,
adapter names, and fixture format, see [docs/reference.md](docs/reference.md).

## CPDS Definitions

Connparse Definition Files describe source-specific behavior without putting
all provider rules directly in the parser.

Example:

```yaml
id: postgres
name: PostgreSQL
type: database
schemes:
  - postgres
  - postgresql
adapter: generic-uri
defaults:
  port: 5432
authority:
  host: true
  port: true
  multi_host: true
resource:
  type: database
  required: true
path:
  type: object_path
  required: false
credentials:
  username: true
  password: true
query_parameters:
  sslmode:
    type: string
    allowed: [disable, allow, prefer, require, verify-ca, verify-full]
validation:
  require_host: true
  port_range:
    min: 1
    max: 65535
```

The v1 definition language is intentionally small. It handles schemes, provider
type, adapter selection, defaults, resource/path rules, query parameter typing,
allowed values, and basic validation.

Provider-specific structural parsing still lives in adapters where real-world
formats need it, such as MongoDB SRV URLs, PostgreSQL-compatible conninfo,
QuestDB ILP config strings, JDBC URLs, and SQLite/DuckDB memory databases.

## Fixtures

The shared compatibility contract lives in `fixtures/v1.json`.

The fixtures are used by the test suite, but they are not only test data. They
are the portable behavior contract future implementations should share. A Go or
Rust implementation should be able to run the same fixture file and produce the
same observable fields.

Fixture example:

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

Run the fixture suite:

```bash
pnpm test
```

## CLI

```bash
connparse 's3://my-bucket/path/to/file.csv'
connparse --safe 'postgres://user:pass@localhost/app'
connparse --strict 'postgres://localhost/app?unknown=1'
connparse --provider postgres 'host=db.example.com dbname=app user=alice'
```

## V1 Boundaries

Connparse v1 is a practical parser, not a full external standard yet. It does
not perform network checks, open sockets, authenticate credentials, infer table
schemas, or generate UI forms. Those can be layered on top of the normalized
address model later.
