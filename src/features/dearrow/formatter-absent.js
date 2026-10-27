// What the legacy build (webOS 3 to 6) has in place of formatter.js
// (webpack.config.js): no title formatting, so the panel shows no formatting
// rows and titles keep the case they were written in. The one thing the
// formatter does to every title is kept: a submitter's ">" before a word
// (which tells the formatter to leave that word alone) is taken out.

/** Whether titles can be formatted: not in this build. */
export const formattingSupported = false;

/** The formatter's modes, as formatter.js names them; only Disable is ever used here. */
export const TitleFormatting = { Disable: -1 };

/**
 * The title with the ">" markers taken out and the ends trimmed, as the
 * formatter's own unformatted path leaves it (cleanUnformattedTitle).
 */
export function formatTitleInternal(title) {
  return Promise.resolve(title.replace(/(^|\s)>(\S)/g, '$1$2').trim());
}
