/**
 * [ytaf] Stand-ins for the DeArrow extension modules that titleFormatter.js
 * imports. Only formatTitleInternal() is called from here, and it takes every
 * setting as an argument, so these just need to exist.
 */
export const TitleFormatting = {
  Disable: -1,
  CapitalizeWords: 0,
  TitleCase: 1,
  SentenceCase: 2,
  LowerCase: 3,
  FirstLetterUppercase: 4
};

const Config = { config: { onlyTitleCaseInEnglish: false, titleFormatting: TitleFormatting.Disable } };
export default Config;

export const getTitleFormatting = async () => Config.config.titleFormatting;
export const shouldCleanEmojis = async () => false;
export const chromeP = null;

/**
 * [ytaf] The formatter's \p{...} regexes are built from strings at runtime.
 * As literals, Babel expands them into enormous character classes for the
 * legacy build (~200 KB); browsers older than Chrome 64 (webOS 4 and below)
 * can't run them at all, so formatting is switched off there instead.
 */
export const unicodeRegExpSupported = (() => {
  try {
    new RegExp('\\p{L}', 'u');
    return true;
  } catch {
    return false;
  }
})();

const regExpCache = new Map();
export function uRegExp(source, flags) {
  // Global regexes carry lastIndex state, so only the others are shared.
  if (flags.indexOf('g') !== -1) return new RegExp(source, flags);
  const key = flags + source;
  let re = regExpCache.get(key);
  if (!re) regExpCache.set(key, (re = new RegExp(source, flags)));
  return re;
}
