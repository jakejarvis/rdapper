# 🎩 rdapper

RDAP‑first domain registration lookups with WHOIS fallback. Produces a single, normalized record shape regardless of source.

- RDAP‑first lookup via [IANA bootstrap](https://data.iana.org/rdap/dns.json) with automatic WHOIS fallback when needed
- Smart WHOIS client (TCP 43): authoritative TLD discovery, registrar referral follow, and curated exceptions
- Rich, normalized results: registrar, contacts, nameservers, EPP statuses, key dates, DNSSEC, privacy flag, source metadata
- RDAP enrichment: follows related/entity/registrar links (bounded) to fill in missing details
- TypeScript‑first: shipped types, ESM‑only, zero external HTTP client (uses global `fetch`)

> [!IMPORTANT]
> Edge runtimes (e.g., Vercel Edge, Cloudflare Workers) do not support WHOIS (TCP 43 via `node:net`). Use RDAP‑only mode by setting `{ rdapOnly: true }`.

> [!TIP]
> See `rdapper` in action on [**Domainstack**](https://domainstack.io)!

## Install

```bash
npm install rdapper
```

## Quick Start

```ts
import { lookupDomain } from "rdapper";

const { ok, record, error } = await lookupDomain("example.com");

if (!ok) throw new Error(error);
console.log(record); // normalized DomainRecord
```

Also available:

```ts
import { isRegistered, isAvailable } from "rdapper";

await isRegistered("example.com"); // => true
await isAvailable("likely-unregistered-thing-320485230458.com"); // => false
```

Normalize arbitrary input (domain or URL) to its registrable domain (eTLD+1):

```ts
import { toRegistrableDomain } from "rdapper";

toRegistrableDomain("https://sub.example.co.uk/page"); // => "example.co.uk"
toRegistrableDomain("spark-public.s3.amazonaws.com");   // => "amazonaws.com" (ICANN-only default)
toRegistrableDomain("192.168.0.1");                      // => null
```

## API

- `lookupDomain(domain, options?) => Promise<LookupResult>`
  - Tries RDAP first if supported by the domain’s TLD; if unavailable or fails, falls back to WHOIS (unless toggled off).
  - Result is `{ ok: boolean, record?: DomainRecord, error?: string }`.
- `isRegistered(domain, options?) => Promise<boolean>`
- `isAvailable(domain, options?) => Promise<boolean>`

### CLI

For quick checks, a minimal CLI is included:

```bash
npx rdapper example.com
echo "example.com" | npx rdapper
```

### Edge runtimes (e.g., Vercel Edge)

WHOIS requires a raw TCP connection over port 43 via `node:net`, which is not available on edge runtimes. rdapper lazily loads `node:net` only when the WHOIS path is taken.

- Prefer RDAP only on edge:

```ts
import { lookupDomain } from "rdapper";

const res = await lookupDomain("example.com", { rdapOnly: true });
```

- If `rdapOnly` is omitted and the code path reaches WHOIS on edge, rdapper throws a clear runtime error advising to run in Node or set `{ rdapOnly: true }`.

### Options

- `timeoutMs?: number` – Total timeout budget per network operation (default `15000`).
- `rdapOnly?: boolean` – Only attempt RDAP; do not fall back to WHOIS.
- `whoisOnly?: boolean` – Skip RDAP and query WHOIS directly.
- `followWhoisReferral?: boolean` – Follow registrar referral from the TLD WHOIS (default `true`).
- `maxWhoisReferralHops?: number` – Maximum registrar WHOIS referral hops to follow (default `2`).
- `rdapFollowLinks?: boolean` – Follow related/entity RDAP links to enrich data (default `true`).
- `maxRdapLinkHops?: number` – Maximum RDAP related link hops to follow (default `2`).
- `rdapLinkRels?: string[]` – RDAP link rel values to consider (default `["related","entity","registrar","alternate"]`).
- `customBootstrapUrl?: string` – Override RDAP bootstrap URL.
- `whoisHints?: Record<string, string>` – Override/add authoritative WHOIS per TLD (keys are lowercase TLDs, values may include or omit `whois://`).
- `includeRaw?: boolean` – Include `rawRdap`/`rawWhois` in the returned record (default `false`).
- `signal?: AbortSignal` – Optional cancellation signal.

### `DomainRecord` schema

The exact presence of fields depends on registry/registrar data and whether RDAP or WHOIS was used.

```ts
interface DomainRecord {
  domain: string;             // normalized name (unicode when available)
  tld: string;                // public suffix (can be multi-label, e.g., "com", "co.uk")
  isRegistered: boolean;      // availability heuristic (WHOIS) or true (RDAP)
  isIDN?: boolean;            // uses punycode labels (xn--)
  unicodeName?: string;       // RDAP unicodeName when provided
  punycodeName?: string;      // RDAP ldhName when provided
  registry?: string;          // registry operator (rarely available)
  registrar?: {
    name?: string;
    ianaId?: string;
    url?: string;
    email?: string;
    phone?: string;
  };
  reseller?: string;
  statuses?: Array<{
    status: string;
    description?: string;
    raw?: string;
  }>;
  creationDate?: string;      // ISO 8601 (UTC)
  updatedDate?: string;       // ISO 8601 (UTC)
  expirationDate?: string;    // ISO 8601 (UTC)
  deletionDate?: string;      // ISO 8601 (UTC)
  transferLock?: boolean;     // derived from EPP statuses
  dnssec?: {
    enabled: boolean;
    dsRecords?: Array<{
      keyTag?: number;
      algorithm?: number;
      digestType?: number;
      digest?: string;
    }>;
  };
  nameservers?: Array<{
    host: string;
    ipv4?: string[];
    ipv6?: string[];
  }>;
  contacts?: Array<{
    type: "registrant" | "admin" | "tech" | "billing" | "abuse" | "registrar" | "reseller" | "unknown";
    name?: string;
    organization?: string;
    email?: string | string[];
    phone?: string | string[];
    fax?: string | string[];
    street?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string;
  }>;
  privacyEnabled?: boolean;   // registrant appears privacy-redacted based on keyword heuristics
  whoisServer?: string;       // authoritative WHOIS queried (if any)
  rdapServers?: string[];     // RDAP URLs tried (bootstrap bases and related/entity links)
  rawRdap?: unknown;          // raw RDAP JSON (only when options.includeRaw)
  rawWhois?: string;          // raw WHOIS text (only when options.includeRaw)
  source: "rdap" | "whois";   // which path produced data
  warnings?: string[];
}
```

### Example output

```json
{
  "domain": "example.com",
  "tld": "com",
  "isRegistered": true,
  "registrar": { "name": "Internet Assigned Numbers Authority", "ianaId": "376" },
  "statuses": [{ "status": "clientTransferProhibited" }],
  "nameservers": [{ "host": "a.iana-servers.net" }, { "host": "b.iana-servers.net" }],
  "dnssec": { "enabled": true },
  "source": "rdap"
}
```

## How it works

- RDAP
  - Discovers base URLs for the TLD via IANA’s RDAP bootstrap JSON.
  - Tries each base until one responds successfully; parses standard RDAP domain JSON.
  - Optionally follows related/entity links to registrar RDAP resources and merges results (bounded by hop limits).
  - Normalizes registrar (from `entities`), contacts (vCard), nameservers (`ipAddresses`), events (created/changed/expiration), statuses, and DNSSEC (`secureDNS`).
- WHOIS
  - Discovers the authoritative TLD WHOIS via `whois.iana.org` (TCP 43), with curated exceptions for tricky zones and public SLDs.
  - Queries the TLD WHOIS and follows registrar referrals recursively up to `maxWhoisReferralHops` (unless disabled).
  - Normalizes common key/value variants across gTLD/ccTLD formats (dates, statuses, nameservers, contacts). Availability is inferred from common phrases (best‑effort heuristic).

Timeouts are enforced per request using a simple race against `timeoutMs` (default 15s). All network I/O is performed with global `fetch` (RDAP) and a raw TCP socket (WHOIS).

## Development

- Build: `npm run build` ([tsdown](https://tsdown.dev/))
- Test: `npm test` ([Vitest](https://vitest.dev/))
  - By default, tests are offline/deterministic.
  - Watch mode: `npm run dev`
  - Coverage: `npm run test:run -- --coverage`
  - Smoke tests that hit the network are gated by `SMOKE=1`, e.g. `SMOKE=1 npm test`.
- Lint/format: `npm run lint` ([Biome](https://biomejs.dev/))

Project layout:

- `src/rdap/` – RDAP bootstrap, client, and normalization
- `src/whois/` – WHOIS TCP client, discovery/referral, normalization, exceptions
- `src/lib/` – utilities for dates, text parsing, domain processing, async
- `src/types.ts` – public types; `src/index.ts` re‑exports API and types
- `bin/cli.js` – simple CLI for quick checks

## Caveats

- WHOIS text formats vary significantly across registries/registrars; normalization is best‑effort.
- Availability detection relies on common WHOIS phrases and is not authoritative.
- Some TLDs provide no RDAP service; `rdapOnly: true` will fail for them.
- Registries may throttle or block WHOIS; respect rate limits and usage policies.
- Field presence depends on source and privacy policies (e.g., redaction/withholding).
- Public suffix detection uses `tldts` with ICANN‑only defaults (Private section is ignored). You can pass options through to `tldts` via `toRegistrableDomain`/`getDomainParts`/`getDomainTld` (e.g., `allowPrivateDomains`) to customize behavior. See: [tldts migration notes](https://github.com/remusao/tldts#migrating-from-other-libraries).

## License

[MIT](LICENSE)
