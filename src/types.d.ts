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
  domain: string;
  tld: string;
  isIDN?: boolean;
  unicodeName?: string;
  punycodeName?: string;
  registry?: string; // Registry operator if available
  registrar?: RegistrarInfo;
  reseller?: string;
  statuses?: StatusEvent[]; // EPP statuses
  creationDate?: string; // ISO 8601
  updatedDate?: string; // ISO 8601
  expirationDate?: string; // ISO 8601
  deletionDate?: string; // ISO 8601
  transferLock?: boolean;
  dnssec?: {
    enabled: boolean;
    dsRecords?: Array<{
      keyTag?: number;
      algorithm?: number;
      digestType?: number;
      digest?: string;
    }>;
  };
  nameservers?: Nameserver[];
  contacts?: Contact[];
  whoisServer?: string; // authoritative WHOIS queried (if any)
  rdapServers?: string[]; // RDAP base URLs tried
  rawRdap?: any; // raw RDAP JSON
  rawWhois?: string; // raw WHOIS text (last authoritative)
  source: LookupSource; // which source produced data
  fetchedAt: string; // ISO 8601
  warnings?: string[];
}

export interface LookupOptions {
  timeoutMs?: number; // total timeout budget
  rdapOnly?: boolean; // don't fall back to WHOIS
  whoisOnly?: boolean; // don't attempt RDAP
  followWhoisReferral?: boolean; // follow referral server (default true)
  customBootstrapUrl?: string; // override IANA bootstrap
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
