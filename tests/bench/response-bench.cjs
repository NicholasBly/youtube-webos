/**
 * Times the JSON.parse hook against the native parse on the kinds of response
 * the TV app makes, under the settings that put work on the hook: the
 * defaults, the legacy emoji fix (on by default on webOS 3 and 4), DeArrow,
 * and everything at once. hook-bench.cjs times one browse response with every
 * filter on; this one says what each setting costs on each kind of response,
 * the ones without a tile in them included (comments, live chat), which is
 * where a pass that has nothing to find must cost nothing.
 *
 * A measurement, not a check: run it before and after a change and compare.
 * Node's V8 is not the TV's: the ratios carry over better than the times.
 *
 * Run after a build: node tests/bench/response-bench.cjs [bundle] [legacy|modern]
 * `--json` prints the rows as JSON, for a script that compares two runs.
 */
const { createPage, flavour } = require('../harness/page.cjs');
const { makeBrowse } = require('../harness/gen-payload.cjs');

const legacy = flavour === 'legacy';
const asJson = process.argv.includes('--json');

// The settings compared. The legacy emoji fix only exists in the legacy build.
const CONFIGS = {
  defaults: {},
  'emoji fix (webOS 3/4 default)': { enableLegacyEmojiFix: true },
  DeArrow: { enableDeArrow: true },
  everything: {
    enableTrackingBlock: true,
    removeGlobalShorts: true,
    removeLiveVideos: true,
    hideGuestSignInPrompts: true,
    hideEndcards: true,
    enableLegacyEmojiFix: legacy,
    upgradeThumbnails: true,
    enableDeArrow: true
  }
};
if (!legacy) delete CONFIGS['emoji fix (webOS 3/4 default)'];

/**
 * A browse response as the TV gets it: the generator's, with the bullets every
 * metadata line carries (they make the text two-byte, as a real one is) and a
 * contentId on each tile (what makes it a video tile for DeArrow).
 */
function browseText(options) {
  return JSON.stringify(makeBrowse(options))
    .replace(/Channel (\d+)/g, 'Channel $1 \u2022 1.2M views \u2022 3 days ago')
    .replace(
      /"contentType":"TILE_CONTENT_TYPE_VIDEO"/g,
      (match, at) => match + ',"contentId":"v' + String(at).padStart(10, '0').slice(-10) + '"'
    );
}

/** A comments continuation: thousands of nodes, no tile, no video thumbnail. */
function commentsText(count) {
  return JSON.stringify({
    responseContext: { visitorData: 'x' },
    continuationContents: {
      itemSectionContinuation: {
        contents: Array.from({ length: count }, (_, i) => ({
          commentThreadRenderer: {
            comment: {
              commentRenderer: {
                authorText: { simpleText: 'Author ' + i },
                contentText: {
                  runs: [{ text: 'A comment \u2022 number ' + i + ', a few words long' }]
                },
                authorThumbnail: {
                  thumbnails: [{ url: 'https://yt3.ggpht.com/a' + i, width: 48 }]
                },
                publishedTimeText: { simpleText: '3 days ago' },
                voteCount: { simpleText: String(i) },
                actionButtons: {
                  commentActionButtonsRenderer: {
                    likeButton: {
                      toggleButtonRenderer: { isToggled: false, trackingParams: 'x' + i }
                    }
                  }
                }
              }
            }
          }
        }))
      }
    }
  });
}

/** A live chat continuation, as one arrives every few seconds with the chat open. */
function liveChatText(count) {
  return JSON.stringify({
    responseContext: {},
    continuationContents: {
      liveChatContinuation: {
        actions: Array.from({ length: count }, (_, i) => ({
          addChatItemAction: {
            item: {
              liveChatTextMessageRenderer: {
                message: { runs: [{ text: 'chat message ' + i }] },
                authorName: { simpleText: 'user' + i },
                authorPhoto: { thumbnails: [{ url: 'https://yt3.ggpht.com/c' + i }] },
                id: 'id' + i
              }
            }
          }
        }))
      }
    }
  });
}

const PAYLOADS = [
  ['browse, 240 video tiles', browseText({}), 60],
  ['browse, one emoji title', browseText({}).replace('title number 5019', '\uD83D\uDE00 5019'), 60],
  ['comments, 300', commentsText(300), 80],
  ['live chat, 40 messages', liveChatText(40), 400]
];

const median = (values) => values.slice().sort((x, y) => x - y)[values.length >> 1];
/** The mean time of one call of `fn`, in microseconds, over `iterations` calls. */
function timeOf(fn, iterations) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  return Number(process.hrtime.bigint() - start) / 1e3 / iterations;
}

const names = Object.keys(CONFIGS);
const rows = [];

/** Boots a page under one config, times every payload on it, then goes on to the next config. */
function run(index) {
  if (index >= names.length) {
    report();
    return;
  }
  const page = createPage({
    ua: legacy ? 'webos3' : 'webos23',
    raf: 'timeout',
    config: CONFIGS[names[index]]
  });
  setTimeout(() => {
    const hooked = page.win.JSON.parse;
    const native = page.NP;
    for (const [payload, text, iterations] of PAYLOADS) {
      for (let warm = 0; warm < 60; warm++) {
        hooked(text);
        native(text);
      }
      // Interleaved, and the median of several: one pass drifts more than the effect measured.
      const hookedTimes = [];
      const nativeTimes = [];
      for (let rep = 0; rep < 11; rep++) {
        hookedTimes.push(timeOf(() => hooked(text), iterations));
        nativeTimes.push(timeOf(() => native(text), iterations));
      }
      rows.push({
        config: names[index],
        payload,
        kb: Math.round(text.length / 1024),
        native: median(nativeTimes),
        hooked: median(hookedTimes)
      });
    }
    run(index + 1);
  }, 300);
}

/** Prints the rows as a table, or as JSON with `--json`, and ends the process. */
function report() {
  if (asJson) {
    console.log(JSON.stringify(rows));
    process.exit(0);
  }
  console.log(`\n=== the parse hook by response and setting, ${flavour} bundle ===`);
  console.log(
    'setting'.padEnd(31),
    'response'.padEnd(26),
    'KB'.padStart(4),
    'native us'.padStart(10),
    'hooked us'.padStart(10),
    'overhead'.padStart(9)
  );
  for (const row of rows) {
    console.log(
      row.config.padEnd(31),
      row.payload.padEnd(26),
      String(row.kb).padStart(4),
      row.native.toFixed(0).padStart(10),
      row.hooked.toFixed(0).padStart(10),
      ('+' + (100 * (row.hooked / row.native - 1)).toFixed(0) + '%').padStart(9)
    );
  }
  process.exit(0);
}

run(0);
