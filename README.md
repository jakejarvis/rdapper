# rdapper

🤵 Fetch and parse domain registration data using RDAP and falling back to WHOIS.

## Install

```bash
npm install rdapper
```

## Usage

```ts
import { lookupDomain } from "rdapper";

const { ok, record, error } = await lookupDomain("example.com", {
  timeoutMs: 15000,
  followWhoisReferral: true,
});

if (!ok) throw new Error(error);
console.log(record);
```

## Notes

- Uses IANA RDAP bootstrap and RDAP JSON when available; falls back to WHOIS.
- Standardized output regardless of source.
- No external HTTP client deps; relies on global fetch. WHOIS uses TCP 43.

## License

[MIT](LICENSE)
