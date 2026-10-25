/**
 * features/emoji-font as a unit: tokenize.js and text-nodes.js with twemoji
 * and YouTube's selector table evaluated in one vm sandbox over a jsdom
 * document. What a wrapped run becomes as tokens (ZWJ sequences, flags,
 * keycaps, text around an emoji), how the tokens render, two wrapped runs in
 * one text node, the twemoji-injected skip and the trim of the token cache.
 * The observer against the bundle is tests/behaviour/emoji-font-test.cjs.
 *
 * Run: node tests/unit/emoji-font-test.cjs
 */
'use strict';

const path = require('path');
const { JSDOM } = require('jsdom');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;

// adblock wraps every emoji in a zero-width space and a zero-width non-joiner.
const ZWSP = String.fromCharCode(0x200b);
const ZWNJ = String.fromCharCode(0x200c);
const wrap = (emoji) => ZWSP + emoji + ZWNJ;

/**
 * tokenize.js and text-nodes.js in one sandbox: twemoji's npm build first (a
 * CommonJS file; `module` and `global` are given to it), then the selector
 * table they read, over the document of a fresh jsdom page.
 */
function loadEmojiUnit() {
  const win = new JSDOM('<!doctype html><html><body></body></html>').window;
  const { sandbox, get } = loadSources(
    [
      require.resolve('@twemoji/api'),
      path.join(SRC, 'core', 'selectors.js'),
      path.join(SRC, 'features', 'emoji-font', 'tokenize.js'),
      path.join(SRC, 'features', 'emoji-font', 'text-nodes.js')
    ],
    {
      module: { exports: {} },
      global: {},
      document: win.document,
      Image: win.Image,
      Node: win.Node,
      NodeFilter: win.NodeFilter,
      log: { debug() {}, warn() {} }
    }
  );
  return { win, sandbox, get };
}

{
  const { win, sandbox, get } = loadEmojiUnit();
  const d = win.document;
  const tokenize = sandbox.tokenizeEmoji;
  const srcOf = (tok) => (tok.src || '').replace(/^.*\//, '');

  const single = tokenize('😀');
  t(
    'one emoji becomes one image token with its code point, alt and class',
    single.length === 1 && srcOf(single[0]) === '1f600.png' && single[0].alt === '😀',
    JSON.stringify(single)
  );
  t('an image token carries the twemoji class', single[0].cls === 'emoji', single[0].cls);

  const zwj = tokenize('👨‍👩‍👧');
  t(
    'a ZWJ family sequence is one image, not three',
    zwj.length === 1 && srcOf(zwj[0]) === '1f468-200d-1f469-200d-1f467.png',
    JSON.stringify(zwj)
  );

  const flag = tokenize('🇩🇪');
  t(
    'a flag (two regional indicators) is one image',
    flag.length === 1 && srcOf(flag[0]) === '1f1e9-1f1ea.png',
    JSON.stringify(flag)
  );

  const keycap = tokenize('1️⃣');
  t(
    'a keycap is one image with the variation selector dropped',
    keycap.length === 1 && srcOf(keycap[0]) === '31-20e3.png',
    JSON.stringify(keycap)
  );

  const mixed = tokenize('hi 😀 there');
  t(
    'text around an emoji stays as text tokens on either side',
    mixed.length === 3 &&
      mixed[0].text === 'hi ' &&
      srcOf(mixed[1]) === '1f600.png' &&
      mixed[2].text === ' there',
    JSON.stringify(mixed)
  );

  const plain = tokenize('no emoji here');
  t(
    'a run without an emoji yields a text token only',
    plain.length === 1 && plain[0].text === 'no emoji here' && plain[0].src === undefined,
    JSON.stringify(plain)
  );

  const scratch = d.createElement('span');
  scratch.textContent = '<b>x</b>';
  sandbox.renderTokens(scratch, mixed);
  const img = scratch.querySelector('img');
  const hidden = scratch.querySelector('.twemoji-hidden-text');
  t(
    'renderTokens draws the image and a hidden twin of its alt, without the sentinels',
    !!img &&
      img.getAttribute('alt') === '😀' &&
      img.className === 'emoji' &&
      !!hidden &&
      hidden.textContent === '😀',
    scratch.innerHTML
  );
  t(
    'renderTokens replaces what the target held and keeps text as text',
    scratch.childNodes[0].nodeValue === 'hi ' && scratch.childNodes[3].nodeValue === ' there',
    scratch.innerHTML
  );
  const markup = tokenize('<img src=x onerror=alert(1)> 😀');
  const bad = d.createElement('span');
  sandbox.renderTokens(bad, markup);
  t(
    'markup inside a run is rendered as text, never parsed',
    bad.querySelectorAll('img').length === 1 && bad.textContent.indexOf('<img src=x') === 0,
    bad.innerHTML
  );

  // scanElement walks a container for the eligible text nodes.
  const host = d.createElement('div');
  host.innerHTML = `<span>${wrap('🎵')}</span><h2>${wrap('😀')}</h2><p>${wrap('😀')}</p>`;
  d.body.appendChild(host);
  sandbox.scanElement(host);
  t(
    'scanElement walks a container and queues the span and the heading, not the <p>',
    get('textNodesToProcess.size') === 2,
    String(get('textNodesToProcess.size'))
  );
  sandbox.processQueue();
  t(
    'the queued nodes are rendered, the <p> is not',
    host.querySelectorAll('span > emoji-render, h2 > emoji-render').length === 2 &&
      host.querySelectorAll('p emoji-render').length === 0,
    host.innerHTML
  );

  // Two wrapped runs in one text node: both rendered, the text between kept.
  const title = d.createElement('span');
  title.textContent = `A ${wrap('😀')} B ${wrap('🎵')} C`;
  d.body.appendChild(title);
  sandbox.queueTextNode(title.firstChild);
  t('a text node with a wrapped run is queued', get('textNodesToProcess.size') === 1);
  sandbox.processQueue();
  const spans = Array.from(title.querySelectorAll('emoji-render.twemoji-injected'));
  t(
    'two wrapped runs in one node become two emoji-render spans',
    spans.length === 2 &&
      srcOf({ src: spans[0].querySelector('img').src }) === '1f600.png' &&
      srcOf({ src: spans[1].querySelector('img').src }) === '1f3b5.png',
    title.innerHTML
  );
  const texts = Array.from(title.childNodes)
    .filter((n) => n.nodeType === 3 && n.nodeValue)
    .map((n) => n.nodeValue);
  t(
    'the plain text around the runs survives in order',
    texts.join('|') === 'A | B | C',
    JSON.stringify(texts)
  );
  t(
    'the queue is empty and the frame released once processed',
    get('textNodesToProcess.size') === 0 && get('emojiState.frameId') === null
  );

  // The node that held the first run was emptied and its span remembered: the
  // same run written into it again (as an incremental DOM update would) reuses
  // the span instead of adding one.
  const emptied = spans[0].previousSibling;
  t('setup: the node that held the run is now empty', emptied.nodeValue === '');
  emptied.nodeValue = wrap('😀');
  sandbox.queueTextNode(emptied);
  sandbox.processQueue();
  t(
    'a run written again into its node reuses the existing span',
    title.querySelectorAll('emoji-render').length === 2 && emptied.nodeValue === '',
    title.innerHTML
  );

  // A rendered span's own text: its twin is the plain emoji, never queued.
  const done = d.createElement('span');
  sandbox.renderTokens(done, sandbox.tokenizeEmoji('😀'));
  d.body.appendChild(done);
  sandbox.queueTextNode(done.querySelector('.twemoji-hidden-text').firstChild);
  t('the twin of a rendered emoji is not queued', get('textNodesToProcess.size') === 0);
  const para = d.createElement('p');
  para.textContent = wrap('😀');
  d.body.appendChild(para);
  sandbox.queueTextNode(para.firstChild);
  t(
    'a text node under a tag that never hosts emoji (<p>) is not queued',
    get('textNodesToProcess.size') === 0
  );
  const noEmoji = d.createElement('span');
  noEmoji.textContent = 'plain 😀 without sentinels';
  d.body.appendChild(noEmoji);
  sandbox.queueTextNode(noEmoji.firstChild);
  t('an emoji that adblock did not wrap is not queued', get('textNodesToProcess.size') === 0);

  // The token cache: past MAX_CACHE_SIZE entries the oldest half is dropped.
  const cache = get('parsedTextCache');
  const max = get('MAX_CACHE_SIZE');
  cache.clear();
  for (let i = 0; i < max + 1; i++) {
    const s = d.createElement('span');
    s.textContent = wrap(`😀 ${i}`);
    d.body.appendChild(s);
    sandbox.queueTextNode(s.firstChild);
  }
  sandbox.processQueue();
  t(
    'the cache is trimmed to the newer half once it passes MAX_CACHE_SIZE',
    cache.size === max - (max >> 1) + 1,
    `size ${cache.size} for ${max + 1} distinct runs`
  );
  t(
    'the trim drops the oldest entries and keeps the newest',
    !cache.has('😀 0') && !cache.has(`😀 ${(max >> 1) - 1}`) && cache.has(`😀 ${max}`)
  );
}

report.finish();
