# Connparse Go

Go implementation of the Connparse DSAM v1 parser.

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

Run the Go package tests:

```bash
go test ./...
```

From the repository root, use:

```bash
pnpm test:go
```
