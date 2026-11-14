/**
 * Vendored from DeArrow (GPL-3.0) - https://github.com/ajayyy/DeArrow
 * src/titles/titleFormatter.ts @ 482cf997c91efcf226e1c7852db186cc29a75474
 *
 * TypeScript types stripped with @babel/plugin-transform-typescript. Other
 * changes are marked [ytaf]: imports point at ./shim, language detection is
 * disabled, the extension-page localisation helpers are dropped, and every
 * \p{...} regex literal is built at runtime via uRegExp() (see shim.js).
 */
// [ytaf] File extensions on the imports: an ES module package resolves them as written.
import Config, { TitleFormatting, getTitleFormatting, shouldCleanEmojis, chromeP, uRegExp } from "./shim.js";
import { acronymBlocklist, allowlistedStartOfWords, allowlistedWords, fancyTextConversions, notStartOfSentence, titleCaseNotCapitalized } from "./titleFormatterData.js";



// [ytaf] No language detection on the TV: cld3 is a large wasm module and
// chrome.i18n does not exist here. Every title is treated as English.
const cld = null;

/**
 * Useful regex expressions:
 * 
 * Characters: \p{L}
 * Upper: \p{Lu}
 * Lower: \p{Ll}
 * 
 * https://javascript.info/regexp-unicode#example-hexadecimal-numbers
 * https://util.unicode.org/UnicodeJsps/character.jsp
 */

export async function formatTitle(title, isCustom, videoID) {
  return formatTitleInternal(title, isCustom, await getTitleFormatting(videoID), await shouldCleanEmojis(videoID), Config.config.formatCustomTitles, Config.config.formatOriginalTitles);
}

export async function formatTitleDefaultSettings(title, isCustom) {
  return await formatTitleInternal(title, isCustom, Config.config.titleFormatting, Config.config.shouldCleanEmojis, Config.config.formatCustomTitles, Config.config.formatOriginalTitles);
}

export async function formatTitleInternal(title, isCustom, titleFormatting, shouldCleanEmojis, formatCustomTitles = true, formatOriginalTitles = true) {
  if (shouldCleanEmojis) {
    title = cleanFancyText(cleanEmojis(title));
  }

  if (!formatCustomTitles && isCustom || !formatOriginalTitles && !isCustom) {
    titleFormatting = TitleFormatting.Disable;
  }

  switch (titleFormatting) {
    case TitleFormatting.CapitalizeWords:
      return await toCapitalizeCase(title, isCustom);
    case TitleFormatting.TitleCase:
      return await toTitleCase(title, isCustom);
    case TitleFormatting.SentenceCase:
      return await toSentenceCase(title, isCustom);
    case TitleFormatting.LowerCase:
      return await toLowerCaseTitle(title);
    case TitleFormatting.FirstLetterUppercase:
      return await toFirstLetterUppercase(title);
    default:{
        return cleanUnformattedTitle(title);
      }
  }
}

export async function toLowerCaseTitle(str) {
  const words = str.split(" ");
  const { isGreek, isTurkiq } = await getLangInfo(str);

  let result = "";
  for (const word of words) {
    if (!isGreek && (await greekLetterAllowed(word))) {
      result += word + " ";
    } else {
      result += (await toLowerCase(word, isTurkiq)) + " ";
    }
  }

  return cleanResultingTitle(result);
}

export async function toFirstLetterUppercase(str) {
  const words = str.split(" ");
  const { isGreek, isTurkiq } = await getLangInfo(str);

  let result = "";
  let index = 0;
  for (const word of words) {
    if (!isGreek && (await greekLetterAllowed(word))) {
      result += word + " ";
    } else if (startOfSentence(index, words) && !isNumberThenLetter(word)) {
      result += (await capitalizeFirstLetter(word, isTurkiq)) + " ";
    } else {
      result += (await toLowerCase(word, isTurkiq)) + " ";
    }

    index++;
  }

  return cleanResultingTitle(result);
}

export async function toSentenceCase(str, isCustom) {
  const words = str.split(" ");
  const inTitleCase = isInTitleCase(words);
  const mostlyAllCaps = isMostlyAllCaps(words);
  const { isGreek, isTurkiq } = await getLangInfo(str);

  let result = "";
  let index = 0;
  for (const word of words) {
    const trustCaps = shouldTrustCaps(mostlyAllCaps, words, index);

    if (word.match(uRegExp("^[Ii]$|^[Ii]['\u2019][\\p{L}]{1,3}$", "u"))) {
      result += (await capitalizeFirstLetter(word, isTurkiq)) + " ";
    } else if (forceKeepFormatting(word) ||
    isAcronymStrict(word) ||
    (!inTitleCase || !isWordCapitalCase(word, false)) && trustCaps && isAcronym(word) ||
    !inTitleCase && trustCaps && word.length === 1 ||
    !inTitleCase && isWordCapitalCase(word, true) ||
    isCustom && isWordCustomCapitalization(word) ||
    !isAllCaps(word) && isWordCustomCapitalization(word) ||
    !isGreek && (await greekLetterAllowed(word))) {
      // For custom titles, allow any not just first capital
      // For non-custom, allow any that isn't all caps
      // Trust it with capitalization
      result += word + " ";
    } else {
      if (startOfSentence(index, words) && !isNumberThenLetter(word)) {
        if (!isAllCaps(word) && isWordCustomCapitalization(word)) {
          result += word + " ";
        } else {
          result += (await capitalizeFirstLetter(word, isTurkiq)) + " ";
        }
      } else {
        result += (await toLowerCase(word, isTurkiq)) + " ";
      }
    }

    index++;
  }

  return cleanResultingTitle(result);
}

export async function toTitleCase(str, isCustom) {
  const words = str.split(" ");
  const mostlyAllCaps = isMostlyAllCaps(words);
  const { isGreek, isTurkiq, isEnglish } = await getLangInfo(str);

  let result = "";
  let index = 0;
  for (const word of words) {
    const processed = await wordToTitleCase(word, index, words, {
      isCustom,
      mostlyAllCaps,
      isGreek,
      isTurkiq,
      isEnglish
    });

    if (processed.length > 0) {
      result += processed + " ";
    }

    index++;
  }

  return cleanResultingTitle(result);
}









async function wordToTitleCase(word, index, words, params) {
  const { isCustom, mostlyAllCaps, isGreek, isTurkiq, isEnglish } = params;
  const trustCaps = shouldTrustCaps(mostlyAllCaps, words, index);

  if (forceKeepFormatting(word) ||
  isYear(word) ||
  !isGreek && (await greekLetterAllowed(word))) {
    return word;
  } else if (isCompoundWord(word)) {
    // If this is hyphenated or dashed, run title case on it again
    let result = "";
    let newIndex = 0;

    const wordsInWord = word.split(/([-/])/g);
    const wordsArray = words.slice(0, index).concat(word.split(/[-/]/)).concat(words.slice(index + 1));
    for (const wordInWord of wordsInWord) {
      if (wordInWord.match(/[-/]/)) {
        result += wordInWord;
      } else {
        result += await wordToTitleCase(wordInWord, index + newIndex, wordsArray, {
          isCustom,
          mostlyAllCaps,
          isGreek,
          isTurkiq,
          isEnglish
        });

        newIndex++;
      }
    }

    return result;
  } else if (isCustom && isWordCustomCapitalization(word) ||
  !isAllCaps(word) && (isWordCustomCapitalization(word) || isNumberThenLetter(word))) {
    // For custom titles, allow any not just first capital
    // For non-custom, allow any that isn't all caps
    return word;
  } else if ((!Config.config?.onlyTitleCaseInEnglish || isEnglish) &&
  !startOfSentence(index, words) && !endOfSentence(index, words) &&
  listHasWord(titleCaseNotCapitalized, word.toLowerCase())) {
    // Skip lowercase check for the first word
    return await toLowerCase(word, isTurkiq);
  } else if (isFirstLetterCapital(word) && (
  trustCaps && isAcronym(word) || isAcronymStrict(word))) {
    // Trust it with capitalization
    return word;
  } else {
    return await capitalizeFirstLetter(word, isTurkiq);
  }
}

export async function toCapitalizeCase(str, isCustom) {
  const words = str.split(" ");
  const mostlyAllCaps = isMostlyAllCaps(words);
  const { isGreek, isTurkiq } = await getLangInfo(str);

  let result = "";
  let index = 0;
  for (const word of words) {
    const trustCaps = shouldTrustCaps(mostlyAllCaps, words, index);

    if (forceKeepFormatting(word) ||
    isYear(word) ||
    !isGreek && (await greekLetterAllowed(word))) {
      // For custom titles, allow any not just first capital
      // For non-custom, allow any that isn't all caps
      // Trust it with capitalization
      result += word + " ";
    } else if (isCompoundWord(word)) {
      // If this is hyphenated or dashed, capitalize each part
      const wordsInWord = word.split(/([-/])/g);
      for (const wordInWord of wordsInWord) {
        if (wordInWord.match(/[-/]/)) {
          result += wordInWord;
        } else {
          result += await capitalizeFirstLetter(wordInWord, isTurkiq);
        }
      }

      result += " ";
    } else if (isCustom && isWordCustomCapitalization(word) ||
    !isAllCaps(word) && isWordCustomCapitalization(word) ||
    isFirstLetterCapital(word) && (
    trustCaps && isAcronym(word) || isAcronymStrict(word))) {
      // For custom titles, allow any not just first capital
      // For non-custom, allow any that isn't all caps
      // Trust it with capitalization
      result += word + " ";
    } else {
      result += (await capitalizeFirstLetter(word, isTurkiq)) + " ";
    }

    index++;
  }

  return cleanResultingTitle(result);
}

export function isInTitleCase(words) {
  let first = true;
  let capitalCount = 0;
  for (const word of words) {
    const isCaptial = isFirstLetterCapital(word);

    if (!first &&
    !isCaptial &&
    !doesStartWithNonLetter(word) &&
    !isAllCaps(word) &&
    !listHasWord(titleCaseNotCapitalized, word) &&
    word.length > 3) {
      // At least one extra word is lower case, probably not title case
      return false;
    }

    if (isCaptial) {
      capitalCount++;
    }

    first = false;
  }

  return capitalCount > 0;
}

function shouldTrustCaps(mostlyAllCaps, words, index) {
  return !mostlyAllCaps &&
  !(isAllCaps(words[index - 1]) && !forceKeepFormatting(words[index - 1]) ||
  isAllCaps(words[index + 1]) && !forceKeepFormatting(words[index + 1]));
}

export function isMostlyAllCaps(words) {
  let count = 0;
  for (const word of words) {
    // Has at least one char and is upper case
    if (isAllCaps(word)) {
      count++;
    }
  }

  return count > words.length * 0.5;
}

/**
 * Has at least one char and is upper case
 */
function isAllCaps(word) {
  return !!word && !!word.match(uRegExp("[\\p{L}]", "u")) &&
  word.toUpperCase() === word &&
  !isAcronymStrict(word) &&
  !word.match(uRegExp("^[\\p{L}]{1,3}[-~\u2014]", "u")); // USB-C not all caps, HANDS-ON is
}

export async function capitalizeFirstLetter(word, isTurkiq) {
  const result = [];

  if (startsWithEmojiLetter(word)) {
    // Emoji letter is already "capitalized"
    return await toLowerCase(word, isTurkiq);
  }

  for (const char of word) {
    if (char.match(uRegExp("[\\p{L}]", "u"))) {
      // converts to an array in order to slice by Unicode code points
      // (for Unicode characters outside the BMP)
      result.push((await toUpperCase(char, isTurkiq)) + (await toLowerCase([...word].slice(result.length + 1).join(""), isTurkiq)));
      break;
    } else {
      result.push(char);
    }
  }

  return result.join("");
}

function isWordCapitalCase(word, allowSingleWords) {
  const regex = allowSingleWords ? uRegExp("^[^\\p{L}]*[\\p{Lu}][^\\p{Lu}]*$", "u") : uRegExp("^[^\\p{L}]*[\\p{Lu}][^\\p{Lu}]+$", "u");
  const compoundSections = word.split(/[-/]/);
  return !!word.match(regex) || compoundSections.length > 1 && word.split(/[-/]/).every((w) => !!w.match(regex));
}

function startsWithEmojiLetter(word) {
  return !!word.match(uRegExp("^[^\\p{L}]*[\uD83C\uDD70\uD83C\uDD8E\uD83C\uDD71\uD83C\uDD91\uD83C\uDD7E][^\\p{Lu}]+$", "u"));
}

/**
 * Not just capital at start
 */
export function isWordCustomCapitalization(word) {
  if (isCompoundWord(word)) {
    return word.split(/[-/]/).some((w) => isWordCustomCapitalization(w));
  }

  const capitalMatch = word.match(uRegExp("[\\p{Lu}]", "gu"));
  if (!capitalMatch) return false;

  const capitalNumber = capitalMatch.length;
  return capitalNumber > 1 || capitalNumber === 1 && !isFirstLetterCapital(word);
}

function isCompoundWord(word) {
  return !!word.match(/.-.|.\/./);
}

/**
 * 3rd, 45th
 */
function isNumberThenLetter(word) {
  return !!word.match(uRegExp("^[\u300C\u3008\u300A\u3010\u3014\u2997\u300E\u3016\u3018<({[\"'\u2018]*[0-9]+\\p{L}[\u3019\u3017\u300F\u2998\u3015\u3011\u300B\u3009\u300D)}\\]\"']*", "u"));
}

function doesStartWithNonLetter(word) {
  return !!word.match(uRegExp("^[^\\p{L}]", "u"));
}

function isYear(word) {
  return !!word.match(/^[「〈《【〔⦗『〖〘<({["'‘]*[0-9]{2,4}'?s[〙〗』⦘〕】》〉」)}\]"']*$/);
}

function isFirstLetterCapital(word) {
  return !!word.match(uRegExp("^[^\\p{L}]*[\\p{Lu}]", "u"));
}

function forceKeepFormatting(word, ignorePunctuation = true) {
  let result = !!word.match(/^>/) ||
  listHasWord(allowlistedWords, word) ||
  listHasStartOfWord(allowlistedStartOfWords, word);

  if (ignorePunctuation) {
    const withoutPunctuation = word.replace(/[:?.!+\]]+$|^[[+:/]+/, "");
    if (word !== withoutPunctuation) {
      result ||= listHasWord(allowlistedWords, withoutPunctuation) ||
      listHasStartOfWord(allowlistedStartOfWords, word);
    }
  }

  // Allow hashtags
  if (!isAllCaps(word) && word.startsWith("#")) {
    return true;
  }

  // Don't capitalize subreddits
  if (word.startsWith("r/")) {
    return true;
  }

  return result;
}

/**
 * Allow mathematical greek symbols
 */
function greekLetterAllowed(word) {
  return !!word.match(/[Ͱ-Ͽ]/);
}

async function toLowerCase(word, isTurkiq) {
  if (isTurkiq || word.match(/ı|İ/u) || (await checkAnyLanguage(word, ["tr", "az"], 10))) {
    return word.toLocaleLowerCase("tr-TR");
  } else {
    return word.toLowerCase();
  }
}

async function toUpperCase(word, isTurkiq) {
  if (isTurkiq || word.match(/ı|İ/u) || (await checkAnyLanguage(word, ["tr", "az"], 10))) {
    return word.toLocaleUpperCase("az-AZ");
  } else {
    return word.toUpperCase();
  }
}

async function getLangInfo(str)



{
  if (str.split(" ").length > 1) {
    // Remove hashtags
    str = str.replace(/#[^\s]+/g, "").trim();
  }

  const threshold = 30;
  const result = await checkLanguages(str, ["el", "tr", "az", "en"], threshold);

  return {
    isGreek: result.results[0],
    isTurkiq: result.results[1] || result.results[2],

    // Not english if it detects no english, it is reliable, and the top language is the same when one word is removed
    // Helps remove false positives
    isEnglish: !(!result.results[3] &&
    result.isReliable &&
    Config.config?.onlyTitleCaseInEnglish // Only do further checks if enabled
    && result.topLanguage === (await checkLanguages(str.replace(/[^ ]+$/, ""), [], threshold)).topLanguage)
  };
}

async function checkAnyLanguage(title, languages, percentage) {
  return (await checkLanguages(title, languages, percentage)).results.every((v) => v);
}

async function checkLanguages(title, languages, percentage)



{
  // [ytaf] Was: !cld && (no chrome.i18n || ...). `"detectLanguage" in chrome.i18n`
  // throws when window.chrome exists without i18n, so only the cld check is kept.
  if (!cld) {
    return {
      results: languages.map(() => false),
      isReliable: false
    };
  }

  try {
    const getLanguageFromBrowserApi = async (title) => {
      const result = await chromeP.i18n.detectLanguage(title);
      return result.languages.map((l) => ({ ...l, isReliable: result.isReliable }));
    };

    const detectedLanguages = cld ?
    [await (await cld).findLanguage(title)].map((l) => ({ language: l.language,
      percentage: l.probability * 100, isReliable: l.is_reliable })) :
    await getLanguageFromBrowserApi(title);

    const result = [];
    for (const language of languages) {
      const matchingLanguage = detectedLanguages.find((l) => l.language === language);
      result.push(!!matchingLanguage && matchingLanguage.percentage > percentage);
    }

    return {
      results: result,
      topLanguage: detectedLanguages[0]?.language,
      isReliable: detectedLanguages.some((l) => l.isReliable)
    };
  } catch (e) {
    return {
      results: languages.map(() => false),
      isReliable: false
    };
  }
}

export function isAcronym(word) {
  // 2 - 3 chars, or has dots after each letter except last word
  // U.S.A allowed
  // US allowed
  return (word.length <= 3 || countLetters(word) <= 3) &&
  word.length > 1 && isAllCaps(word) && !listHasWord(acronymBlocklist, word.toLowerCase()) ||
  isAcronymStrict(word);
}

function countLetters(word) {
  return word.match(uRegExp("[\\p{L}]", "gu"))?.length ?? 0;
}

export function isAcronymStrict(word) {
  // U.S.A allowed
  return !!word.match(uRegExp("^[^\\p{L}]*(\\S\\.)+(\\S)?$", "u"));
}

function startOfSentence(index, words) {
  return index === 0 || isDelimeter(words[index - 1]);
}

function endOfSentence(index, words) {
  return index === words.length - 1 ||
  isDelimeter(words[index]) // "word!" counts as delimeter
  || !!words[index + 1] && isEntirelyDelimeter(words[index + 1]);
}

function isEntirelyDelimeter(word) {
  return word.match(/^[-:;~—–|]$/) !== null;
}

function isDelimeter(word) {
  return (isEntirelyDelimeter(word) ||
  word.match(/[:?.!\]]$/) !== null) &&
  !listHasWord(allowlistedWords, word) &&
  !listHasWord(notStartOfSentence, word.toLowerCase()) && (
  !isAcronymStrict(word) || !word.endsWith("."));
}

export function cleanResultingTitle(title) {
  return cleanUnformattedTitle(cleanPunctuation(title));
}

function cleanUnformattedTitle(title) {
  return title.replace(/(^|\s)>(\S)/g, "$1$2").trim();
}

function cleanWordPunctuation(title) {
  const words = title.trim().split(" ");
  if (words.length > 0 && (
  forceKeepFormatting(words[words.length - 1], false) ||
  isAcronymStrict(words[words.length - 1]) && words[words.length - 1].endsWith("."))) {
    return title;
  }

  let toTrim = 0;
  let questionMarkCount = 0;
  for (let i = title.length - 1; i >= 0; i--) {
    toTrim = i;

    if (title[i] === "?") {
      questionMarkCount++;
    } else if (title[i] !== "!" && title[i] !== "." && title[i] !== " ") {
      break;
    }
  }

  let cleanTitle = toTrim === title.length ? title : title.substring(0, toTrim + 1);
  if (questionMarkCount > 0) {
    cleanTitle += "?";
  }

  return cleanTitle;
}

export function cleanPunctuation(title) {
  title = cleanWordPunctuation(title);
  const words = title.split(" ");

  let result = "";
  let index = 0;
  for (let word of words) {
    if (!forceKeepFormatting(word, false) &&
    index !== words.length - 1) {// Last already handled
      if (word.includes("?")) {
        word = cleanWordPunctuation(word);
      } else if (word.match(/[!]+$/)) {
        if (words.length > index + 1 && !isDelimeter(words[index + 1])) {
          // Insert a period instead
          word = cleanWordPunctuation(word) + ". ";
        } else {
          word = cleanWordPunctuation(word);
        }
      }
    }

    word = word.trim();
    if (word.trim().length > 0) {
      result += word + " ";
    }

    index++;
  }

  return result.trim();
}

export function cleanEmojis(title) {
  // \uFE0F is the emoji variation selector, it comes after non colored symbols to turn them into emojis
  // \uFE0E is similar but makes colored emojis into non colored ones
  // \u200D is the zero width joiner, it joins emojis together

  const cleaned = title
  // Clear extra spaces between emoji "words"
  .replace(uRegExp(" ((?=\\p{Extended_Pictographic}|\u2606)(?=[^\uD83C\uDD70\uD83C\uDD8E\uD83C\uDD71\uD83C\uDD91\uD83C\uDD7E])\\S(?:\\uFE0F?\\uFE0E?\\p{Emoji_Modifier}?\\u200D?)*)+(?= )", "ug"), "")
  // Emojis in between letters should be spaces, varient selector is allowed before to allow B emoji
  .replace(uRegExp("(\\p{L}|[\\uFE0F\\uFE0E\uD83C\uDD8E\uD83C\uDD91])(?:(?=\\p{Extended_Pictographic}|\u2606)(?=[^\uD83C\uDD70\uD83C\uDD8E\uD83C\uDD71\uD83C\uDD91\uD83C\uDD7E])\\S(?:\\uFE0F?\\uFE0E?\\p{Emoji_Modifier}?\\u200D?)*)+(?=\\p{L}|[\uD83C\uDD70\uD83C\uDD8E\uD83C\uDD71\uD83C\uDD91\uD83C\uDD7E])", "ug"), "$1 ").
  replace(uRegExp("(?=\\p{Extended_Pictographic}|\u2606)(?=[^\uD83C\uDD70\uD83C\uDD8E\uD83C\uDD71\uD83C\uDD91\uD83C\uDD7E])\\S(?:\\uFE0F?\\uFE0E?\\p{Emoji_Modifier}?\\u200D?)*", "ug"), "").
  trim();

  if (cleaned.length > 0) {
    return cleaned;
  } else {
    return title;
  }
}

export function cleanFancyText(title) {
  const replacementsNeeded = new Set();
  for (const character of title) {
    const match = fancyTextConversions.get(character);
    if (match) {
      replacementsNeeded.add([character, match]);
    }
  }

  for (const replacement of replacementsNeeded) {
    // Allow emoji variation selectors on either side of the replacement character
    // Supports emojis such as 🅱️
    title = title.replace(new RegExp(`[\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]?${replacement[0]}[\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]?`,
    "ug"), replacement[1]);
  }

  return title.trim();
}

function listHasWord(list, word) {
  return list.has(word.replace(/[[「〈《【〔⦗『〖〘<({:〙〗』⦘〕】》〉」)}\]]/g, ""));
}

function listHasStartOfWord(list, word) {
  word = word.replace(/[[「〈《【〔⦗『〖〘<({:〙〗』⦘〕】》〉」)}\]]/g, "");

  for (const item of list) {
    if (word.startsWith(item)) {
      return true;
    }
  }

  return false;
}

// [ytaf] localizeHtmlPageWithFormatting / getLocalizedMessageWithFormatting
// removed: they localise the extension's own option pages via chrome.i18n.