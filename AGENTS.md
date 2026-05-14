# Repository Guidelines

## Project Structure & Module Organization

This is a monorepo. Shared specification assets live under `specs/`:

- `specs/definitions/`: CPDS YAML definitions.
- `specs/fixtures/v1.json`: cross-implementation compatibility fixtures.
- `specs/docs/`: reference and v1 provider-format documentation.

The JavaScript/npm implementation lives in `packages/js/`:

- `packages/js/src/`: parser, adapters, registry, validation, and public exports.
- `packages/js/bin/`: CLI entrypoint.
- `packages/js/test/`: Node test suite.

Keep implementation-specific code inside its package. Keep reusable specs and fixtures in `specs/`.

## Build, Test, and Development Commands

Run commands from the repository root unless noted:

- `pnpm install`: install workspace dependencies.
- `pnpm test`: run the JS package test suite through the workspace filter.
- `pnpm test:js`: same as above, explicit JS target.
- `pnpm run check`: syntax-check JS source and CLI files.
- `pnpm --filter connparse test`: run tests from the package scope.

For CLI smoke tests:

```bash
node packages/js/bin/connparse.js --provider postgres 'host=db.example.com dbname=app'
```

## Coding Style & Naming Conventions

Use ESM JavaScript and explicit `.js` import extensions. Keep indentation to two spaces, match existing semicolon style, and prefer small provider adapters over broad conditional logic. Adapter filenames use kebab case, for example `postgres-compatible.js`.

CPDS definition IDs and YAML filenames should match provider IDs, such as `postgres.yaml` and `yugabytedb.yaml`.

## Testing Guidelines

Tests use Node’s built-in `node:test` and `node:assert/strict`. Add or update fixtures in `specs/fixtures/v1.json` for any behavior that should be stable across implementations. JS tests must consume shared fixtures and definitions from `specs/`, not package-local copies.

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
