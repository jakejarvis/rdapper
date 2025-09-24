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

  // CentralNic-operated public SLD zones (still WHOIS @ centralnic)
  "uk.com": "whois.centralnic.com",
  "uk.net": "whois.centralnic.com",
  "gb.com": "whois.centralnic.com",
  "gb.net": "whois.centralnic.com",
  "eu.com": "whois.centralnic.com",
  "us.com": "whois.centralnic.com",
  "se.com": "whois.centralnic.com",
  "de.com": "whois.centralnic.com",
  "br.com": "whois.centralnic.com",
  "ru.com": "whois.centralnic.com",
  "cn.com": "whois.centralnic.com",
  "sa.com": "whois.centralnic.com",
  "co.com": "whois.centralnic.com",
} as Record<string, string>;
