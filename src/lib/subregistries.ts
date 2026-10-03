/** Where to look up names registered under a sub-registry suffix. */
export interface SubRegistry {
  /** RDAP base URL (with trailing slash), if the operator publishes RDAP */
  rdap?: string;
  /** WHOIS server, if the operator publishes WHOIS */
  whois?: string;
}

// CentralNic's entries in the Public Suffix List (plus gr.com and co.com, which it also serves),
// each confirmed to answer with real domain objects at rdap.centralnic.com/<suffix>/.
const CENTRALNIC_SUFFIXES = [
  "ae.org",
  "br.com",
  "cn.com",
  "co.com",
  "com.de",
  "com.se",
  "de.com",
  "eu.com",
  "gb.net",
  "gr.com",
  "hu.net",
  "jp.net",
  "jpn.com",
  "mex.com",
  "ru.com",
  "sa.com",
  "se.net",
  "uk.com",
  "uk.net",
  "us.com",
  "za.bz",
  "za.com",
];

/**
 * Second-level suffixes run as registries of their own: a name like google.uk.com is registered
 * with the suffix's operator, not the TLD registry, and the IANA bootstrap doesn't list them.
 */
export const SUB_REGISTRIES: Readonly<Record<string, SubRegistry>> = {
  ...Object.fromEntries(
    CENTRALNIC_SUFFIXES.map((suffix) => [
      suffix,
      { rdap: `https://rdap.centralnic.com/${suffix}/`, whois: "whois.centralnic.com" },
    ]),
  ),
  // Jisc runs ac.uk. Nominet's RDAP answers 404 for its names (which reads as "not registered"),
  // and Nominet's WHOIS answers with the ac.uk delegation itself.
  "ac.uk": { whois: "whois.ja.net" },
  // Nor does Nominet hold nhs.uk or police.uk names ("Nominet is not the registry for this domain
  // name"), and their operators publish neither RDAP nor WHOIS
  "nhs.uk": {},
  "police.uk": {},
};

/** The sub-registry suffix a domain falls under (e.g. "uk.com" for google.uk.com), if any. */
export function getSubRegistrySuffix(domain: string): string | undefined {
  const labels = domain.trim().toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length < 3) return undefined;
  const suffix = labels.slice(-2).join(".");
  return Object.hasOwn(SUB_REGISTRIES, suffix) ? suffix : undefined;
}
