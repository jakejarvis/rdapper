// Country name <-> ISO 3166-1 alpha-2 resolution, backed by a static table (see
// scripts/generate-countries.mjs) so results don't vary with the runtime's ICU version.
import { COUNTRY_NAMES } from "./countries-data";

const ALIASES: Record<string, string> = {
  usa: "US",
  "u.s.a.": "US",
  "united states of america": "US",
  america: "US",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  russia: "RU",
  "russian federation": "RU",
  korea: "KR",
  "south korea": "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  vietnam: "VN",
  "viet nam": "VN",
  czechia: "CZ",
  "czech republic": "CZ",
  turkey: "TR",
  turkiye: "TR",
  iran: "IR",
  "islamic republic of iran": "IR",
  syria: "SY",
  taiwan: "TW",
  "hong kong sar": "HK",
  "hong kong sar china": "HK",
  "the netherlands": "NL",
  holland: "NL",
  uae: "AE",
  burma: "MM",
  myanmar: "MM",
  "myanmar burma": "MM",
  "ivory coast": "CI",
  "cote d'ivoire": "CI",
  laos: "LA",
  moldova: "MD",
  macedonia: "MK",
  "north macedonia": "MK",
  palestine: "PS",
  "cape verde": "CV",
  swaziland: "SZ",
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

let nameToCode: Map<string, string> | undefined;

/** English country name for an ISO 3166-1 alpha-2 code, or undefined if unknown. */
export function countryNameFromCode(code: string): string | undefined {
  return COUNTRY_NAMES[code.trim().toUpperCase()];
}

/** ISO 3166-1 alpha-2 code for a country name (or the code itself), or undefined if unknown. */
export function countryCodeFromName(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (/^[A-Za-z]{2}$/.test(v)) {
    return countryNameFromCode(v) ? v.toUpperCase() : ALIASES[v.toLowerCase()];
  }
  if (!nameToCode) {
    nameToCode = new Map(
      Object.entries(COUNTRY_NAMES).map(([code, name]) => [normalize(name), code]),
    );
  }
  const key = normalize(v);
  return nameToCode.get(key) ?? ALIASES[key];
}

/**
 * Fill in whichever of country/countryCode is missing. A 2-letter `country` is treated as a code.
 */
export function resolveCountry(
  country: string | undefined,
  countryCode: string | undefined,
): { country?: string; countryCode?: string } {
  let name = country?.trim() || undefined;
  let code = countryCode?.trim().toUpperCase() || undefined;
  if (!code && name) {
    code = countryCodeFromName(name);
    if (code && /^[A-Za-z]{2}$/.test(name)) name = undefined; // value was just the code
  }
  if (!name && code) name = countryNameFromCode(code);
  return { country: name, countryCode: code };
}
