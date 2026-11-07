// Brand logos for accounts, matched on the account's name. Accounts have no
// logo field: a known brand gets its mark, every other account keeps the icon
// for its kind. Logos are local files in public/, so nothing is fetched from a
// third party.

const LOGOS: readonly { match: RegExp; src: string }[] = [
  // "OPay", "opay", "O-Pay", "O Pay", "OPay wallet", but not "Opayo".
  { match: /(?:^|[^a-z0-9])o[-\s]?pay(?![a-z0-9])/i, src: "/opay-logo.jpg" },
];

/** The logo for an account named `name`, or null when it isn't a known brand. */
export function accountLogo(name: string): string | null {
  return LOGOS.find((l) => l.match.test(name))?.src ?? null;
}
