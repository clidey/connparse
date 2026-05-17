# Porting Contract

Connparse ports must be built against the shared specification assets in
`specs/`. The goal is for language implementations to differ in API ergonomics,
not parsing behavior.

## Required Inputs

Every port must treat these files as the source of truth:

- `specs/definitions/*.yaml`: CPDS provider metadata.
- `specs/fixtures/v1.json`: stable cross-language behavior fixtures.
- `specs/docs/reference.md`: public key, diagnostic, adapter, and fixture
  reference.

Ports may ship generated or embedded definitions for runtime convenience, but
generated output must remain compatible with the CPDS files.

## Required Tests

Each implementation must include a fixture runner that reads
`specs/fixtures/v1.json` directly. The runner must assert:

- all fixtures parse successfully in permissive mode;
- all fixtures parse successfully in strict mode;
- fixtures produce no warnings;
- the DSAM object has exactly the documented top-level keys;
- every dotted `expected` path matches;
- multi-host addresses use `authority.hosts` and omit top-level
  `authority.host` and `authority.port`.

Provider-specific validation tests should live in each package, but durable
behavior should be promoted into shared fixtures.

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

The drift check is:

```bash
pnpm check:generated
```

`pnpm verify:definitions` validates CPDS YAML before generation. It fails on
missing required keys, invalid field shapes, duplicate schemes, and invalid
ports. It also reports suggestions such as missing `redaction` on definitions
that declare credentials; `pnpm verify:definitions:strict` treats suggestions
as failures.

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
