# Connparse Go

Go implementation of the Connparse parser.

The package uses the shared CPDS definitions and fixture contract from the
repository root. It mirrors the JavaScript API shape with a Go-friendly result
type.

```go
package main

import (
	"fmt"

	connparse "github.com/connparse/connparse/packages/go"
)

func main() {
	result := connparse.Parse("postgres://user:pass@localhost/app")
	if !result.OK {
		fmt.Println(result.Errors)
		return
	}

	fmt.Println(result.Value.Safe)
}
```

`Safe` is spec-driven. Connparse always masks URI userinfo passwords, but query
parameters and key/value fields are masked only when the matched CPDS definition
declares them in `redaction.sensitive_keys`.

```go
postgres, _ := connparse.DefaultRegistry().ByID("postgres")
fmt.Println(connparse.Mask(
	"postgres://user:pass@localhost/app?sslkey=/tmp/key.pem",
	postgres,
))
// postgres://user:***@localhost/app?sslkey=***
```

Canonical identity helpers are safe by default:

```go
value, _ := connparse.Canonicalize(
	"postgresql://user:pass@LOCALHOST:5432/app?sslmode=require",
)
fmt.Println(value)
// postgres://localhost/app?sslmode=require

same, _ := connparse.Equivalent(
	"postgresql://localhost:5432/app",
	"postgres://localhost/app",
)
fmt.Println(same)
// true
```

Use `ParseNormalize` when equivalent inputs should produce the same JSON-shaped
value:

```go
result := connparse.ParseNormalize(
	"postgresql://user:pass@LOCALHOST:5432/app?sslmode=require",
)
fmt.Println(result.Value.Canonical)
// postgres://localhost/app?sslmode=require
```

Run the Go package tests:

```bash
go test ./...
```

From the repository root, use:

```bash
pnpm test:go
```
