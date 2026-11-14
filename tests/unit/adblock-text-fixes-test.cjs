/**
 * adblock/text-fixes and emoji-wrap as a unit: trackingParams blanking done on the JSON text
 * before the parse (every depth, the quick exit when the key is absent,
 * clickTrackingParams and escaped or non-string values left alone), and the
 * emoji walk that no longer carries a tracking mode.
 *
 * Run: node tests/unit/adblock-text-fixes-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { makeBrowse } = require('../harness/gen-payload.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const SOURCES = ['text-fixes.js', 'emoji-wrap.js'].map((f) =>
  path.join(SRC, 'features', 'adblock', f)
);
const { sandbox, get } = loadSources(SOURCES, { log: { debug() {}, warn() {} } });
const { stripTrackingParams, wrapEmojiInTree, mayNeedEmojiWork } = sandbox;

/** Every non-empty string trackingParams left in a tree, with the deepest one's depth. */
function leftover(obj) {
  let count = 0;
  let deepest = -1;
  (function walk(node, depth) {
    if (typeof node.trackingParams === 'string' && node.trackingParams) {
      count++;
      if (depth > deepest) deepest = depth;
    }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  })(obj, 0);
  return { count, deepest };
}

// ---- the quick exit ----
{
  const text = JSON.stringify({ responseContext: {}, contents: { a: [1, 2, 3] } });
  t('a text without the key comes back as the same string', stripTrackingParams(text) === text);
}

// ---- every depth, including past the old walk's limit of 14 ----
{
  let deep = { trackingParams: 'CAEQ_deep', title: { simpleText: 'x' } };
  for (let i = 0; i < 20; i++) deep = { child: deep, trackingParams: 'CAEQ_' + i };
  const root = { responseContext: {}, contents: deep, trackingParams: 'CAEQ_root' };
  const before = leftover(root);
  const out = JSON.parse(stripTrackingParams(JSON.stringify(root)));
  const after = leftover(out);
  eq('the fixture nests trackingParams 21 levels deep', before.deepest, 21);
  eq('every trackingParams is blanked, whatever its depth', after.count, 0);
  eq('the root one too', out.trackingParams, '');
  // InnerTube answers pretty-printed unless the request says prettyPrint=false.
  const pretty = JSON.parse(stripTrackingParams(JSON.stringify(root, null, 2)));
  eq('pretty-printed JSON (": " between key and value) is blanked too', leftover(pretty).count, 0);
  t('nothing else moved', JSON.stringify(out).indexOf('"simpleText":"x"') !== -1);
}

// ---- a generated browse response ----
{
  const text = JSON.stringify(makeBrowse({ shelves: 30, tilesPer: 20 }));
  const before = leftover(JSON.parse(text));
  const out = JSON.parse(stripTrackingParams(text));
  t(
    'setup: the generated browse carries trackingParams deeper than 14',
    before.deepest > 14,
    String(before.deepest)
  );
  eq('a browse response of 1263 trackingParams has none left', leftover(out).count, 0);
  eq(
    'the shelves are all still there',
    out.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.filter(
      (s) => s.shelfRenderer
    ).length,
    30
  );
}

// ---- what is left alone ----
{
  const root = {
    responseContext: {},
    clickTrackingParams: 'CAEQ_click',
    nested: { clickTrackingParams: 'CAEQ_nested', trackingParams: 'CAEQ_gone' },
    escaped: { trackingParams: 'has a ' + String.fromCharCode(92) + ' backslash' },
    quoted: { trackingParams: 'has a " quote' },
    object: { trackingParams: { not: 'a string' } },
    number: { trackingParams: 7 }
  };
  const out = JSON.parse(stripTrackingParams(JSON.stringify(root)));
  eq('clickTrackingParams at the root is kept', out.clickTrackingParams, 'CAEQ_click');
  eq(
    'clickTrackingParams beside a blanked trackingParams is kept',
    out.nested.clickTrackingParams,
    'CAEQ_nested'
  );
  eq('and that trackingParams is blanked', out.nested.trackingParams, '');
  eq(
    'a value with a backslash escape is left as it was',
    out.escaped.trackingParams,
    'has a ' + String.fromCharCode(92) + ' backslash'
  );
  eq('a value with an escaped quote is left as it was', out.quoted.trackingParams, 'has a " quote');
  eq(
    'an object value is left alone',
    JSON.stringify(out.object.trackingParams),
    '{"not":"a string"}'
  );
  eq('a number value is left alone', out.number.trackingParams, 7);
}

// ---- the tab renderers keep their own trackingParams (Subscriptions channel tabs) ----
{
  // A Subscriptions browse: the tab bar, three channel tabs, the first one's
  // content inline; strings with braces, brackets, escaped quotes and a
  // look-alike key in a value, which the scan must read as text.
  const tab = (n, content) => ({
    tabRenderer: {
      title: 'Channel {' + n + '} [x] "q"',
      content: {
        tvSurfaceContentRenderer: Object.assign({ trackingParams: 'SURF_' + n }, content)
      },
      trackingParams: 'TAB_' + n
    }
  });
  const shelf = {
    shelfRenderer: {
      title: { runs: [{ text: '"trackingParams":"fake" } ] {' }] },
      content: {
        horizontalListRenderer: {
          items: [{ tileRenderer: { trackingParams: 'TILE_1' } }],
          trackingParams: 'LIST_1'
        }
      },
      trackingParams: 'SHELF_1'
    }
  };
  const browse = {
    responseContext: {},
    contents: {
      tvBrowseRenderer: {
        content: {
          tvSecondaryNavRenderer: {
            sections: [
              {
                tvSecondaryNavSectionRenderer: {
                  tabs: [
                    tab(1, { content: { sectionListRenderer: { contents: [shelf] } } }),
                    tab(2, {}),
                    tab(3, { continuation: { token: 'abc' } })
                  ]
                }
              }
            ]
          }
        },
        trackingParams: 'BROWSE'
      }
    },
    trackingParams: 'ROOT'
  };
  const text = JSON.stringify(browse);
  const out = JSON.parse(stripTrackingParams(text));
  const tabs =
    out.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections[0]
      .tvSecondaryNavSectionRenderer.tabs;
  eq(
    'every tab surface keeps its own trackingParams',
    tabs.map((x) => x.tabRenderer.content.tvSurfaceContentRenderer.trackingParams).join(),
    'SURF_1,SURF_2,SURF_3'
  );
  eq(
    'the tabs themselves, the browse and the root are blanked',
    [
      tabs[0].tabRenderer.trackingParams,
      out.contents.tvBrowseRenderer.trackingParams,
      out.trackingParams
    ].join(),
    ',,'
  );
  const s1 =
    tabs[0].tabRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents[0]
      .shelfRenderer;
  eq(
    'inside a kept surface, its shelves, lists and tiles are blanked',
    [
      s1.trackingParams,
      s1.content.horizontalListRenderer.trackingParams,
      s1.content.horizontalListRenderer.items[0].tileRenderer.trackingParams
    ].join(),
    ',,'
  );
  eq(
    'a look-alike key inside a string stays text',
    s1.title.runs[0].text,
    '"trackingParams":"fake" } ] {'
  );
  eq(
    'titles with braces, brackets and quotes come through',
    tabs[1].tabRenderer.title,
    'Channel {2} [x] "q"'
  );

  // A tab's content loading later: the continuation keeps its own.
  const cont = {
    responseContext: {},
    continuationContents: {
      tvSurfaceContentContinuation: {
        content: { sectionListRenderer: { contents: [shelf] } },
        trackingParams: 'CONT_OWN'
      }
    },
    trackingParams: 'ROOT'
  };
  const outCont = JSON.parse(stripTrackingParams(JSON.stringify(cont, null, 2)));
  eq(
    'a tab continuation (pretty-printed) keeps its own trackingParams',
    outCont.continuationContents.tvSurfaceContentContinuation.trackingParams,
    'CONT_OWN'
  );
  eq(
    'and blanks everything inside it and the root',
    [
      outCont.trackingParams,
      outCont.continuationContents.tvSurfaceContentContinuation.content.sectionListRenderer
        .contents[0].shelfRenderer.trackingParams
    ].join(),
    ','
  );

  // The home browse has a surface but no tabs: the fast path, everything blanked.
  const home = {
    contents: {
      tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { trackingParams: 'HOME' } } }
    }
  };
  eq(
    'a surface outside tabs (the home browse) is blanked as before',
    JSON.parse(stripTrackingParams(JSON.stringify(home))).contents.tvBrowseRenderer.content
      .tvSurfaceContentRenderer.trackingParams,
    ''
  );
  // A kept surface whose value the pattern does not blank stays as sent, and the rest still goes.
  const odd = {
    continuationContents: {
      tvSurfaceContentContinuation: {
        trackingParams: 'has a " quote',
        inner: { trackingParams: 'GONE' }
      }
    }
  };
  const outOdd = JSON.parse(stripTrackingParams(JSON.stringify(odd)));
  eq(
    'a kept value with an escaped quote stays, its insides are still blanked',
    [
      outOdd.continuationContents.tvSurfaceContentContinuation.trackingParams,
      outOdd.continuationContents.tvSurfaceContentContinuation.inner.trackingParams
    ].join('|'),
    'has a " quote|'
  );
}

// ---- the emoji walk carries no tracking mode any more ----
{
  const obj = { trackingParams: 'CAEQ_keep', title: { simpleText: 'Hi 😀' } };
  wrapEmojiInTree(obj);
  eq('the emoji walk leaves trackingParams alone', obj.trackingParams, 'CAEQ_keep');
  t(
    'and wraps the emoji',
    JSON.stringify(obj.title).indexOf('​') !== -1,
    JSON.stringify(obj.title)
  );
  const other = { deep: { title: { runs: [{ text: 'a 😀 b' }] } } };
  wrapEmojiInTree(other);
  t(
    'and splits a run around the emoji',
    other.deep.title.runs.length === 3,
    JSON.stringify(other.deep.title.runs)
  );
}

// ---- the walk's depth: 20 levels below the root ----
{
  const nest = (levels) => {
    let node = { title: { simpleText: 'x 😀' } };
    for (let i = 0; i < levels; i++) node = { child: node };
    return node;
  };
  const wrapped = (root) => JSON.stringify(root).indexOf(String.fromCharCode(0x200b)) !== -1;
  const at19 = nest(19);
  wrapEmojiInTree(at19);
  t('a title 20 levels down is wrapped', wrapped(at19));
  const at20 = nest(20);
  wrapEmojiInTree(at20);
  t('one level further it is past the bound', !wrapped(at20));
}

// ---- the emoji gate over the raw text (the legacy fix walks only when it says so) ----
{
  const bs = String.fromCharCode(92);
  const plain = JSON.stringify(makeBrowse({ shelves: 3, tilesPer: 4 }));
  t('a plain browse response needs no emoji walk', mayNeedEmojiWork(plain) === false);
  t(
    'nor does one with escaped ASCII (an ampersand in a URL)',
    mayNeedEmojiWork('{"url":"https://x.test/?a=1' + bs + 'u0026b=2"}') === false
  );
  t(
    'a raw emoji needs the walk',
    mayNeedEmojiWork('{"t":"Hi ' + String.fromCodePoint(0x1f600) + '"}') === true
  );
  t(
    'a BMP emoji (a heart) needs it',
    mayNeedEmojiWork('{"t":"I ' + String.fromCharCode(0x2764) + ' it"}') === true
  );
  t(
    'an escaped surrogate pair needs it',
    mayNeedEmojiWork('{"t":"Hi ' + bs + 'ud83d' + bs + 'ude00"}') === true
  );
  t(
    'an escaped BMP emoji needs it, in either case of hex',
    mayNeedEmojiWork('{"t":"' + bs + 'u2764"}') === true &&
      mayNeedEmojiWork('{"t":"' + bs + 'u00A9"}') === true
  );
  t(
    'a sentinel (raw or escaped) needs it, so it is stripped',
    mayNeedEmojiWork('{"t":"a' + String.fromCharCode(0x2060) + 'b"}') === true &&
      mayNeedEmojiWork('{"t":"a' + bs + 'ufeffb"}') === true
  );
  t(
    'with the fix generated, a browse with emoji titles needs it',
    mayNeedEmojiWork(JSON.stringify(makeBrowse({ shelves: 2, tilesPer: 2, withEmoji: true }))) ===
      true
  );

  // The gate is one character class built from the exact regexes (a scan of
  // one class per character, not four alternatives): it has to let through
  // every character they match, and may let through a lone high surrogate.
  const gate = get('NEEDS_TEXT_WORK_RE');
  const exact = new RegExp(`${get('EMOJI_CHAR_RE').source}|\\u20E3|${get('CLEAN_TEXT_RE').source}`);
  let missed = 0;
  for (let c = 0; c < 0x10000; c++) {
    const ch = String.fromCharCode(c);
    if (exact.test(ch) && !gate.test(ch)) missed++;
  }
  for (let cp = 0x1f000; cp < 0x1fb00; cp++) {
    const ch = String.fromCodePoint(cp);
    if (exact.test(ch) && !gate.test(ch)) missed++;
  }
  eq('the gate lets through every character the exact regexes match', missed, 0);
  t('the gate is a single character class', /^\[[^\]]*\]$/.test(gate.source));
  t(
    'dashes, curly quotes and other scripts do not pass it',
    !gate.test(
      'A \u2013 B \u201Cquoted\u201D \u2026 \u041F\u0440\u0438\u0432\u0435\u0442 \u3053\u3093'
    )
  );
}

report.finish();
