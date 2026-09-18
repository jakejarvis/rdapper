/**
 * The data source used to retrieve domain information.
 *
 * - `rdap`: Data was retrieved via RDAP (Registration Data Access Protocol)
 * - `whois`: Data was retrieved via WHOIS (port 43)
 */
export type LookupSource = "rdap" | "whois";

/**
 * Domain registrar information.
 *
 * Contains identifying details about the registrar responsible for the domain registration.
 * Fields may be incomplete depending on the data source and registry policies.
 */
export interface RegistrarInfo {
  /** Registrar name (e.g., "GoDaddy.com, LLC") */
  name?: string;
  /** IANA-assigned registrar ID */
  ianaId?: string;
  /** Registrar website URL */
  url?: string;
  /** Registrar contact email address */
  email?: string;
  /** Registrar contact phone number */
  phone?: string;
}

/**
 * Contact information for various roles associated with a domain.
 *
 * Contacts may represent individuals or organizations responsible for different
 * aspects of domain management. Availability and completeness of contact data
 * varies by TLD, registrar, and privacy policies (GDPR, WHOIS privacy services).
 */
export interface Contact {
  type:
    | "registrant"
    | "admin"
    | "tech"
    | "billing"
    | "abuse"
    | "registrar"
    | "reseller"
    | "unknown";
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
}

/**
 * DNS nameserver information.
 *
 * Represents a nameserver authoritative for the domain, including its hostname
 * and optional glue records (IP addresses).
 */
export interface Nameserver {
  /** Nameserver hostname (e.g., "ns1.example.com") */
  host: string;
  /** IPv4 glue records, if provided */
  ipv4?: string[];
  /** IPv6 glue records, if provided */
  ipv6?: string[];
}

/**
 * Domain status information.
 *
 * Represents EPP status codes and registry-specific statuses that indicate
 * the operational state and restrictions on a domain.
 *
 * Common EPP statuses include: clientTransferProhibited, serverHold,
 * serverDeleteProhibited, etc.
 *
 * @see {@link https://www.icann.org/resources/pages/epp-status-codes-2014-06-16-en ICANN EPP Status Codes}
 */
export interface StatusEvent {
  /** Normalized status code (e.g., "clientTransferProhibited") */
  status: string;
  /** Human-readable description of the status, if available */
  description?: string;
  /** Original raw status string from the source */
  raw?: string;
}

/**
 * Normalized domain registration record.
 *
 * This is the primary data structure returned by domain lookups. It provides a unified
 * view of domain registration data regardless of whether the information was obtained
 * via RDAP or WHOIS.
 *
 * Field availability varies by:
 * - TLD and registry policies
 * - Data source (RDAP typically more structured than WHOIS)
 * - Privacy protections (GDPR, WHOIS privacy services)
 * - Registrar practices
 *
 * @example
 * ```ts
 * import { lookup } from 'rdapper';
 *
 * const { ok, record } = await lookup('example.com');
 * if (ok && record) {
 *   console.log(record.registrar?.name);  // "Example Registrar, Inc."
 *   console.log(record.isRegistered);      // true
 *   console.log(record.source);            // "rdap"
 * }
 * ```
 */
export interface DomainRecord {
  /** Normalized domain name */
  domain: string;
  /** Terminal TLD */
  tld: string;
  /** Whether the domain is registered */
  isRegistered: boolean;
  /** Whether the domain is internationalized (IDN) */
  isIDN?: boolean;
  /** Unicode name */
  unicodeName?: string;
  /** Punycode name */
  punycodeName?: string;
  /** Registry operator */
  registry?: string;
  /** Registrar */
  registrar?: RegistrarInfo;
  /** Reseller (if applicable) */
  reseller?: string;
  /** EPP status codes */
  statuses?: StatusEvent[];
  /** Creation date in ISO 8601 */
  creationDate?: string;
  /** Updated date in ISO 8601 */
  updatedDate?: string;
  /** Expiration date in ISO 8601 */
  expirationDate?: string;
  /** Deletion date in ISO 8601 */
  deletionDate?: string;
  /** Transfer lock */
  transferLock?: boolean;
  /** DNSSEC data (if available) */
  dnssec?: {
    enabled: boolean;
    dsRecords?: Array<{
      keyTag?: number;
      algorithm?: number;
      digestType?: number;
      digest?: string;
    }>;
  };
  /** Nameservers */
  nameservers?: Nameserver[];
  /** Contacts (registrant, admin, tech, billing, abuse, etc.) */
  contacts?: Contact[];
  /** Best guess as to whether registrant is redacted based on keywords */
  privacyEnabled?: boolean;
  /** Authoritative WHOIS queried (if any) */
  whoisServer?: string;
  /** RDAP base URLs tried */
  rdapServers?: string[];
  /** Raw RDAP JSON */
  rawRdap?: unknown;
  /** Raw WHOIS text (last authoritative) */
  rawWhois?: string;
  /** Which source produced data */
  source: LookupSource;
  /** Warnings generated during lookup */
  warnings?: string[];
}

/**
 * RDAP bootstrap JSON format as published by IANA at https://data.iana.org/rdap/dns.json
 *
 * This interface describes the structure of the RDAP bootstrap registry, which maps
 * top-level domains to their authoritative RDAP servers.
 *
 * @example
 * ```json
 * {
 *   "version": "1.0",
 *   "publication": "2025-01-15T12:00:00Z",
 *   "description": "RDAP Bootstrap file for DNS top-level domains",
 *   "services": [
 *     [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
 *     [["org"], ["https://rdap.publicinterestregistry.org/"]]
 *   ]
 * }
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc7484 RFC 7484 - Finding the Authoritative RDAP Service}
 */
export interface BootstrapData {
  /** Bootstrap file format version */
  version: string;
  /** ISO 8601 timestamp of when this bootstrap data was published */
  publication: string;
  /** Optional human-readable description of the bootstrap file */
  description?: string;
  /**
   * Service mappings array. Each entry is a tuple of [TLDs, base URLs]:
   * - First element: array of TLD strings (e.g., ["com", "net"])
   * - Second element: array of RDAP base URL strings (e.g., ["https://rdap.verisign.com/com/v1/"])
   */
  services: string[][][];
}

/**
 * Configuration options for domain lookups.
 *
 * Controls the lookup behavior, including which protocols to use (RDAP/WHOIS),
 * timeout settings, referral following, and caching options.
 *
 * @example
 * ```ts
 * import { lookup } from 'rdapper';
 *
 * // RDAP-only lookup for edge runtime compatibility
 * const result = await lookup('example.com', {
 *   rdapOnly: true,
 *   timeoutMs: 10000
 * });
 *
 * // Cached bootstrap data for high-volume scenarios
 * const cachedBootstrap = await getFromCache();
 * const result = await lookup('example.com', {
 *   customBootstrapData: cachedBootstrap,
 *   includeRaw: true
 * });
 * ```
 */
export interface LookupOptions {
  /**
   * Timeout for each individual network operation (default 10000). A lookup makes several
   * sequential operations, so its worst-case duration is a multiple of this; use `deadlineMs`
   * to bound the whole lookup. A value that is not a finite number > 0 disables the timeout.
   */
  timeoutMs?: number;
  /**
   * Overall deadline for the entire lookup in milliseconds (default: none). When it elapses,
   * in-flight requests and WHOIS sockets are cancelled and the result has `errorCode: "timeout"`.
   */
  deadlineMs?: number;
  /** Don't fall back to WHOIS */
  rdapOnly?: boolean;
  /** Don't attempt RDAP */
  whoisOnly?: boolean;
  /** Follow referral server (default true) */
  followWhoisReferral?: boolean;
  /** Maximum registrar WHOIS referral hops (default 2) */
  maxWhoisReferralHops?: number;
  /** Follow RDAP related/entity links (default true) */
  rdapFollowLinks?: boolean;
  /** Maximum RDAP related link fetches (default 2) */
  maxRdapLinkHops?: number;
  /** RDAP link rels to consider (default ["related","entity","registrar","alternate"]) */
  rdapLinkRels?: string[];
  /**
   * Pre-loaded RDAP bootstrap data to use instead of fetching from IANA.
   *
   * Pass your own cached version of https://data.iana.org/rdap/dns.json to control
   * caching behavior and avoid redundant network requests. This is useful when you want
   * to cache the bootstrap data in Redis, memory, filesystem, or any other caching layer.
   *
   * If provided, this takes precedence over `customBootstrapUrl` and the default IANA URL.
   *
   * @example
   * ```ts
   * import { lookup, type BootstrapData } from 'rdapper';
   *
   * // Fetch and cache the bootstrap data yourself
   * const bootstrapData: BootstrapData = await fetchFromCache()
   *   ?? await fetchAndCache('https://data.iana.org/rdap/dns.json');
   *
   * // Pass the cached data to rdapper
   * const result = await lookup('example.com', {
   *   customBootstrapData: bootstrapData
   * });
   * ```
   *
   * @see {@link BootstrapData} for the expected data structure
   */
  customBootstrapData?: BootstrapData;
  /** Override IANA bootstrap URL (ignored if customBootstrapData is provided) */
  customBootstrapUrl?: string;
  /**
   * Custom fetch implementation to use for all HTTP requests.
   *
   * Provides complete control over how HTTP requests are made, enabling advanced use cases:
   * - **Caching**: Cache bootstrap data, RDAP responses, and related link responses
   * - **Logging**: Log all outgoing requests and responses for monitoring
   * - **Retry Logic**: Implement custom retry strategies with exponential backoff
   * - **Rate Limiting**: Control request frequency to respect API limits
   * - **Proxies/Auth**: Route requests through proxies or add authentication headers
   * - **Testing**: Inject mock responses for testing without network calls
   *
   * The custom fetch will be used for:
   * - RDAP bootstrap registry requests (unless `customBootstrapData` is provided)
   * - RDAP domain lookup requests
   * - RDAP related/entity link requests
   *
   * If not provided, the global `fetch` function is used (Node.js 20+ or browser).
   *
   * @example
   * ```ts
   * import { lookup } from 'rdapper';
   *
   * // Example 1: Simple in-memory cache
   * const cache = new Map<string, Response>();
   * const cachedFetch: typeof fetch = async (input, init) => {
   *   const key = typeof input === 'string' ? input : input.toString();
   *   if (cache.has(key)) return cache.get(key)!.clone();
   *   const response = await fetch(input, init);
   *   cache.set(key, response.clone());
   *   return response;
   * };
   *
   * await lookup('example.com', { customFetch: cachedFetch });
   *
   * // Example 2: Request logging
   * const loggingFetch: typeof fetch = async (input, init) => {
   *   const url = typeof input === 'string' ? input : input.toString();
   *   console.log('[Fetch]', url);
   *   const response = await fetch(input, init);
   *   console.log('[Response]', response.status, url);
   *   return response;
   * };
   *
   * await lookup('example.com', { customFetch: loggingFetch });
   * ```
   *
   * @see {@link FetchLike} for the expected function signature
   */
  customFetch?: FetchLike;
  /** Override/add authoritative WHOIS per TLD */
  whoisHints?: Record<string, string>;
  /** Include rawRdap/rawWhois in results (default false) */
  includeRaw?: boolean;
  /** Optional cancellation signal */
  signal?: AbortSignal;
}

/**
 * Result of a domain lookup operation.
 *
 * Provides a structured response indicating success or failure, with either
 * a normalized domain record or an error message.
 *
 * @example
 * ```ts
 * import { lookup } from 'rdapper';
 *
 * const result = await lookup('example.com');
 * if (result.ok) {
 *   console.log('Domain:', result.record.domain);
 *   console.log('Registered:', result.record.isRegistered);
 * } else {
 *   console.error('Lookup failed:', result.error);
 * }
 * ```
 */
export interface LookupResult {
  /** Whether the lookup completed successfully */
  ok: boolean;
  /** The normalized domain record, present when ok is true */
  record?: DomainRecord;
  /** Error message describing why the lookup failed, present when ok is false */
  error?: string;
  /** Machine-readable failure reason, present when ok is false */
  errorCode?: LookupErrorCode;
  /** Phase in which the failure occurred, when known */
  errorPhase?: LookupAttempt["phase"];
  /** Server (RDAP URL or WHOIS host) involved in the failure, when known */
  errorServer?: string;
  /** Every network attempt made during the lookup, in order (successes and failures) */
  attempts: LookupAttempt[];
}

/**
 * Machine-readable reason a lookup (or one attempt within it) failed.
 *
 * - `timeout`: any timeout, including the overall `deadlineMs`
 * - `aborted`: the caller's `AbortSignal` fired
 * - `connect_failed`: network-level failure (ECONNREFUSED, ECONNRESET, ENOTFOUND, ...)
 * - `http_error`: RDAP responded with a non-2xx status other than 404
 * - `rdap_unavailable`: `rdapOnly` was set and no RDAP server worked
 * - `no_server`: IANA answered but no WHOIS server exists for the TLD
 * - `unsupported_runtime`: WHOIS needs `node:net`, which this runtime lacks
 */
export type LookupErrorCode =
  | "invalid_input"
  | "invalid_tld"
  | "timeout"
  | "aborted"
  | "connect_failed"
  | "http_error"
  | "rdap_unavailable"
  | "no_server"
  | "no_data"
  | "unsupported_runtime"
  | "unknown";

/** One network operation performed during a lookup. */
export interface LookupAttempt {
  phase: "rdap_bootstrap" | "rdap" | "rdap_link" | "iana" | "whois";
  /** RDAP base/link URL or WHOIS host */
  server: string;
  ok: boolean;
  durationMs: number;
  errorCode?: LookupErrorCode;
  error?: string;
  /** WHOIS failures only: `connect` if the socket never connected; `read` if it connected but sent nothing (timeout, or closed without a response, which is `no_data`) */
  stage?: "connect" | "read";
  /** WHOIS only: the read timed out after some data arrived, so the text is partial */
  partial?: boolean;
}

/**
 * Fetch-compatible function signature.
 *
 * Used internally for dependency injection and testing. Matches the signature
 * of the global `fetch` function available in Node.js 20+ and browsers.
 */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
