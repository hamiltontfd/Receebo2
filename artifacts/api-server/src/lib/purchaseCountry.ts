import { countries } from "countries-list";

/** Account markets and pseudo regions (EU, XX) are not countries. */
export function validPurchaseCountry(value: unknown): boolean {
  return value === null || value === undefined ||
    (typeof value === "string" && Object.hasOwn(countries, value));
}
