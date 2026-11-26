# Code map: vendor/dearrow/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [vendor/dearrow/shim.js](#mod-shim-js), [vendor/dearrow/titleFormatter.js](#mod-titleformatter-js), [vendor/dearrow/titleFormatterData.js](#mod-titleformatterdata-js)

<a id="mod-shim-js"></a>

## vendor/dearrow/shim.js

> [ytaf] Stand-ins for the DeArrow extension modules that titleFormatter.js imports. Only formatTitleInternal() is called from here, and it takes every setting as an argument, so these just need to exist.

45 lines · imported by [features/dearrow/formatter.js](features-dearrow.md#mod-formatter-js), [vendor/dearrow/titleFormatter.js](#mod-titleformatter-js)

- <a id="fn-shim-js-gettitleformatting"></a>`getTitleFormatting()` · L18–18
- <a id="fn-shim-js-shouldcleanemojis"></a>`shouldCleanEmojis()` · L19–19
- <a id="fn-shim-js-uregexp"></a>`uRegExp(source, flags)` · L38–45

<a id="mod-titleformatter-js"></a>

## vendor/dearrow/titleFormatter.js

> Vendored from DeArrow (GPL-3.0) - https://github.com/ajayyy/DeArrow src/titles/titleFormatter.ts @ 482cf997c91efcf226e1c7852db186cc29a75474
>
> TypeScript types stripped with @babel/plugin-transform-typescript. Other changes are marked [ytaf]: imports point at ./shim, language detection is disabled, the extension-page localisation helpers are dropped, and every \p{...} regex literal is built at runtime via uRegExp() (see shim.js). / // [ytaf] File extensions on the imports: an ES module package resolves them as written.

688 lines · imports [vendor/dearrow/shim.js](#mod-shim-js), [vendor/dearrow/titleFormatterData.js](#mod-titleformatterdata-js)

- <a id="fn-titleformatter-js-formattitle"></a>`formatTitle(title, isCustom, videoID)` · L31–33
- <a id="fn-titleformatter-js-formattitledefaultsettings"></a>`formatTitleDefaultSettings(title, isCustom)` · L35–37
- <a id="fn-titleformatter-js-formattitleinternal"></a>`formatTitleInternal(title, isCustom, titleFormatting, shouldCleanEmojis, formatCustomTitles, formatOriginalTitles)` · L39–63
- <a id="fn-titleformatter-js-tolowercasetitle"></a>`toLowerCaseTitle(str)` · L65–79
- <a id="fn-titleformatter-js-tofirstletteruppercase"></a>`toFirstLetterUppercase(str)` · L81–100
- <a id="fn-titleformatter-js-tosentencecase"></a>`toSentenceCase(str, isCustom)` · L102–143
- <a id="fn-titleformatter-js-totitlecase"></a>`toTitleCase(str, isCustom)` · L145–169
- <a id="fn-titleformatter-js-wordtotitlecase"></a>`wordToTitleCase(word, index, words, params)` · L179–228
- <a id="fn-titleformatter-js-tocapitalizecase"></a>`toCapitalizeCase(str, isCustom)` · L230–275
- <a id="fn-titleformatter-js-isintitlecase"></a>`isInTitleCase(words)` · L277–301
- <a id="fn-titleformatter-js-shouldtrustcaps"></a>`shouldTrustCaps(mostlyAllCaps, words, index)` · L303–307
- <a id="fn-titleformatter-js-ismostlyallcaps"></a>`isMostlyAllCaps(words)` · L309–319
- <a id="fn-titleformatter-js-isallcaps"></a>`isAllCaps(word)` · L324–329 · Has at least one char and is upper case
- <a id="fn-titleformatter-js-capitalizefirstletter"></a>`capitalizeFirstLetter(word, isTurkiq)` · L331–351
- <a id="fn-titleformatter-js-iswordcapitalcase"></a>`isWordCapitalCase(word, allowSingleWords)` · L353–357
- <a id="fn-titleformatter-js-startswithemojiletter"></a>`startsWithEmojiLetter(word)` · L359–361
- <a id="fn-titleformatter-js-iswordcustomcapitalization"></a>`isWordCustomCapitalization(word)` · L366–376 · Not just capital at start
- <a id="fn-titleformatter-js-iscompoundword"></a>`isCompoundWord(word)` · L378–380
- <a id="fn-titleformatter-js-isnumberthenletter"></a>`isNumberThenLetter(word)` · L385–387 · 3rd, 45th
- <a id="fn-titleformatter-js-doesstartwithnonletter"></a>`doesStartWithNonLetter(word)` · L389–391
- <a id="fn-titleformatter-js-isyear"></a>`isYear(word)` · L393–395
- <a id="fn-titleformatter-js-isfirstlettercapital"></a>`isFirstLetterCapital(word)` · L397–399
- <a id="fn-titleformatter-js-forcekeepformatting"></a>`forceKeepFormatting(word, ignorePunctuation)` · L401–425
- <a id="fn-titleformatter-js-greekletterallowed"></a>`greekLetterAllowed(word)` · L430–432 · Allow mathematical greek symbols
- <a id="fn-titleformatter-js-tolowercase"></a>`toLowerCase(word, isTurkiq)` · L434–440
- <a id="fn-titleformatter-js-touppercase"></a>`toUpperCase(word, isTurkiq)` · L442–448
- <a id="fn-titleformatter-js-getlanginfo"></a>`getLangInfo(str)` · L450–474
- <a id="fn-titleformatter-js-checkanylanguage"></a>`checkAnyLanguage(title, languages, percentage)` · L476–478
- <a id="fn-titleformatter-js-checklanguages"></a>`checkLanguages(title, languages, percentage)` · L480–522
- <a id="fn-titleformatter-js-checklanguages-getlanguagefrombrowserapi"></a>`checkLanguages.getLanguageFromBrowserApi(title)` · L495–498
- <a id="fn-titleformatter-js-isacronym"></a>`isAcronym(word)` · L524–531
- <a id="fn-titleformatter-js-countletters"></a>`countLetters(word)` · L533–535
- <a id="fn-titleformatter-js-isacronymstrict"></a>`isAcronymStrict(word)` · L537–540
- <a id="fn-titleformatter-js-startofsentence"></a>`startOfSentence(index, words)` · L542–544
- <a id="fn-titleformatter-js-endofsentence"></a>`endOfSentence(index, words)` · L546–550
- <a id="fn-titleformatter-js-isentirelydelimeter"></a>`isEntirelyDelimeter(word)` · L552–554
- <a id="fn-titleformatter-js-isdelimeter"></a>`isDelimeter(word)` · L556–562
- <a id="fn-titleformatter-js-cleanresultingtitle"></a>`cleanResultingTitle(title)` · L564–566
- <a id="fn-titleformatter-js-cleanunformattedtitle"></a>`cleanUnformattedTitle(title)` · L568–570
- <a id="fn-titleformatter-js-cleanwordpunctuation"></a>`cleanWordPunctuation(title)` · L572–598
- <a id="fn-titleformatter-js-cleanpunctuation"></a>`cleanPunctuation(title)` · L600–630
- <a id="fn-titleformatter-js-cleanemojis"></a>`cleanEmojis(title)` · L632–650
- <a id="fn-titleformatter-js-cleanfancytext"></a>`cleanFancyText(title)` · L652–669
- <a id="fn-titleformatter-js-listhasword"></a>`listHasWord(list, word)` · L671–673
- <a id="fn-titleformatter-js-listhasstartofword"></a>`listHasStartOfWord(list, word)` · L675–685

<a id="mod-titleformatterdata-js"></a>

## vendor/dearrow/titleFormatterData.js

> Vendored from DeArrow (GPL-3.0) - https://github.com/ajayyy/DeArrow src/titles/titleFormatterData.ts @ 482cf997c91efcf226e1c7852db186cc29a75474

413 lines · imported by [vendor/dearrow/titleFormatter.js](#mod-titleformatter-js)

