/**
 * features/adblock/stringify-hook as a unit: the TypeScript source is compiled
 * and loaded into a vm sandbox whose own JSON object the hook patches, with the
 * adblock flags (cfgFlags) and the logger stubbed. The checks cover the isInlinePlaybackNoAd
 * flag appearing in the serialised player request and the body being restored
 * afterwards (an absent key removed, a `false` put back as `false`, the restore
 * surviving a cyclic body the original throws on), the bounded breadth-first
 * fallback for a moved playbackContext (MAX_DEPTH, MAX_NODES, the videoId plus
 * context gate), replacer and space passing through, non-objects serialising
 * as native does, and the Ad Blocking switch read from the adblock flags, with
 * no config listener of the hook's own.
 *
 * Run: node tests/unit/stringify-hook-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC, CORE } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const SOURCE = path.join(SRC, 'features', 'adblock', 'stringify-hook.ts');

/** A fresh sandbox with the hook installed, Ad Blocking initially `adBlockOn`. */
function load(adBlockOn) {
  const listeners = [];
  const cfgFlags = { enableAdBlock: adBlockOn };
  const { sandbox, get } = loadSources(
    [CORE('bounded-search.js'), SOURCE],
    {
      log: { debug() {}, info() {}, warn() {}, error() {} },
      // What adblock/flags.js keeps current; the hook reads it on every call.
      cfgFlags,
      // Recorded only to show the hook adds none of its own.
      configRead: () => undefined,
      configAddChangeListener: (key, cb) => listeners.push({ key, cb })
    },
    { ts: true }
  );
  // The sandbox has its own JSON intrinsic, so the hook never touches this
  // process's JSON.stringify.
  const JSON = get('JSON');
  const original = JSON.stringify;
  sandbox.installStringifyHook();
  return {
    sb: sandbox,
    get,
    JSON,
    original,
    listeners,
    stringify: (...args) => JSON.stringify(...args),
    // What adblock/flags.js does when the Ad Blocking setting changes.
    set: (value) => {
      cfgFlags.enableAdBlock = !!value;
    }
  };
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** A player request as the TV app sends it, with the given contentPlaybackContext. */
function playerBody(ctx) {
  return {
    videoId: 'dQw4w9WgXcQ',
    context: { client: { clientName: 'TVHTML5', clientVersion: '7.0' } },
    playbackContext: { contentPlaybackContext: ctx || { vis: 0, lactMilliseconds: '1' } }
  };
}

/** `inner` wrapped in `levels` single-key objects. */
function wrap(inner, levels) {
  let obj = inner;
  for (let i = 0; i < levels; i++) obj = { a: obj };
  return obj;
}

const flagIn = (json) => {
  const parsed = JSON.parse(json);
  const ctx = parsed.playbackContext && parsed.playbackContext.contentPlaybackContext;
  return ctx ? ctx.isInlinePlaybackNoAd : undefined;
};

// ---- installation ---------------------------------------------------------
{
  const m = load(true);
  t('the hook replaces the sandbox JSON.stringify', m.JSON.stringify !== m.original);
  const installed = m.JSON.stringify;
  m.sb.installStringifyHook();
  t('a second install keeps the same function', m.JSON.stringify === installed);
  eq('the hook adds no config listener: the adblock flags carry the switch', m.listeners.length, 0);
  t('the test process JSON.stringify is untouched', JSON.stringify !== m.JSON.stringify);
}

// ---- the flag on the shape YouTube sends ------------------------------------
{
  const m = load(true);
  const body = playerBody();
  const ctx = body.playbackContext.contentPlaybackContext;
  const out = m.stringify(body);
  eq('the flag is in the serialised request', flagIn(out), true);
  t('the rest of the request is intact', JSON.parse(out).videoId === 'dQw4w9WgXcQ');
  t('the flag is removed from the body afterwards', !hasOwn(ctx, 'isInlinePlaybackNoAd'));
  eq(
    'the body serialises as the original would once restored',
    m.original(body),
    m.stringify(body).replace(',"isInlinePlaybackNoAd":true', '')
  );

  const root = { playbackContext: { contentPlaybackContext: {} } };
  eq('a root playbackContext is enough, with no videoId', flagIn(m.stringify(root)), true);
}
{
  const m = load(true);
  const body = playerBody({ vis: 0, isInlinePlaybackNoAd: false });
  const ctx = body.playbackContext.contentPlaybackContext;
  const out = m.stringify(body);
  eq('a false flag is serialised as true', flagIn(out), true);
  t(
    'and put back as false, not deleted',
    hasOwn(ctx, 'isInlinePlaybackNoAd') && ctx.isInlinePlaybackNoAd === false,
    JSON.stringify(ctx)
  );
}
{
  const m = load(true);
  const body = playerBody({ isInlinePlaybackNoAd: true, vis: 0 });
  const out = m.stringify(body);
  eq('a flag already true stays true', flagIn(out), true);
  eq(
    'and the key keeps its place',
    Object.keys(body.playbackContext.contentPlaybackContext).join(','),
    'isInlinePlaybackNoAd,vis'
  );
}
{
  const m = load(true);
  const body = playerBody();
  const ctx = body.playbackContext.contentPlaybackContext;
  body.loop = body;
  report.throws('a cyclic body still throws as native does', () => m.stringify(body), /circular/i);
  t('the flag is removed after the throw', !hasOwn(ctx, 'isInlinePlaybackNoAd'));

  const falsy = playerBody({ isInlinePlaybackNoAd: false });
  falsy.loop = falsy;
  report.throws('a cyclic body with a false flag throws', () => m.stringify(falsy), /circular/i);
  eq(
    'and the false flag is put back',
    falsy.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd,
    false
  );
}
{
  const m = load(true);
  // A playbackContext getter that throws: the hook gives up on the body and
  // native serialisation (which skips the non-enumerable getter) still runs.
  const body = { videoId: 'x', context: {} };
  Object.defineProperty(body, 'playbackContext', {
    get() {
      throw new Error('boom');
    },
    enumerable: false
  });
  let out;
  try {
    out = m.stringify(body);
  } catch (e) {
    out = 'threw ' + e.message;
  }
  eq('a body the hook cannot inspect is serialised untouched', out, '{"videoId":"x","context":{}}');
}

// ---- the fallback search --------------------------------------------------
{
  const m = load(true);
  const MAX_DEPTH = m.get('MAX_DEPTH');
  const MAX_NODES = m.get('MAX_NODES');
  const moved = {
    videoId: 'x',
    context: {},
    extra: { playbackContext: playerBody().playbackContext }
  };
  const out = JSON.parse(m.stringify(moved));
  eq(
    'a moved playbackContext is found by the walk',
    out.extra.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd,
    true
  );
  t(
    'and restored afterwards',
    !hasOwn(moved.extra.playbackContext.contentPlaybackContext, 'isInlinePlaybackNoAd')
  );

  const noVideo = { context: {}, extra: { playbackContext: playerBody().playbackContext } };
  eq(
    'without a videoId the walk is not attempted',
    JSON.parse(m.stringify(noVideo)).extra.playbackContext.contentPlaybackContext
      .isInlinePlaybackNoAd,
    undefined
  );
  const noContext = { videoId: 'x', extra: { playbackContext: playerBody().playbackContext } };
  eq(
    'without a context the walk is not attempted',
    JSON.parse(m.stringify(noContext)).extra.playbackContext.contentPlaybackContext
      .isInlinePlaybackNoAd,
    undefined
  );

  const deep = (levels) =>
    Object.assign(
      { videoId: 'x', context: {} },
      wrap({ playbackContext: playerBody().playbackContext }, levels)
    );
  const holder = (body, levels) => {
    let node = body;
    for (let i = 0; i < levels; i++) node = node.a;
    return node.playbackContext.contentPlaybackContext;
  };
  const atMax = deep(MAX_DEPTH);
  const atMaxOut = JSON.parse(m.stringify(atMax));
  eq(
    'a holder at MAX_DEPTH is still found',
    holder(atMaxOut, MAX_DEPTH).isInlinePlaybackNoAd,
    true
  );
  const beyond = deep(MAX_DEPTH + 1);
  const beyondOut = JSON.parse(m.stringify(beyond));
  eq(
    'a holder one level deeper is left alone',
    holder(beyondOut, MAX_DEPTH + 1).isInlinePlaybackNoAd,
    undefined
  );

  // Breadth first: root, context and pad are visited, then pad's children in
  // order, the holder last. The walk gives up after MAX_NODES visits.
  const padded = (siblings) => {
    const pad = {};
    for (let i = 0; i < siblings; i++) pad['c' + i] = {};
    pad.holder = { playbackContext: playerBody().playbackContext };
    return { videoId: 'x', context: {}, pad };
  };
  const under = padded(MAX_NODES - 100);
  eq(
    'a body under the node budget is found',
    JSON.parse(m.stringify(under)).pad.holder.playbackContext.contentPlaybackContext
      .isInlinePlaybackNoAd,
    true
  );
  const over = padded(MAX_NODES + 100);
  eq(
    'a body past the node budget is left alone',
    JSON.parse(m.stringify(over)).pad.holder.playbackContext.contentPlaybackContext
      .isInlinePlaybackNoAd,
    undefined
  );
}

// ---- replacer and space ---------------------------------------------------
{
  const m = load(true);
  const plain = { b: 2, a: 'x', c: [1, 2] };
  eq('an array replacer passes through', m.stringify(plain, ['a']), m.original(plain, ['a']));
  eq('space as a number passes through', m.stringify(plain, null, 2), m.original(plain, null, 2));
  eq(
    'space as a string passes through',
    m.stringify(plain, null, '\t'),
    m.original(plain, null, '\t')
  );

  const seen = [];
  const replacer = function (key, value) {
    seen.push(key);
    return typeof value === 'string' ? value.toUpperCase() : value;
  };
  const out = m.stringify(playerBody(), replacer, 2);
  t('a function replacer sees the injected flag', seen.includes('isInlinePlaybackNoAd'));
  eq(
    'replacer and space apply to the flagged request',
    out,
    m.original(
      playerBody({ vis: 0, lactMilliseconds: '1', isInlinePlaybackNoAd: true }),
      replacer,
      2
    )
  );
  t(
    'the pretty output carries the flag with its indent',
    /\n {6}"isInlinePlaybackNoAd": true/.test(out)
  );
}

// ---- non-objects ----------------------------------------------------------
{
  const m = load(true);
  eq('a string', m.stringify('a "quoted" string'), m.original('a "quoted" string'));
  eq('a number', m.stringify(42.5), '42.5');
  eq('null', m.stringify(null), 'null');
  eq('undefined', m.stringify(undefined), undefined);
  eq('a boolean', m.stringify(false), 'false');
  const list = [playerBody(), 1, 'x'];
  eq('an array is left alone even with a request inside', m.stringify(list), m.original(list));
  t(
    'and nothing was injected into it',
    !hasOwn(list[0].playbackContext.contentPlaybackContext, 'isInlinePlaybackNoAd')
  );
}

// ---- the fast path: a body that is not a player request ----------------------
{
  const m = load(true);
  // Every property read, on an object without the request's keys.
  const reads = [];
  const target = { a: 1, b: { c: 2 } };
  const body = new Proxy(target, {
    get(t, key, receiver) {
      reads.push(String(key));
      return Reflect.get(t, key, receiver);
    }
  });
  const out = m.stringify(body);
  t(
    'a body without the request keys has nothing read by the hook, only by the serialiser',
    reads.every((k) => k !== 'playbackContext' && k !== 'videoId' && k !== 'context'),
    reads.join(',')
  );
  eq('and serialises as native', out, m.original(target));
}

// ---- the Ad Blocking switch -------------------------------------------------
{
  const m = load(false);
  eq('with Ad Blocking off the request is untouched', flagIn(m.stringify(playerBody())), undefined);
  m.set(true);
  eq('switching Ad Blocking on arms the hook', flagIn(m.stringify(playerBody())), true);
  m.set(0);
  eq('switching it off again disarms it', flagIn(m.stringify(playerBody())), undefined);
}

report.finish();
