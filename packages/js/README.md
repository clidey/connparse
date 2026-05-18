# Connparse

Connparse is a definition-driven parser for data source connection strings and
addresses.

This is the JavaScript package from the Connparse monorepo. The shared
fixtures, CPDS definitions, and reference docs live at the repository root under
`specs/`.

```ts
import { defaultRegistry, mask, parse, parseNormalize, sanitize } from '@clidey/connparse';

const result = parse('postgres://user:pass@localhost/app');

if (result.ok) {
  console.log(result.value.safe);
}
```

CLI and `sanitize()` output are safe by default: credential keys are preserved,
but values are masked unless the provider CPDS file lists the credential in
`redaction.safe_credentials`.

Raw string masking is also spec-driven:

```ts
const postgres = defaultRegistry.getById('postgres');

mask('postgres://user:pass@localhost/app?sslkey=/tmp/key.pem', postgres);
// postgres://user:***@localhost/app?sslkey=***
```

Connparse always masks URI userinfo passwords. Query parameters, options, and
key/value fields are masked only when the CPDS definition declares them in
`redaction.sensitive_keys`.

Use `parseNormalize()` when equivalent inputs should produce the same JSON:

```ts
parseNormalize('postgresql://user:pass@LOCALHOST:5432/app?sslmode=require');
parseNormalize('postgres://localhost/app?sslmode=require');
```

Canonical identity helpers are safe by default:

```ts
import { canonicalize, equivalent } from '@clidey/connparse';

canonicalize('postgresql://user:pass@LOCALHOST:5432/app?sslmode=require');
// postgres://localhost/app?sslmode=require

equivalent('postgresql://localhost:5432/app', 'postgres://localhost/app');
// true
```
