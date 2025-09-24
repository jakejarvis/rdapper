# rdapper
🤵Domain RDAP/WHOIS fetched and parser for Node
rdapper
========

Fetch and parse domain registration data with RDAP-first and WHOIS fallback. Node 18+.

Install
-------

```bash
pnpm add rdapper
```

Usage
-----

```ts
import { lookupDomain } from "rdapper";

const { ok, record, error } = await lookupDomain("example.com", {
  timeoutMs: 15000,
  followWhoisReferral: true,
});

if (!ok) throw new Error(error);
console.log(record);
```

Notes
-----
- Uses IANA RDAP bootstrap and RDAP JSON when available; falls back to WHOIS.
- Standardized output regardless of source.
- No external HTTP client deps; relies on global fetch. WHOIS uses TCP 43.