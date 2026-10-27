// DeArrow's title formatter (src/vendor/dearrow, GPL-3.0), as the feature
// uses it. The legacy build has formatter-absent.js in its place
// (webpack.config.js): the formatter is 48 KiB there, and of the TVs that
// build runs on only webOS 5 and 6 could use it.
export { formatTitleInternal } from '../../vendor/dearrow/titleFormatter.js';
export { TitleFormatting } from '../../vendor/dearrow/shim.js';
import { unicodeRegExpSupported } from '../../vendor/dearrow/shim.js';

/**
 * Whether titles can be formatted: the formatter needs \p{...} in regular
 * expressions, which Chrome 64 brought (webOS 5).
 */
export const formattingSupported = unicodeRegExpSupported;
