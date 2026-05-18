# Repository Guidelines

## Project Structure & Module Organization

This is a monorepo. Shared specification assets live under `specs/`:

- `specs/definitions/`: CPDS YAML definitions.
- `specs/fixtures/compatibility.json`: cross-implementation compatibility fixtures.
- `specs/schemas/`: JSON Schemas for CPDS, fixtures, parse results, and addresses.
- `specs/docs/`: reference and porting documentation.

The JavaScript/npm implementation lives in `packages/js/`:

- `packages/js/src/`: parser, adapters, registry, validation, and public exports.
- `packages/js/bin/`: CLI entrypoint.
- `packages/js/test/`: Node test suite.

The Go implementation lives in `packages/go/`:

- `packages/go/*.go`: parser, adapters, registry, validation, and Go tests.
- `packages/go/connparse_test.go`: shared fixture runner.

Keep implementation-specific code inside its package. Keep reusable specs and fixtures in `specs/`.

## Build, Test, and Development Commands

Run commands from the repository root unless noted:

- `pnpm install`: install workspace dependencies.
- `pnpm generate:definitions`: regenerate JS and Go built-in definitions from CPDS YAML.
- `pnpm check:generated`: verify generated definitions are current.
- `pnpm conformance`: run the shared compatibility fixtures through the conformance runner.
- `pnpm check:schemas`: verify JSON Schema documents are parseable and have required metadata.
- `pnpm test`: run JS and Go test suites.
- `pnpm test:js`: run the JS package test suite.
- `pnpm test:go`: run the Go package test suite.
- `pnpm run check`: verify generated definitions, syntax-check JS source, and run Go tests.
- `pnpm --filter connparse test`: run tests from the package scope.

For CLI smoke tests:

```bash
node packages/js/bin/connparse.js --provider postgres 'host=db.example.com dbname=app'
```

## Coding Style & Naming Conventions

Use ESM JavaScript and explicit `.js` import extensions. Keep indentation to two spaces, match existing semicolon style, and prefer small provider adapters over broad conditional logic. Adapter filenames use kebab case, for example `postgres-compatible.js`.

Use `gofmt` for Go. Keep Go files in package `connparse`, use exported names for public API (`Parse`, `ParseOrThrow`, `BuiltInDefinitions`), and keep provider logic in focused adapter functions.

CPDS definition IDs and YAML filenames should match provider IDs, such as `postgres.yaml` and `yugabytedb.yaml`.

Do not edit generated built-ins directly. Update `specs/definitions/*.yaml`, then run `pnpm generate:definitions`.

## Testing Guidelines

Tests use Node’s built-in `node:test` and `node:assert/strict` for JS and Go’s standard `testing` package for Go. Add or update fixtures in `specs/fixtures/compatibility.json` for any behavior that should be stable across implementations. Package tests must consume shared fixtures and definitions from `specs/`, not package-local copies. Generator drift is checked by `pnpm check:generated`, schema metadata by `pnpm check:schemas`, and fixture behavior by `pnpm conformance`.

Before finishing changes, run:

```bash
pnpm test
pnpm run check
```

## Commit & Pull Request Guidelines

Current history uses short, imperative commit subjects such as `add more tests` and `validation changes`. Keep commits focused and use concise lower-case summaries where practical.

Pull requests should describe the behavior change, list affected providers/formats, note fixture or CPDS changes, and include the verification commands run. Link related issues when available.

## Security & Configuration Tips

Never log `credentials` by default. Use `safe` output or `mask()` for UI/log display. When adding sensitive query/config keys, update redaction tests as well as provider fixtures.
