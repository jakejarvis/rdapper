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
import { lookup } from "rdapper";

const { ok, record, error } = await lookup("example.com");

if (!ok) throw new Error(error);
console.log(record); // normalized DomainRecord
```

Normalize arbitrary input (domain or URL) to its registrable domain (eTLD+1):

```ts
import { toRegistrableDomain } from "rdapper";

toRegistrableDomain("https://sub.example.co.uk/page"); // => "example.co.uk"
toRegistrableDomain("spark-public.s3.amazonaws.com"); // => "amazonaws.com" (ICANN-only default)
toRegistrableDomain("192.168.0.1"); // => null
```

Convenience helpers to quickly check availability:

```ts
import { isRegistered, isAvailable } from "rdapper";

await isRegistered("example.com"); // => true
await isRegistered("likely-unregistered-thing-320485230458.com"); // => false
await isAvailable("example.com"); // => false
await isAvailable("likely-unregistered-thing-320485230458.com"); // => true
```

## API

- `lookup(domain, options?) => Promise<LookupResult>`
  - Tries RDAP first if supported by the domain’s TLD; if unavailable or fails, falls back to WHOIS (unless toggled off).
  - Result is `{ ok: boolean, record?: DomainRecord, error?: string }`.
- `toRegistrableDomain(input, options?) => string | null`
  - Normalizes a domain or URL to its registrable domain (eTLD+1).
  - Returns the registrable domain string, or `null` for IPs/invalid input; [options](https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts) are forwarded to `tldts` (e.g., `allowPrivateDomains`).
- `isRegistered(domain, options?) => Promise<boolean>`
- `isAvailable(domain, options?) => Promise<boolean>`
- `finalizeContact(contact, redactedHint?) => Contact`
  - Cleans a contact: drops placeholder values (recording them in `redactedFields`), sets `privacyService`, resolves `country`/`countryCode`, and sets `redacted`. Safe to re-run on an already-cleaned contact, e.g. to upgrade contacts stored by an older version.
- `isPrivacyContact(contact) => boolean`
  - True when the contact's name/organization is a privacy service or was redacted.

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
import { lookup } from "rdapper";

const res = await lookup("example.com", { rdapOnly: true });
```

- If `rdapOnly` is omitted and the code path reaches WHOIS on edge, rdapper throws a clear runtime error advising to run in Node or set `{ rdapOnly: true }`.

### Bootstrap Data Caching

By default, rdapper fetches IANA's RDAP bootstrap registry from [`https://data.iana.org/rdap/dns.json`](https://data.iana.org/rdap/dns.json) on every RDAP lookup to discover the authoritative RDAP servers for a given TLD. While this ensures you always have up-to-date server mappings, it also adds latency and a network dependency to each lookup.

For production applications that perform many domain lookups, you can take control of bootstrap data caching by fetching and caching the data yourself, then passing it to rdapper using the `customBootstrapData` option. This eliminates redundant network requests and gives you full control over cache invalidation.

#### Why cache bootstrap data?

- **Performance**: Eliminate an extra HTTP request per lookup (or per TLD if you're looking up many domains)
- **Reliability**: Reduce dependency on IANA's availability during lookups
- **Control**: Manage cache TTL and invalidation according to your needs (IANA updates this file infrequently)
- **Cost**: Reduce bandwidth and API calls in high-volume scenarios

#### Example: In-memory caching with TTL

```ts
import { lookup, type BootstrapData } from "rdapper";

// Simple in-memory cache with TTL
let cachedBootstrap: BootstrapData | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getBootstrapData(): Promise<BootstrapData> {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedBootstrap && now < cacheExpiry) {
    return cachedBootstrap;
  }

  // Fetch fresh data
  const response = await fetch("https://data.iana.org/rdap/dns.json");
  if (!response.ok) {
    throw new Error(`Failed to load bootstrap data: ${response.status} ${response.statusText}`);
  }
  const data: BootstrapData = await response.json();

  // Update cache
  cachedBootstrap = data;
  cacheExpiry = now + CACHE_TTL_MS;

  return data;
}

// Use the cached bootstrap data in lookups
const bootstrapData = await getBootstrapData();
const result = await lookup("example.com", {
  customBootstrapData: bootstrapData,
});
```

#### Example: Redis caching

```ts
import { lookup, type BootstrapData } from "rdapper";
import { createClient } from "redis";

const redis = createClient();
await redis.connect();

const CACHE_KEY = "rdap:bootstrap:dns";
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

async function getBootstrapData(): Promise<BootstrapData> {
  // Try to get from Redis first
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch fresh data
  const response = await fetch("https://data.iana.org/rdap/dns.json");
  if (!response.ok) {
    throw new Error(`Failed to load bootstrap data: ${response.status} ${response.statusText}`);
  }
  const data: BootstrapData = await response.json();

  // Store in Redis with TTL
  await redis.setEx(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(data));

  return data;
}

// Use the cached bootstrap data in lookups
const bootstrapData = await getBootstrapData();
const result = await lookup("example.com", {
  customBootstrapData: bootstrapData,
});
```

#### Example: Filesystem caching

```ts
import { lookup, type BootstrapData } from "rdapper";
import { readFile, writeFile, stat } from "node:fs/promises";

const CACHE_FILE = "./cache/rdap-bootstrap.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getBootstrapData(): Promise<BootstrapData> {
  try {
    // Check if cache file exists and is fresh
    const stats = await stat(CACHE_FILE);
    const age = Date.now() - stats.mtimeMs;

    if (age < CACHE_TTL_MS) {
      const cached = await readFile(CACHE_FILE, "utf-8");
      return JSON.parse(cached);
    }
  } catch {
    // Cache file doesn't exist or is unreadable, will fetch fresh
  }

  // Fetch fresh data
  const response = await fetch("https://data.iana.org/rdap/dns.json");
  if (!response.ok) {
    throw new Error(`Failed to load bootstrap data: ${response.status} ${response.statusText}`);
  }
  const data: BootstrapData = await response.json();

  // Write to cache file
  await writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");

  return data;
}

// Use the cached bootstrap data in lookups
const bootstrapData = await getBootstrapData();
const result = await lookup("example.com", {
  customBootstrapData: bootstrapData,
});
```

#### Bootstrap data structure

The `BootstrapData` type matches IANA's published format:

```ts
interface BootstrapData {
  version: string; // e.g., "1.0"
  publication: string; // ISO 8601 timestamp
  description?: string;
  services: string[][][]; // Array of [TLDs, base URLs] tuples
}
```

See the full documentation at [RFC 7484 - Finding the Authoritative RDAP Service](https://datatracker.ietf.org/doc/html/rfc7484).

**Note**: The bootstrap data structure is stable and rarely changes. IANA updates the _contents_ (server mappings) periodically as TLDs are added or servers change, but a 24-hour cache TTL is typically safe for most applications.

### Custom Fetch Implementation

For advanced use cases, rdapper allows you to provide a custom `fetch` implementation that will be used for **all HTTP requests** in the library. This enables powerful patterns for caching, logging, retry logic, and more.

#### What requests are affected?

Your custom fetch will be used for:

- **RDAP bootstrap registry requests** (fetching `dns.json` from IANA, unless `customBootstrapData` is provided)
- **RDAP domain lookups** (querying RDAP servers for domain data)
- **RDAP related/entity link requests** (following links to registrar information)

#### Why use custom fetch?

- **Caching**: Implement sophisticated caching strategies for all RDAP requests
- **Logging & Monitoring**: Track all outgoing requests and responses
- **Retry Logic**: Add exponential backoff for failed requests
- **Rate Limiting**: Control request frequency to respect API limits
- **Proxies & Authentication**: Route requests through proxies or add auth headers
- **Testing**: Inject mock responses without network calls

#### Example 1: Simple in-memory cache

```ts
import { lookup } from "rdapper";

const cache = new Map<string, Response>();

const cachedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();

  // Check cache first
  if (cache.has(url)) {
    console.log("[Cache Hit]", url);
    return cache.get(url)!.clone();
  }

  // Fetch and cache
  console.log("[Cache Miss]", url);
  const response = await fetch(input, init);
  cache.set(url, response.clone());
  return response;
};

const result = await lookup("example.com", { customFetch: cachedFetch });
```

#### Example 2: Request logging and monitoring

```ts
import { lookup } from "rdapper";

const loggingFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();
  const start = Date.now();

  console.log(`[→] ${init?.method || "GET"} ${url}`);

  try {
    const response = await fetch(input, init);
    const duration = Date.now() - start;
    console.log(`[←] ${response.status} ${url} (${duration}ms)`);
    return response;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[✗] ${url} failed after ${duration}ms:`, error);
    throw error;
  }
};

const result = await lookup("example.com", { customFetch: loggingFetch });
```

#### Example 3: Retry logic with exponential backoff

```ts
import { lookup } from "rdapper";

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

const result = await lookup("example.com", { customFetch: fetchWithRetry });
```

#### Example 4: HTTP caching with cache-control headers

```ts
import { lookup } from "rdapper";

interface CachedResponse {
  response: Response;
  expiresAt: number;
}

const httpCache = new Map<string, CachedResponse>();

const httpCachingFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();
  const now = Date.now();

  // Check if we have a valid cached response
  const cached = httpCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.response.clone();
  }

  // Fetch fresh response
  const response = await fetch(input, init);

  // Parse Cache-Control header
  const cacheControl = response.headers.get("cache-control");
  if (cacheControl) {
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    if (maxAgeMatch) {
      const maxAge = parseInt(maxAgeMatch[1], 10);
      httpCache.set(url, {
        response: response.clone(),
        expiresAt: now + maxAge * 1000,
      });
    }
  }

  return response;
};

const result = await lookup("example.com", { customFetch: httpCachingFetch });
```

#### Example 5: Combining with customBootstrapData

You can use both `customFetch` and `customBootstrapData` together for maximum control:

```ts
import { lookup, type BootstrapData } from "rdapper";

// Pre-load bootstrap data (no fetch needed for this)
const bootstrapData: BootstrapData = await getFromCache("bootstrap");

// Use custom fetch for all other RDAP requests
const cachedFetch: typeof fetch = async (input, init) => {
  // Your caching logic for RDAP domain and entity lookups
  return fetch(input, init);
};

const result = await lookup("example.com", {
  customBootstrapData: bootstrapData,
  customFetch: cachedFetch,
});
```

**Note**: When `customBootstrapData` is provided, the bootstrap registry will not be fetched, so your custom fetch will only be used for RDAP domain and entity/related link requests.

### Options

- `timeoutMs?: number` – Timeout for each individual network operation (default `10000`). A lookup performs several operations in sequence, so see [Timeouts and diagnostics](#timeouts-and-diagnostics) for the worst case. A value that is not a finite number > 0 disables the timeout.
- `deadlineMs?: number` – Overall deadline for the whole lookup (default: none). When it elapses, in-flight requests and WHOIS sockets are cancelled and the result has `errorCode: "timeout"`.
- `rdapOnly?: boolean` – Only attempt RDAP; do not fall back to WHOIS.
- `whoisOnly?: boolean` – Skip RDAP and query WHOIS directly.
- `followWhoisReferral?: boolean` – Follow registrar referral from the TLD WHOIS (default `true`).
- `maxWhoisReferralHops?: number` – Maximum registrar WHOIS referral hops to follow (default `2`).
- `rdapFollowLinks?: boolean` – Follow related/entity RDAP links to enrich data (default `true`).
- `maxRdapLinkHops?: number` – Maximum RDAP related link hops to follow (default `2`).
- `rdapLinkRels?: string[]` – RDAP link rel values to consider (default `["related","entity","registrar","alternate"]`).
- `customBootstrapData?: BootstrapData` – Pre-loaded RDAP bootstrap data for caching control (see [Bootstrap Data Caching](#bootstrap-data-caching)).
- `customBootstrapUrl?: string` – Override RDAP bootstrap URL (ignored if `customBootstrapData` is provided).
- `customFetch?: FetchLike` – Custom fetch implementation for all HTTP requests (see [Custom Fetch Implementation](#custom-fetch-implementation)).
- `whoisHints?: Record<string, string>` – Override/add authoritative WHOIS per TLD (keys are lowercase TLDs, values may include or omit `whois://`).
- `includeRaw?: boolean` – Include `rawRdap`/`rawWhois` in the returned record (default `false`).
- `signal?: AbortSignal` – Optional cancellation signal. Honored by RDAP requests _and_ WHOIS sockets; an abort stops the lookup rather than falling through to the next phase.

### Timeouts and diagnostics

`lookup()` never throws for lookup failures; it resolves to a `LookupResult`:

```ts
interface LookupResult {
  ok: boolean;
  record?: DomainRecord;
  error?: string; // human-readable
  errorCode?: LookupErrorCode; // machine-readable, present when ok is false
  errorPhase?: "rdap_bootstrap" | "rdap" | "rdap_link" | "iana" | "whois";
  errorServer?: string; // RDAP URL or WHOIS host involved in the failure
  retryAfterMs?: number; // server's Retry-After, when it was the terminal failure (see below)
  attempts: LookupAttempt[]; // every network operation, in order (always present)
}
```

`errorCode` is one of `invalid_input`, `invalid_tld`, `timeout`, `aborted`, `connect_failed`, `http_error`, `rdap_unavailable`, `no_server`, `no_data`, `rate_limited`, `blocked`, `unparseable`, `unsupported_runtime`, or `unknown`. Prefer it over matching `error` text. `timeout` covers every timeout, including `deadlineMs`; `aborted` means your own `signal` fired.

- `rate_limited`: the server throttled the query (RDAP `429`, or a short WHOIS notice such as `WHOIS LIMIT EXCEEDED`). Retrying later may work.
- `blocked`: a WHOIS server refuses this client outright (e.g. `.ch`: "Requests of this client are not permitted"). Retrying will not help.
- `unparseable`: WHOIS replied with text that is neither an availability notice nor a domain record (no registrar, dates, nameservers, statuses or contacts). It is reported as a failure rather than a "registered" record.

`retryAfterMs` carries an RDAP `Retry-After` header (on `429` or `503`, as seconds or an HTTP date). It is set on the matching entry in `attempts`, and on the top-level result only when that RDAP attempt is the terminal failure, as with `rdapOnly`. Normally an RDAP failure falls through to WHOIS, so the value stays in `attempts`. The value is passed through as sent and is not capped, so clamp it before using it as a delay.

WHOIS referral hosts (from `Registrar WHOIS Server:` and similar fields) come from upstream response text, so they are validated (hostname syntax, no private/loopback/link-local IP literals) and their resolved address is checked at connect time. An unsafe, blocked or throttled referral is skipped with an entry in `record.warnings`. The first WHOIS server, from IANA or `whoisHints`, is trusted and not checked.

Each entry in `attempts` describes one operation, successful or not, so a failure that was recovered from (say, an RDAP server that was down before WHOIS answered) is still visible:

```json
{
  "phase": "whois",
  "server": "whois.example",
  "ok": false,
  "durationMs": 1503,
  "errorCode": "timeout",
  "error": "WHOIS connect timeout (whois.example)",
  "stage": "connect"
}
```

`stage` (`"connect"` or `"read"`) is set on WHOIS timeouts, and `"read"` also marks a server that accepted the connection and closed it without sending anything (`errorCode: "no_data"`, not a successful empty answer). If a WHOIS server sends some data but never closes the connection, the timeout **resolves with the partial text** instead of failing, and the attempt is marked `partial: true`.

`timeoutMs` applies to each network operation (including reading the response body), not to the lookup as a whole. Without `deadlineMs`, the worst case is roughly `timeoutMs × (1 bootstrap + N RDAP servers + up to 2 RDAP links + 1 IANA + 1 + maxWhoisReferralHops WHOIS queries)`. Set `deadlineMs` to put a hard cap on the total, e.g. for serverless functions with an execution limit:

```ts
const result = await lookup("example.sh", { timeoutMs: 4000, deadlineMs: 9000 });
if (!result.ok && result.errorCode === "timeout") {
  console.warn(result.errorPhase, result.attempts);
}
```

### `DomainRecord` schema

The exact presence of fields depends on registry/registrar data and whether RDAP or WHOIS was used.

```ts
interface DomainRecord {
  domain: string; // normalized name (unicode when available)
  tld: string; // public suffix (can be multi-label, e.g., "com", "co.uk")
  isRegistered: boolean; // availability heuristic (WHOIS) or true (RDAP)
  isIDN?: boolean; // uses punycode labels (xn--)
  unicodeName?: string; // RDAP unicodeName when provided
  punycodeName?: string; // RDAP ldhName when provided
  registry?: string; // registry operator (rarely available)
  registrar?: {
    name?: string;
    ianaId?: string;
    url?: string;
    email?: string;
    phone?: string;
    street?: string[]; // address (RDAP only)
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string; // ISO 3166-1 alpha-2, from the vCard "cc" parameter
  };
  reseller?: string;
  statuses?: Array<{
    status: string;
    description?: string;
    raw?: string;
  }>;
  creationDate?: string; // ISO 8601 (UTC)
  updatedDate?: string; // ISO 8601 (UTC)
  expirationDate?: string; // ISO 8601 (UTC)
  deletionDate?: string; // ISO 8601 (UTC)
  transferLock?: boolean; // derived from EPP statuses
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
    type:
      "registrant" | "admin" | "tech" | "billing" | "abuse" | "registrar" | "reseller" | "unknown";
    name?: string;
    kind?: "individual" | "org" | "group" | "location"; // vCard KIND (RDAP only, when provided)
    organization?: string;
    organizationUnits?: string[]; // vCard ORG levels below the organization (RDAP only)
    title?: string; // RDAP only
    role?: string; // RDAP only
    email?: string | string[];
    phone?: string | string[];
    fax?: string | string[];
    poBox?: string; // RDAP only
    street?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string; // ISO 3166-1 alpha-2; country/countryCode are resolved from each other when possible
    redacted?: boolean; // some contact data was redacted/withheld or replaced by a placeholder
    redactedFields?: Array<
      | "name"
      | "organization"
      | "email"
      | "phone"
      | "fax"
      | "street"
      | "city"
      | "state"
      | "postalCode"
      | "poBox"
      | "country"
    >; // fields that were redacted (and are therefore absent)
    privacyService?: boolean; // name/organization is a privacy/proxy service (text kept), not a redaction notice
  }>;
  privacyEnabled?: boolean; // coarse: some registrant data was redacted or is behind a privacy service (name heuristics or RFC 9537 redactions); see the registrant contact's redactedFields/privacyService for which fields
  redactions?: Array<{
    name: string; // e.g. "Registrant Email"
    prePath?: string;
    postPath?: string;
    replacementPath?: string;
    method?: string; // e.g. "emptyValue", "partialValue"
    reason?: string;
  }>; // RFC 9537 redaction metadata (RDAP only)
  whoisServer?: string; // authoritative WHOIS queried (if any)
  rdapServers?: string[]; // RDAP URLs tried (bootstrap bases and related/entity links)
  rawRdap?: unknown; // raw RDAP JSON (only when options.includeRaw)
  rawWhois?: string; // raw WHOIS text (only when options.includeRaw)
  source: "rdap" | "whois"; // which path produced data
  warnings?: string[];
}
```

### Example output

```json
{
  "domain": "example.com",
  "tld": "com",
  "isRegistered": true,
  "registrar": {
    "name": "Internet Assigned Numbers Authority",
    "ianaId": "376"
  },
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

Each network operation is bounded by `timeoutMs` (default 10s) and cancelled when it elapses (`fetch` is aborted through its `signal`; WHOIS sockets are destroyed); an optional `deadlineMs` bounds the whole lookup. All network I/O is performed with global `fetch` (RDAP) and a raw TCP socket (WHOIS).

## Development

- Build: `npm run build` ([tsdown](https://tsdown.dev/))
- Test: `npm test` ([Vitest](https://vitest.dev/))
  - By default, tests are offline/deterministic.
  - Watch mode: `npm run dev`
  - Coverage: `npm run test -- --coverage`
  - Smoke tests that hit the network are gated by `SMOKE=1`, e.g. `SMOKE=1 npm test`.
- Lint: `npm run lint` ([Oxlint](https://oxc.rs/docs/guide/usage/linter))
- Format: `npm run fmt` ([Oxfmt](https://oxc.rs/docs/guide/usage/formatter))

Project layout:

- `src/rdap/` – RDAP bootstrap, client, and normalization
- `src/whois/` – WHOIS TCP client, discovery/referral, normalization, exceptions
- `src/lib/` – utilities for dates, text parsing, domain processing, async
- `src/types.ts` – public types; `src/index.ts` re‑exports API and types
- `bin/cli.mjs` – simple CLI for quick checks

## Caveats

- WHOIS text formats vary significantly across registries/registrars; normalization is best‑effort.
- Availability detection relies on common WHOIS phrases and is not authoritative.
- Some TLDs provide no RDAP service; `rdapOnly: true` will fail for them.
- Registries may throttle or block WHOIS; respect rate limits and usage policies.
- Field presence depends on source and privacy policies (e.g., redaction/withholding).
- Public suffix detection uses `tldts` with ICANN‑only defaults (Private section is ignored). You can pass options through to `tldts` via `toRegistrableDomain`/`getDomainParts`/`getDomainTld` (e.g., `allowPrivateDomains`) to customize behavior. See: [tldts migration notes](https://github.com/remusao/tldts#migrating-from-other-libraries).

## License

[MIT](LICENSE)
