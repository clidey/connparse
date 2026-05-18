# Releasing

Connparse publishes two client libraries from this monorepo:

- npm: `@clidey/connparse`
- Go: `github.com/clidey/connparse/packages/go`

## Required Checks

Run these before any release:

```bash
pnpm install
pnpm run check
pnpm test
pnpm check:package
pnpm --filter @clidey/connparse pack --dry-run
```

## npm

The npm package is published from `packages/js`. GitHub Actions uses npm trusted
publishing, so no `NPM_TOKEN` secret is required for the release workflow. The
trusted publisher on npm must match this repository and `.github/workflows/release.yml`.

```bash
cd packages/js
npm publish --access public
```

The package keeps the CLI command name as `connparse`:

```bash
npm install -g @clidey/connparse
connparse --help
```

## Go

The Go package is a nested Go module. Its release tag must include the module
subdirectory:

```bash
git tag packages/go/v0.1.0
git push origin packages/go/v0.1.0
```

Consumers import:

```go
import connparse "github.com/clidey/connparse/packages/go"
```

## Manual GitHub Release Workflow

Use `.github/workflows/release.yml` from GitHub Actions.

Inputs:

- `bump`: `patch`, `minor`, `major`, or `prerelease`
- `version`: optional explicit SemVer without `v`; overrides `bump`
- `preid`: prerelease identifier used with `bump=prerelease`

No npm automation token is required when trusted publishing is enabled for this
package and workflow.

The workflow:

1. installs dependencies;
2. bumps `packages/js/package.json`;
3. runs checks, tests, package consumption checks, and npm dry-run packing;
4. commits the version bump;
5. pushes the commit;
6. publishes `@clidey/connparse` to npm;
7. creates and pushes `packages/go/vX.Y.Z`;
8. creates a GitHub Release for the Go module tag.
