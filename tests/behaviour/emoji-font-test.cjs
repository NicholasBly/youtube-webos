/**
 * The Legacy Emoji Fix against the built legacy bundle (the tokenizer and the
 * text-node pass as a unit are tests/unit/emoji-font-test.cjs): the Noto fonts
 * are linked on webOS 3, only the outermost added element of a batch is
 * scanned, the setting arms and disarms it at runtime through the options
 * panel, the queue is dropped on the account selector, an emoji sequence (a
 * skin tone, a flag, a ZWJ family, a keycap) becomes one image end to end,
 * and two ways it once went wrong on a real webOS 3 session (~30 mutation
 * records per second on an idle home screen):
 *
 *   1. Left alone, it must converge: one sentinel-wrapped emoji title of the
 *      kind adblock produces is planted, the page is not touched again, and
 *      the second half of the run must generate no records at all.
 *   2. It must not amplify YouTube's own churn: a fixed number of in-place
 *      text updates (node.data rewrites, as YouTube's incremental DOM does) on
 *      a 12-tile shelf is counted with the fix on and off, and the fix may add
 *      at most half again.
 *
 * Run: node tests/behaviour/emoji-font-test.cjs [bundle]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { tick, flush, panelCheckbox, showPanel } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

// adblock wraps every emoji in a zero-width space and a zero-width non-joiner.
const ZWSP = String.fromCharCode(0x200b);
const ZWNJ = String.fromCharCode(0x200c);
const wrap = (emoji) => ZWSP + emoji + ZWNJ;

// The rendered spans at the top level: a rescan of the page also revisits the
// hidden twins inside spans already rendered, so only the outermost ones count.
const injected = (root) =>
  Array.from(root.querySelectorAll('.twemoji-injected')).filter(
    (el) => !el.parentElement.closest('.twemoji-injected')
  );

// ---- against the bundle ---------------------------------------------------------

const FRAMES = 40;
const TICKS = 40;

/** A page with the fix on or off, a spy counting every mutation record, and a frame pump. */
function boot(emojiOn) {
  const page = createPage({ config: { enableLegacyEmojiFix: emojiOn } });
  const win = page.win;
  const counter = { records: 0 };
  const spy = new win.MutationObserver((m) => {
    counter.records += m.length;
  });
  spy.observe(win.document.body, { childList: true, subtree: true, characterData: true });
  return { win, counter, pump: page.pump };
}

/** A span with one wrapped emoji title, appended under `parent`. */
function plant(win, parent, text) {
  const s = win.document.createElement('span');
  s.textContent = text || `Chill beats ${wrap('🎵')} mix`;
  parent.appendChild(s);
  return s;
}

/** A title through the whole legacy fix: wrapped in the parse, then rendered. The image names. */
async function rendered(title) {
  const page = createPage({ config: { enableLegacyEmojiFix: true } });
  const win = page.win;
  const resp = {
    responseContext: {},
    continuationContents: {
      gridContinuation: {
        items: [{ tileRenderer: { metadata: { title: { simpleText: title } } } }]
      }
    },
    pad: 'x'.repeat(600)
  };
  const parsed = win.JSON.parse(page.NS(resp));
  const out = parsed.continuationContents.gridContinuation.items[0].tileRenderer.metadata.title;
  const span = win.document.createElement('span');
  span.textContent = out.runs ? out.runs.map((r) => r.text).join('') : out.simpleText;
  win.document.querySelector('ytlr-app').appendChild(span);
  for (let i = 0; i < 5; i++) {
    page.pump();
    await tick();
  }
  return Array.from(span.querySelectorAll('img')).map((img) =>
    img.getAttribute('src').replace(/.*\//, '')
  );
}

async function sequences() {
  const cases = [
    ['a skin tone', 'thumbs \u{1F44D}\u{1F3FD} up', '1f44d-1f3fd.png'],
    ['a flag', 'flag \u{1F1FA}\u{1F1F8} here', '1f1fa-1f1f8.png'],
    [
      'a ZWJ family',
      'family \u{1F468}\u200D\u{1F469}\u200D\u{1F467} ok',
      '1f468-200d-1f469-200d-1f467.png'
    ],
    ['a keycap', 'key #\uFE0F\u20E3 one', '23-20e3.png']
  ];
  for (const [label, title, image] of cases) {
    const images = await rendered(title);
    t(
      `${label} in a title becomes one image`,
      images.length === 1 && images[0] === image,
      images.join(',')
    );
  }
}

async function converges() {
  const { win, counter, pump } = boot(true);
  const app = win.document.querySelector('ytlr-app');
  const title = win.document.createElement('span');
  title.textContent = `Chill beats ${wrap('🎵')} and lofi ${wrap('😀')} mix`;
  app.appendChild(title);

  // Mutation records arrive in a microtask, so every frame yields before the next.
  const samples = [];
  for (let f = 0; f < FRAMES; f++) {
    pump();
    await tick();
    samples.push(counter.records);
  }
  const half = FRAMES >> 1;
  const tail = samples[FRAMES - 1] - samples[half];
  t(
    'an untouched page generates no further records in the second half of the run',
    tail === 0,
    `${tail} records over ${half} idle frames; injected spans: ${injected(win.document).length}`
  );
  t('the emoji were rendered', injected(win.document).length > 0);
}

async function churn(emojiOn, withEmoji) {
  const { win, counter, pump } = boot(emojiOn);
  const app = win.document.querySelector('ytlr-app');
  const titles = [];
  for (let i = 0; i < 12; i++) {
    const d = win.document.createElement('div');
    const s = win.document.createElement('span');
    s.textContent = withEmoji
      ? `Track ${i} ${wrap('🎵')} live ${wrap('😀')}`
      : `Track ${i} plain title text`;
    d.appendChild(s);
    app.appendChild(d);
    titles.push(s);
  }
  pump();
  await flush();
  pump();
  await flush();
  const base = counter.records;
  for (let i = 0; i < TICKS; i++) {
    const node = titles[i % titles.length].firstChild;
    // An identical write still fires characterData; that churn is the subject.
    // eslint-disable-next-line no-self-assign
    if (node && node.nodeType === 3) node.data = node.data;
    pump();
    await flush();
  }
  return counter.records - base;
}

/** What a title shows: its text nodes, with each rendered emoji as [img:alt]. */
const shown = (el) =>
  Array.from(el.childNodes)
    .map((c) => {
      if (c.nodeType === 3) return c.data;
      if (c.classList.contains('twemoji-injected')) {
        return '[img:' + c.querySelector('img').alt + ']';
      }
      return '';
    })
    .join('');

/** The app rewrites a rendered title in place (node.data), as when it reuses a tile. */
async function inPlaceRewrite() {
  const { win, pump } = boot(true);
  const span = plant(win, win.document.querySelector('ytlr-app'));
  const owner = span.firstChild;
  for (let i = 0; i < 3; i++) {
    pump();
    await flush();
  }
  t('setup: the title is rendered', shown(span) === 'Chill beats [img:🎵] mix', shown(span));
  owner.data = 'Plain new title';
  for (let i = 0; i < 3; i++) {
    pump();
    await flush();
  }
  t(
    'a title rewritten without an emoji shows the new text alone',
    shown(span) === 'Plain new title',
    JSON.stringify(shown(span))
  );
  owner.data = `Other ${wrap('😀')} title`;
  for (let i = 0; i < 3; i++) {
    pump();
    await flush();
  }
  t(
    'a title rewritten with another emoji shows that one, once',
    shown(span) === 'Other [img:😀] title',
    JSON.stringify(shown(span))
  );
}

/** The outermost-only filter: how many tree walks a batch of nested additions costs. */
async function farthestFilter() {
  const { win, pump } = boot(true);
  const d = win.document;
  const app = d.querySelector('ytlr-app');
  const walks = { n: 0 };
  const realWalker = d.createTreeWalker.bind(d);
  d.createTreeWalker = function (...args) {
    walks.n++;
    return realWalker(...args);
  };

  // One batch: a shelf, a tile inside it, a title inside the tile, each
  // appended after its parent is already in the document.
  const shelf = d.createElement('div');
  app.appendChild(shelf);
  const tile = d.createElement('div');
  shelf.appendChild(tile);
  plant(win, tile, `Nested ${wrap('😀')} title`);
  await flush();
  t(
    'a nested batch is scanned once, from its outermost added element',
    walks.n === 1,
    `${walks.n} tree walks`
  );
  // The hidden twin a rendered emoji carries (tokenize.js): the plain emoji.
  const before = walks.n;
  const twin = d.createElement('span');
  twin.className = 'twemoji-hidden-text';
  twin.textContent = '😀';
  app.appendChild(twin);
  await flush();
  t('an added hidden twin costs no tree walk', walks.n === before, `${walks.n - before} walks`);
  pump();
  await flush();
  t('and the nested emoji is rendered once', injected(d).length === 1, String(injected(d).length));

  // Two siblings in one batch are both scanned.
  walks.n = 0;
  const a = d.createElement('div');
  const b = d.createElement('div');
  plant(win, a, `Left ${wrap('🎵')}`);
  plant(win, b, `Right ${wrap('🎵')}`);
  app.appendChild(a);
  app.appendChild(b);
  await flush();
  t('two unrelated added elements are each scanned', walks.n === 2, `${walks.n} tree walks`);
  pump();
  await flush();
  t('and both rendered', injected(d).length === 3, String(injected(d).length));

  // A rendered title re-added (the app moves tiles): nothing in it is left to render.
  walks.n = 0;
  a.remove();
  app.appendChild(a);
  await flush();
  t(
    'a rendered title re-added costs no tree walk: its twin carries no sentinels',
    walks.n === 0,
    `${walks.n} walks`
  );

  // A span the fix rendered itself, re-added with its wrapped twin inside, is skipped.
  walks.n = 0;
  const own = injected(d)[0];
  own.remove();
  app.appendChild(own);
  await flush();
  pump();
  await flush();
  t(
    'a re-added twemoji-injected element is not scanned or rendered again',
    walks.n === 0 && own.querySelectorAll('emoji-render').length === 0,
    `${walks.n} walks, inner spans ${own.querySelectorAll('emoji-render').length}`
  );
}

/** The setting flipped from the options panel: off, on, off, on. */
async function armedBySetting() {
  const page = createPage({ config: { enableLegacyEmojiFix: false } });
  const { win, pump } = page;
  const d = win.document;
  const app = d.querySelector('ytlr-app');
  t(
    'the legacy-emoji html class is on regardless of the setting (webOS 3)',
    d.documentElement.classList.contains('ytaf-legacy-emoji')
  );
  plant(win, app);
  await flush();
  pump();
  await flush();
  t('fix off: a planted emoji title is left alone', injected(d).length === 0);

  await showPanel(win, page.pump);
  const box = panelCheckbox(win, 'Emoji + Characters Fix');
  t('setup: the panel has the Emoji + Characters Fix checkbox, off', !!box && !box.checked);
  box.click();
  await flush();
  pump();
  await flush();
  t(
    'turned on at runtime: the page is scanned and the planted title rendered',
    injected(d).length === 1,
    String(injected(d).length)
  );

  box.click();
  await flush();
  plant(win, app);
  await flush();
  pump();
  await flush();
  t(
    'turned off at runtime: a title added afterwards is not rendered',
    injected(d).length === 1,
    String(injected(d).length)
  );

  box.click();
  await flush();
  pump();
  await flush();
  t(
    'turned on again: the rescan catches up on the title added while off',
    injected(d).length === 2,
    String(injected(d).length)
  );
  t(
    'the rescan does not render the hidden twin of an emoji rendered before',
    d.querySelectorAll('.twemoji-hidden-text emoji-render').length === 0,
    String(d.querySelectorAll('.twemoji-hidden-text emoji-render').length)
  );
  plant(win, app);
  await flush();
  pump();
  await flush();
  t('and the observer is armed again for new titles', injected(d).length === 3);
}

/** The account selector replacing the UI drops what is queued but not yet drawn. */
async function flushedOnAccountSelector() {
  const { win, pump } = boot(true);
  const d = win.document;
  const app = d.querySelector('ytlr-app');
  plant(win, app);
  plant(win, app);
  await flush(); // queued by the observer, the frame requested but not run
  d.body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
  await flush();
  pump();
  await flush();
  t(
    'titles queued when the account selector takes over are dropped unrendered',
    injected(d).length === 0,
    String(injected(d).length)
  );
  d.body.className = 'WEB_PAGE_TYPE_BROWSE';
  await flush();
  plant(win, app);
  await flush();
  pump();
  await flush();
  t('the observer stays armed: a title added afterwards is rendered', injected(d).length === 1);
}

/**
 * The Noto fonts the legacy font rules fall back to: a <link> in the head on
 * webOS 3 and 4, once. Not an @import in the bundled CSS, which core/styles.js
 * joins into one sheet where the import is no longer first and is ignored.
 */
function notoFonts() {
  const NOTO = 'fonts.googleapis.com/css2?family=Noto+Sans+Arabic&family=Noto+Sans+Math';
  const links = (d) =>
    Array.from(d.querySelectorAll('link[rel="stylesheet"]')).filter(
      (l) => (l.getAttribute('href') || '').indexOf(NOTO) !== -1
    );
  const legacy = createPage({ ua: 'webos3' });
  t(
    'webOS 3: the Noto fonts are linked from the head, once',
    links(legacy.win.document).length === 1 &&
      links(legacy.win.document)[0].parentNode === legacy.win.document.head
  );
  const later = createPage({ ua: 'webos23' });
  t('webOS 23 on the legacy bundle: no font link', links(later.win.document).length === 0);
}

(async () => {
  notoFonts();
  await converges();

  const off = await churn(false, true);
  const on = await churn(true, true);
  const onPlain = await churn(true, false);
  const amplification = off ? on / off : Infinity;
  t(
    'the fix does not amplify the churn of in-place text updates (at most 1.5x)',
    amplification <= 1.5,
    `off ${off}, on ${on}, on with plain text ${onPlain} records for ${TICKS} updates`
  );
  t(
    'with the fix on, titles without emoji cost no records beyond the updates themselves',
    onPlain <= off,
    `on with plain text ${onPlain}, off ${off}`
  );

  await inPlaceRewrite();
  await farthestFilter();
  await armedBySetting();
  await flushedOnAccountSelector();
  await sequences();

  report.finish();
})();
