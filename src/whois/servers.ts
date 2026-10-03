// Curated authoritative WHOIS servers by TLD (exceptions to default/referral logic)
// Source of truth checked against IANA delegation records; prefer RDAP first.
export const WHOIS_TLD_EXCEPTIONS = {
  // gTLDs (port-43 still available at registry)
  com: "whois.verisign-grs.com",
  net: "whois.verisign-grs.com",
  org: "whois.publicinterestregistry.org", // PIR
  biz: "whois.nic.biz",
  name: "whois.nic.name",
  edu: "whois.educause.edu",
  gov: "whois.nic.gov", // was whois.dotgov.gov

  // ccTLDs & other TLDs with working port-43 WHOIS
  de: "whois.denic.de",
  jp: "whois.jprs.jp",
  fr: "whois.nic.fr",
  it: "whois.nic.it",
  pl: "whois.dns.pl",
  nl: "whois.domain-registry.nl",
  be: "whois.dns.be",
  se: "whois.iis.se",
  no: "whois.norid.no",
  fi: "whois.fi",
  cz: "whois.nic.cz",
  es: "whois.nic.es",
  br: "whois.registro.br",
  ca: "whois.cira.ca",
  dk: "whois.punktum.dk", // was whois.dk-hostmaster.dk
  hk: "whois.hkirc.hk",
  sg: "whois.sgnic.sg",
  in: "whois.nixiregistry.in", // was whois.registry.in
  nz: "whois.irs.net.nz", // was whois.srs.net.nz
  ch: "whois.nic.ch",
  li: "whois.nic.li",
  io: "whois.nic.io",
  ai: "whois.nic.ai",
  ru: "whois.tcinet.ru",
  su: "whois.tcinet.ru",
  us: "whois.nic.us",
  co: "whois.nic.co",
  me: "whois.nic.me",
  tv: "whois.nic.tv",
  cc: "ccwhois.verisign-grs.com",
  eu: "whois.eu",
  au: "whois.auda.org.au",
  kr: "whois.kr",
  tw: "whois.twnic.net.tw",
  uk: "whois.nic.uk",
  nu: "whois.iis.nu",
  "xn--p1ai": "whois.tcinet.ru", // .рф
} as Record<string, string>;

/**
 * Time zones of registries whose WHOIS prints local times without a zone, each confirmed by
 * comparing its WHOIS dates with its RDAP ones. Other registries' zone-less times are read as UTC.
 */
export const WHOIS_TIME_ZONES: Record<string, string> = {
  cz: "Europe/Prague",
  no: "Europe/Oslo",
  pl: "Europe/Warsaw",
  th: "Asia/Bangkok",
};
