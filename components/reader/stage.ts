/**
 * The PDF reader's box (V42): the rest of the viewport under the page header
 * and the document's back bar, ending above the floating dock or tab bar
 * (PageFrame's FLOATING_BAR_CLEARANCE), so the page bar is never under it.
 * Phones get more room: their page header wraps taller.
 * The loading shell and the reader share it, so nothing jumps on open.
 */
export const STAGE_BOX = "h-[calc(var(--app-h)-20.75rem)] min-h-[420px] rounded-card md:h-[calc(var(--app-h)-18.5rem)]";
