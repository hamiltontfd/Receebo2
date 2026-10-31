import { getAppLocale, type AppLocale } from "./locale";
import { appText } from "./appCopy";
/** ISO 3166-1 alpha-2 codes for real countries and territories (no EU/XX pseudo codes). */
export const ISO_COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

const CODE_SET = new Set(ISO_COUNTRY_CODES);

const displayNames = new Map<AppLocale, Intl.DisplayNames>();
function names(locale: AppLocale): Intl.DisplayNames | null {
  const cached = displayNames.get(locale);
  if (cached) return cached;
  try {
    const result = new Intl.DisplayNames([locale], { type: "region" });
    displayNames.set(locale, result);
    return result;
  } catch {
    return null;
  }
}

/** Normalise a stored value to a valid ISO code, or null (Unknown). Never maps EU or infers. */
export function normalizeCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const up = code.trim().toUpperCase();
  return CODE_SET.has(up) ? up : null;
}

export function countryName(code: string | null | undefined, locale: AppLocale = getAppLocale()): string {
  const c = normalizeCountry(code);
  if (!c) return code ? code.toUpperCase() : appText("Unknown", [], locale);
  return names(locale)?.of(c) ?? c;
}

export interface CountryOption { code: string; name: string }

const cached = new Map<AppLocale, CountryOption[]>();
export function countryOptions(locale: AppLocale = getAppLocale()): CountryOption[] {
  let options = cached.get(locale);
  if (!options) {
    options = ISO_COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
    cached.set(locale, options);
  }
  return options;
}
