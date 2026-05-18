# Connparse

Connparse is a definition-driven parser for data source connection strings and
addresses. It turns database URLs, object storage URIs, file paths, and similar
source identifiers into one safe, normalized object.

This repository contains the JavaScript reference implementation, a Go
implementation, shared CPDS definitions, and shared compatibility fixtures.

## Repository Layout

```text
specs/
  definitions/   Shared CPDS YAML definitions
  fixtures/      Cross-implementation compatibility fixtures
  docs/          Reference and porting docs

packages/
  js/            JavaScript/npm implementation
  go/            Go implementation
```

## Install

The JavaScript package has one runtime dependency: `yaml`, used to load CPDS
definition files. The Go package uses `gopkg.in/yaml.v3` for the same CPDS
loader API.

```bash
npm install connparse
```

For local development in this repo:

```bash
pnpm install
pnpm verify:definitions
pnpm generate:definitions
pnpm test
pnpm test:go
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

## Supported Providers

Current built-in providers:

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

### `parseNormalize(input, options?)`

Returns a `ParseResult`, but `value` is a stable normalized object instead of a
faithful raw parse object. Equivalent inputs produce the same normalized JSON.

Use `parse()` when you need to preserve the exact original input in `raw`. Use
`parseNormalize()` when you need dedupe keys, config comparison, cache keys, or
stable UI state.

```js
parseNormalize('postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp');
parseNormalize('postgres://localhost/app?application_name=myapp&sslmode=require');
```

Both return the same normalized `value`:

```json
{
  "scheme": "postgres",
  "type": "database",
  "authority": {
    "host": "localhost",
    "port": null
  },
  "resource": {
    "type": "database",
    "name": "app"
  },
  "path": "",
  "query": {
    "application_name": "myapp",
    "sslmode": "require"
  },
  "fragment": null,
  "credentials": {},
  "options": {},
  "raw": "postgres://localhost/app?application_name=myapp&sslmode=require",
  "safe": "postgres://localhost/app?application_name=myapp&sslmode=require",
  "canonical": "postgres://localhost/app?application_name=myapp&sslmode=require"
}
```

### `canonicalize(input, options?)`

Returns a stable string identity for a connection address. Canonicalization
normalizes scheme aliases, removes default ports, sorts query parameters, and
normalizes typed query values where the CPDS definition declares the type.

Canonical strings are safe by default: URI credentials are omitted, and
CPDS-declared sensitive query values are replaced with `***`.

```js
canonicalize('postgresql://user:pass@LOCALHOST:5432/app?sslmode=require&application_name=myapp');
// postgres://localhost/app?application_name=myapp&sslmode=require

canonicalize('postgres://user:pass@localhost/app?sslkey=/tmp/client.key&sslmode=require');
// postgres://localhost/app?sslkey=***&sslmode=require
```

Use explicit options only when the caller intentionally needs secret-inclusive
identity strings:

```js
canonicalize('postgres://user:pass@localhost/app?sslkey=/tmp/client.key', {
  includeCredentials: true,
  includeSensitive: true
});
// postgres://user:pass@localhost/app?sslkey=%2Ftmp%2Fclient.key
```

### `equivalent(left, right, options?)`

Compares two inputs by canonical identity:

```js
equivalent(
  'postgresql://localhost:5432/app?sslmode=require&application_name=myapp',
  'postgres://localhost/app?application_name=myapp&sslmode=require'
);
// true
```

### `mask(input, definition?)`

Redacts URI userinfo passwords from a raw connection string. Query parameters
and key/value fields are redacted only when the matched CPDS definition declares
them in `redaction.sensitive_keys`.

```js
const mysql = defaultRegistry.getById('mysql');

mask('mysql://root:secret@localhost/shop', mysql);
// mysql://root:***@localhost/shop

mask('mysql://root:secret@localhost/shop?ssl-key=/tmp/client.key', mysql);
// mysql://root:***@localhost/shop?ssl-key=***
```

The CLI uses this same spec-driven rule for `safe` output. It does not guess
that arbitrary query keys are secret unless the provider definition says so.

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

For the full list of keys, provider-specific fields, diagnostics, CPDS keys,
adapter names, and fixture format, see [specs/docs/reference.md](specs/docs/reference.md).

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
redaction:
  safe_credentials: [username]
  sensitive_keys: [password, sslkey, sslcert, sslrootcert]
```

The definition language is intentionally small. It handles schemes, provider
type, adapter selection, defaults, resource/path rules, query parameter typing,
allowed values, validation, and provider-specific redaction keys.

Provider-specific structural parsing still lives in adapters where real-world
formats need it, such as MongoDB SRV URLs, PostgreSQL-compatible conninfo,
QuestDB ILP config strings, JDBC URLs, and SQLite/DuckDB memory databases.

Built-in definitions are generated from `specs/definitions/*.yaml`:

```bash
pnpm verify:definitions
pnpm verify:definitions:strict
pnpm generate:definitions
pnpm check:generated
```

`verify:definitions` parses every CPDS YAML file and fails on hard schema
errors such as missing required keys, invalid ports, duplicate schemes, or bad
query/redaction shapes. It also prints suggestions, including missing
`redaction` for definitions that declare credentials. `verify:definitions:strict`
treats those suggestions as failures and is part of `pnpm run check`.

Do not edit generated files directly:

- `packages/js/src/builtin-definitions.js`
- `packages/go/builtin_definitions.go`

## Fixtures

The shared compatibility contract lives in `specs/fixtures/compatibility.json`.

The fixtures are used by the test suite, but they are not only test data. They
are the portable behavior contract across implementations. A port should be able
to run the same fixture file and produce the same observable fields.

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

The Go package also reads this same fixture file. See
[specs/docs/porting.md](specs/docs/porting.md) for the porting contract and the
generator boundary used to keep language implementations aligned.

## CLI

```bash
connparse 'postgres://user:pass@localhost/app'
connparse --safe 'postgres://user:pass@localhost/app'
connparse --include-secrets 'postgres://user:pass@localhost/app'
connparse --strict 'postgres://localhost/app?unknown=1'
connparse --provider postgres 'host=db.example.com dbname=app user=alice'
```

The CLI redacts JSON output by default: credential presence is preserved, but
sensitive credential/query/option values declared by the provider CPDS file are
replaced with `***`, and `raw` is replaced with `safe`. Use `--include-secrets`
only when you intentionally need the full parse result.

## Boundaries

Connparse parses and normalizes address strings. It does not perform network
checks, open sockets, authenticate credentials, infer table schemas, or generate
UI forms.
