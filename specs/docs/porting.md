# Porting Contract

Connparse ports must be built against the shared specification assets in
`specs/`. The goal is for language implementations to differ in API ergonomics,
not parsing behavior.

CPDS means Connparse Definition Specification. CPDS files are the shared YAML
provider definitions used by every package.

## Required Inputs

Every port must treat these files as the source of truth:

- `specs/definitions/*.yaml`: CPDS provider metadata.
- `specs/fixtures/compatibility.json`: stable cross-language behavior fixtures.
- `specs/schemas/*.schema.json`: JSON Schemas for definitions, fixtures, parse
  results, and address objects.
- `specs/docs/reference.md`: public key, diagnostic, adapter, and fixture
  reference.

Ports may ship generated or embedded definitions for runtime convenience, but
generated output must remain compatible with the CPDS files.

## Required Tests

Each implementation must include a fixture runner that reads
`specs/fixtures/compatibility.json` directly. The runner must assert:

- all fixtures parse successfully in permissive mode;
- all fixtures parse successfully in strict mode;
- fixtures produce no warnings;
- the DSAM object has exactly the documented top-level keys;
- every dotted `expected` path matches;
- multi-host addresses use `authority.hosts` and omit top-level
  `authority.host` and `authority.port`.

Provider-specific validation tests should live in each package, but durable
behavior should be promoted into shared fixtures.

## Conformance Runner

The shared conformance runner is:

```bash
pnpm conformance
```

It runs the compatibility fixtures against the JavaScript implementation by
default. Other ports can use the external parser protocol:

```bash
node tools/conformance-runner.mjs -- ./path/to/parser-runner
```

For each fixture, the runner sends one JSON object to the external command on
stdin:

```json
{
  "input": "postgres://localhost/app",
  "options": {
    "provider": "postgres",
    "strict": true
  }
}
```

The external command must write a Connparse parse result JSON object to stdout.
The runner checks permissive and strict parsing, warnings, top-level address
shape, fixture expected paths, multi-host behavior, raw preservation, safe-output
leak checks, and provider coverage.

For custom fixture subsets, pass `--skip-coverage` to disable the built-in
provider coverage check.

## Generator Strategy

The official generation boundary is CPDS-to-language definitions. A generator
should read `specs/definitions/*.yaml` and emit package-local built-ins such as
JavaScript objects or Go structs. It should not generate adapter parsing logic:
real connection-string formats still need hand-written adapter code.

The current generator is:

```bash
pnpm verify:definitions
pnpm generate:definitions
```

It writes:

- `packages/js/src/builtin-definitions.js`
- `packages/go/builtin_definitions.go`
- `packages/java/src/main/java/io/github/clidey/connparse/BuiltInDefinitions.java`
- `packages/python/src/connparse/builtin_definitions.py`
- `packages/rust/src/builtin_definitions.rs`

The drift check is:

```bash
pnpm check:generated
```

`pnpm verify:definitions` validates CPDS YAML before generation. It fails on
missing required keys, invalid field shapes, duplicate schemes, and invalid
ports. It also reports suggestions such as missing `redaction` on definitions
that declare credentials; `pnpm verify:definitions:strict` treats suggestions
as failures.

JSON Schema documents are checked with:

```bash
pnpm check:schemas
```

Ports should add their generated built-in definition file to this generator.
Generated files must be committed, and package tests should fail if generated
definitions drift from CPDS YAML.

## Adding a Port

1. Create `packages/<language>/`.
2. Implement the DSAM result shape and diagnostics.
3. Load or embed built-in CPDS definitions.
4. Implement adapters required by the definitions.
5. Add a shared fixture runner.
6. Add generated built-ins to `tools/generate-definitions.mjs`.
7. Wire the package into root `pnpm test` and `pnpm run check`.
