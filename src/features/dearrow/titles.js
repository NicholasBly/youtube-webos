// DeArrow's titles: the crowdsourced one when it is trusted, else YouTube's
// own, either formatted as Title formatting says by the extension's own
// formatter (formatter.js; the legacy build has none, and keeps titles as
// written).
import { configRead } from '../../core/config.js';
import { formatTitleInternal, TitleFormatting, formattingSupported } from './formatter.js';

/** Whether titles can be formatted here: the webOS 22+ build (formatter.js). */
export const titleFormattingSupported = formattingSupported;

const FORMATTING = {
  disable: TitleFormatting.Disable,
  title_case: TitleFormatting.TitleCase,
  sentence_case: TitleFormatting.SentenceCase,
  lower_case: TitleFormatting.LowerCase,
  first_letter_uppercase: TitleFormatting.FirstLetterUppercase,
  capitalize_words: TitleFormatting.CapitalizeWords
};

/**
 * A submission DeArrow would show: not the original, and locked or voted
 * zero or above.
 */
export function isTrusted(entry) {
  return !!entry && !entry.original && (entry.locked || entry.votes >= 0);
}

/**
 * `title` formatted as Title formatting says, the same for a crowdsourced one
 * (`isCustom`, whose ">" markers keep a word as written) as for YouTube's;
 * resolves with the text.
 */
function formatTitle(title, isCustom) {
  const supported = titleFormattingSupported;
  const formatting = supported ? FORMATTING[configRead('dearrowTitleFormatting')] : undefined;
  return formatTitleInternal(
    title,
    isCustom,
    formatting === undefined ? TitleFormatting.Disable : formatting,
    supported && !!configRead('dearrowCleanEmojis')
  );
}

/** The crowdsourced title the settings let a video show: the top one when it is trusted, else null. */
export function crowdsourcedTitle(video) {
  if (!configRead('dearrowCrowdTitles')) return null;
  const custom = video.raw && video.raw.titles ? video.raw.titles[0] : null;
  return isTrusted(custom) ? custom : null;
}

/**
 * The title a video's tiles should show, or null for YouTube's own: the top
 * crowdsourced one when it is trusted, else the original when formatting
 * changes it.
 */
export async function resolveTitle(video) {
  const custom = crowdsourcedTitle(video);
  if (custom) return formatTitle(custom.title, true);

  if (!video.original) return null;
  const formatted = await formatTitle(video.original, false);
  return formatted !== video.original ? formatted : null;
}
