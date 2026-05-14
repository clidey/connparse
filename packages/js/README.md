# Connparse

Connparse is a definition-driven parser for data source connection strings and
addresses.

This is the JavaScript package from the Connparse monorepo. The shared v1
fixtures, CPDS definitions, and reference docs live at the repository root under
`specs/`.

```ts
import { parse } from 'connparse';

const result = parse('postgres://user:pass@localhost/app');

if (result.ok) {
  console.log(result.value.safe);
}
```
