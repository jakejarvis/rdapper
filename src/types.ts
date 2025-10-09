export type LookupSource = "rdap" | "whois";

export interface RegistrarInfo {
  name?: string;
  ianaId?: string;
  url?: string;
  email?: string;
  phone?: string;
}

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

export interface Nameserver {
  host: string;
  ipv4?: string[];
  ipv6?: string[];
}

export interface StatusEvent {
  status: string;
  description?: string;
  raw?: string;
}

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

export interface LookupOptions {
  /** Total timeout budget */
  timeoutMs?: number;
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
  /** Override IANA bootstrap */
  customBootstrapUrl?: string;
  /** Override/add authoritative WHOIS per TLD */
  whoisHints?: Record<string, string>;
  /** Include rawRdap/rawWhois in results (default false) */
  includeRaw?: boolean;
  /** Optional cancellation signal */
  signal?: AbortSignal;
}

export interface LookupResult {
  ok: boolean;
  record?: DomainRecord;
  error?: string;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
