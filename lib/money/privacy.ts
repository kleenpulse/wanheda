// Privacy mode (T38): every money figure shown as dots at once, for showing
// the screen to someone (user 2026-11-05: dots, not blur). Device-local
// (localStorage), never synced: it is about who is looking at this screen.
// The boot script sets the attribute before first paint, and CSS keeps any
// figure React hasn't masked yet invisible, so a reload never flashes one.

export const PRIVACY_KEY = "wanheda-privacy";
export const PRIVACY_ATTR = "data-privacy";
/** The shortcut, while no text field has focus. */
export const PRIVACY_SHORTCUT = "h";

/** The dots a hidden figure shows. Always this many, so not even the size of an amount shows. */
export const MASK = "••••";

const DIGITS = /\d[\d.,  ]*/g;

/**
 * A formatted amount with its figure masked: "-₦4,500.00" → "-₦••••",
 * "$15.49" → "$••••". The sign and currency stay; every digit goes.
 */
export function maskMoney(text: string): string {
  let first = true;
  return text.replace(DIGITS, () => {
    if (!first) return "";
    first = false;
    return MASK;
  });
}

export function privacyBootScript(): string {
  return `try{if(localStorage.getItem("${PRIVACY_KEY}")==="1")document.documentElement.setAttribute("${PRIVACY_ATTR}","")}catch(e){}`;
}
