# Repository Guidelines

## Team Rules

These apply in every clidey repository, for people and agents alike.

- **Commits:** ask once before the first commit. Once the user says yes, keep committing that work without asking again; push only when they've asked for it.
- **No AI attribution, anywhere:** commits, PRs, issues, comments and releases carry no `Co-Authored-By:` for Claude, Codex or any other agent, and no "Generated with" lines.
- **Never, whatever the instruction:** publish packages or releases, push images, deploy to UAT or production, or run anything against production. Build images and run build scripts only locally, to test. Prepare the command and hand it to the user.
- **Cluster and cloud commands:** read-only `kubectl`, `helm` and `gcloud` commands run without asking (never against production). Anything that writes, deletes or shows secret values, and anything that writes to a WhoDB organisation: show the exact command and wait for a yes.
- **Branches and worktrees:** never create a branch or worktree, or switch branches, unless the user asked. If the work seems to need one, ask first; this is a required question.
- **Untracked files:** ask before deleting untracked or gitignored files; they often hold secrets or local state.
- **pnpm only:** never npm, npx, yarn or bun.
- **Stay in the workspace:** use only the clones in the workspace; never read or run checkouts elsewhere, such as old ones in `~/Documents`.
- **The machine:** don't keep it awake or change power settings (`caffeinate`, `pmset`); recommend it to the user instead.
- **Agent replies:** lead with the answer or result. No preamble, no restating the question, no recap unless asked. Keep it short and explain only what isn't obvious; if you need something from the user, ask in one line.
- **Clarify first:** before starting, ask about anything where a different answer would change the work: scope, behaviour, which repo or environment, or anything hard to undo. Ask all your questions at once, then wait. Don't ask what the code or docs already answer; for small choices that are easy to change later, pick one and say which in your reply.

## Layout

Shared specification assets live in `specs/` (CPDS YAML definitions, `specs/fixtures/compatibility.json`, JSON Schemas, docs). Implementations live in `packages/js/` (npm `@clidey/connparse`, CLI in `bin/`), `packages/go/`, `packages/python/`, `packages/rust/`, and `packages/java/`. Keep implementation code inside its package and reusable specs and fixtures in `specs/`.

## Commands

Run from the repository root:

- `pnpm install`
- `pnpm generate:definitions`: regenerate every package's built-in definitions from `specs/definitions/*.yaml`.
- `pnpm test`: JS, Go, Python, Rust, and Java suites (`pnpm test:js|go|python|rust|java` for one; Java needs a JDK 17+ `javac`).
- `pnpm run check`: versions, strict definition verification, schemas, conformance, generated-file drift, and per-language checks (including `cargo fmt --check`).
- `pnpm check:package`: pack and consume the published packages from temp projects.
- `node packages/js/bin/connparse.js --provider postgres 'host=db.example.com dbname=app'`: CLI smoke test.

CI runs `pnpm run check`, `pnpm test`, `pnpm check:package`, and `pnpm --filter @clidey/connparse pack --dry-run`. The agent Stop hook runs the suite of each language you changed; run `pnpm run check` before handing off.

## Rules

- Definition IDs and YAML filenames match provider IDs (`postgres.yaml`).
- Behavior that must stay stable across implementations gets a fixture in `specs/fixtures/compatibility.json`. Package tests consume shared fixtures and definitions from `specs/`, never package-local copies.
- Package versions move together (`pnpm sync:versions`, checked by `pnpm check:versions`); the Go version is the release tag.
- Every implementation returns the same JSON-shaped result contract. Public API naming follows each language: JS/Go `parse`/`Parse`, Python and Rust snake case (`parse_normalize`, `parse_or_throw`), Java `Connparse.parse`.
- JS is ESM with explicit `.js` import extensions; prefer small provider adapters (kebab-case files such as `postgres-compatible.js`) over broad conditionals. Python uses the standard library unless a dependency is clearly justified.
- Never log `credentials` by default. Use `safe` output or `mask()` for display. When adding sensitive query or config keys, update redaction tests as well as provider fixtures.
- Pull requests list affected providers/formats, fixture or CPDS changes, and the verification commands run.
