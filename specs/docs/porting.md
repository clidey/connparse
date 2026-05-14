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

When generated definitions exist, ports should add a drift check that compares
generated output to committed package-local definitions.

## Adding a Port

1. Create `packages/<language>/`.
2. Implement the DSAM result shape and diagnostics.
3. Load or embed built-in CPDS definitions.
4. Implement adapters required by the definitions.
5. Add a shared fixture runner.
6. Wire the package into root `pnpm test` and `pnpm run check`.
