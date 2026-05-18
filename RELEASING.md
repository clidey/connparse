# Releasing

Connparse publishes three client libraries from this monorepo:

- npm: `@clidey/connparse`
- Go: `github.com/clidey/connparse/packages/go`
- PyPI: `connparse`

## Required Checks

Run these before any release:

```bash
pnpm install
pnpm run check
pnpm test
pnpm check:package
pnpm --filter @clidey/connparse pack --dry-run
```

All packages must use the same version. `pnpm check:versions` verifies that
`packages/js/package.json` and `packages/python/pyproject.toml` match. The Go
version is the release tag `packages/go/vX.Y.Z`.

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

## Python

The Python package is published from `packages/python` as `connparse`.

```bash
pip install connparse
```

Consumers import:

```python
from connparse import parse
```

GitHub Actions uses PyPI trusted publishing, so no PyPI token is required. The
trusted publisher on PyPI must match this repository and
`.github/workflows/release.yml`.

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
2. bumps `packages/js/package.json` and `packages/python/pyproject.toml` to the same version;
3. runs checks, tests, package consumption checks, npm dry-run packing, and Python package build;
4. commits the version bump;
5. pushes the commit;
6. publishes `@clidey/connparse` to npm;
7. publishes `connparse` to PyPI;
8. creates and pushes `packages/go/vX.Y.Z`;
9. creates a GitHub Release for the Go module tag.
