/**
 * The timeout for HTTP requests in milliseconds. Defaults to 10 seconds.
 */
export const DEFAULT_TIMEOUT_MS = 10_000 as const;

/**
 * The default URL for the IANA RDAP bootstrap file.
 *
 * @see {@link https://data.iana.org/rdap/dns.json IANA RDAP Bootstrap File (dns.json)}
 */
export const DEFAULT_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
