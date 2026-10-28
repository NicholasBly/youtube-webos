/**
 * Behaviour test for src/youtube-ai-label.js (the official AI-label lookup).
 * No live network: a controllable XMLHttpRequest and clock stand in for both.
 * Response fixtures are minimal copies of real /youtubei/v1/next answers
 * (trackingParams stripped): H3Pdf8iRw5E carried the AI badge, dQw4w9WgXcQ none.
 *
 * Usage: node bench/ai-label-test.cjs
 */
/* global __dirname */
// Cases run one after another on purpose: they share the fake XHR list, the
// fake clock and a freshly imported service, so running them concurrently
// would mix their requests together.
/* eslint-disable no-await-in-loop */
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SERVICE = pathToFileURL(path.join(ROOT, 'src/youtube-ai-label.js')).href;

// ---- controllable environment ---------------------------------------------
let clock = 1700000000000;
Date.now = () => clock;
const advance = (ms) => { clock += ms; };

const xhrs = [];
class FakeXHR {
  constructor() {
    this.headers = {};
    this.aborted = false;
    this.timeout = 0;
    this.status = 0;
    this.responseText = '';
    xhrs.push(this);
  }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  send(body) { this.body = body; }
  abort() { this.aborted = true; }
}
globalThis.XMLHttpRequest = FakeXHR;

const respond = (x, status, text) => {
  x.status = status;
  x.responseText = typeof text === 'string' ? text : JSON.stringify(text);
  if (x.onload) x.onload();
};
const failNetwork = (x) => { if (x.onerror) x.onerror(); };
const failTimeout = (x) => { if (x.ontimeout) x.ontimeout(); };

// ---- fixtures ---------------------------------------------------------------
const wrap = (contents) => ({
  contents: { twoColumnWatchNextResults: { results: { results: { contents } } } }
});
const AI_BADGE = {
  metadataBadgeRenderer: {
    icon: { iconType: 'INFO' }, label: 'AI',
    accessibilityData: { label: 'AI: Content was made with AI' }
  }
};
const AI_RESPONSE = wrap([{ videoPrimaryInfoRenderer: { badges: [AI_BADGE] } }]);
const PLAIN_RESPONSE = wrap([{ videoPrimaryInfoRenderer: {} }]);

const id = (n) => 'v' + String(n).padStart(10, '0');
const flush = () => new Promise((r) => setImmediate(r));
const used = () => xhrs.length;

let pass = 0, fail = 0;
const t = (n, ok, extra) => {
  if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); }
};

let generation = 0;
// Fresh module instance (own cache, queue and rate-limit state) per test.
const fresh = async () => {
  xhrs.length = 0;
  return import(SERVICE + '?case=' + (generation++));
};

async function main() {
  // ---- request shape ----
  {
    const svc = await fresh();
    const p = svc.getAiLabel('H3Pdf8iRw5E');
    const x = xhrs[0];
    t('request: exactly one XHR', xhrs.length === 1);
    t('request: POST to same-origin /youtubei/v1/next', x && x.method === 'POST' &&
      /^\/youtubei\/v1\/next\?/.test(x.url), x && x.url);
    t('request: prettyPrint off and field mask limited to primary-info badges', x &&
      /prettyPrint=false/.test(x.url) &&
      x.url.indexOf('fields=' + encodeURIComponent(
        'contents.twoColumnWatchNextResults.results.results.contents.videoPrimaryInfoRenderer.badges')) !== -1,
      x && x.url);
    t('request: JSON content type', x && x.headers['Content-Type'] === 'application/json');
    const body = x && JSON.parse(x.body);
    t('request: English WEB client context with the video id', !!body &&
      body.videoId === 'H3Pdf8iRw5E' && body.context.client.clientName === 'WEB' &&
      body.context.client.hl === 'en' && /^2\./.test(body.context.client.clientVersion), x && x.body);
    t('request: 5s timeout', x && x.timeout === 5000, x && String(x.timeout));
    respond(x, 200, AI_RESPONSE);
    const r = await p;
    t('classify: INFO + "AI" badge is ai', r.status === 'ai', JSON.stringify(r));
    t('classify: ai result valid for one hour', r.expiresAt === clock + 3600000, JSON.stringify(r));
  }

  // ---- classification ----
  {
    const svc = await fresh();
    const p = svc.getAiLabel('dQw4w9WgXcQ');
    respond(xhrs[0], 200, PLAIN_RESPONSE);
    const r = await p;
    t('classify: primary info without badges is not_ai', r.status === 'not_ai', JSON.stringify(r));
  }
  {
    const svc = await fresh();
    const other = { metadataBadgeRenderer: { icon: { iconType: 'CHECK_CIRCLE_THICK' }, label: 'Verified' } };
    const p = svc.getAiLabel(id(1));
    respond(xhrs[0], 200, wrap([
      { somethingElse: {} },
      { videoPrimaryInfoRenderer: { badges: [other, { metadataBadgeRenderer: { icon: { iconType: 'INFO' }, label: 'AI' } }] } }
    ]));
    const r = await p;
    t('classify: AI badge is found past other badges and other contents', r.status === 'ai', JSON.stringify(r));
  }
  for (const [name, badge] of [
    ['INFO icon alone', { metadataBadgeRenderer: { icon: { iconType: 'INFO' }, label: 'Captions' } }],
    ['AI label on another icon', { metadataBadgeRenderer: { icon: { iconType: 'CHECK' }, label: 'AI' } }],
    ['camera-capture style badge', { metadataBadgeRenderer: { icon: { iconType: 'INFO' }, label: 'Captured with a camera' } }],
    ['badge without a renderer', { somethingElse: { label: 'AI' } }]
  ]) {
    const svc = await fresh();
    const p = svc.getAiLabel(id(2));
    respond(xhrs[0], 200, wrap([{ videoPrimaryInfoRenderer: { badges: [badge] } }]));
    const r = await p;
    t('classify: ' + name + ' is not an AI label', r.status === 'not_ai', JSON.stringify(r));
  }

  // ---- failures are unknown, never not_ai ----
  const failures = [
    ['HTTP 403', (x) => respond(x, 403, '{}')],
    ['HTTP 500', (x) => respond(x, 500, '')],
    ['invalid JSON', (x) => respond(x, 200, '<html>')],
    ['unexpected structure', (x) => respond(x, 200, { contents: {} })],
    ['network error', failNetwork],
    ['timeout', failTimeout]
  ];
  for (const [name, doFail] of failures) {
    const svc = await fresh();
    const p = svc.getAiLabel(id(3));
    doFail(xhrs[0]);
    const r = await p;
    t('failure: ' + name + ' resolves unknown for 60s', r.status === 'unknown' &&
      r.expiresAt === clock + 60000, JSON.stringify(r));
    const again = await svc.getAiLabel(id(3));
    t('failure: ' + name + ' is not retried within the 60s window',
      used() === 1 && again.status === 'unknown');
    advance(60001);
    svc.getAiLabel(id(3));
    t('failure: ' + name + ' is retried after the window', used() === 2);
  }

  // ---- identifiers ----
  {
    const svc = await fresh();
    const bad = [undefined, null, 42, '', 'short', 'toolongvideoid1', 'bad id 123..', 'ab\u00e9defghijk', {}];
    let allUnknown = true;
    for (const v of bad) {
      const r = await svc.getAiLabel(v);
      if (r.status !== 'unknown') allUnknown = false;
    }
    t('ids: malformed ids resolve unknown', allUnknown);
    t('ids: malformed ids never produce a request', used() === 0, 'requests: ' + used());
    svc.getAiLabel('AbC_-123456');
    t('ids: 11-char id with _ and - is accepted', used() === 1);
  }

  // ---- sharing, concurrency, TTL ----
  {
    const svc = await fresh();
    const a = svc.getAiLabel(id(4));
    const b = svc.getAiLabel(id(4));
    const c = svc.getAiLabel(id(4));
    t('dedupe: concurrent lookups of one id share one request', used() === 1, 'requests: ' + used());
    respond(xhrs[0], 200, AI_RESPONSE);
    const rs = await Promise.all([a, b, c]);
    t('dedupe: every waiter receives the result', rs.every((r) => r.status === 'ai'));
    const d = await svc.getAiLabel(id(4));
    t('cache: later lookup is served without a request', used() === 1 && d.status === 'ai');
  }
  {
    const svc = await fresh();
    const ps = [];
    for (let i = 0; i < 5; i++) ps.push(svc.getAiLabel(id(10 + i)));
    t('concurrency: at most 2 requests in flight', used() === 2, 'requests: ' + used());
    respond(xhrs[0], 200, PLAIN_RESPONSE);
    await flush();
    t('concurrency: a finished request admits the next one', used() === 3, 'requests: ' + used());
    respond(xhrs[1], 200, PLAIN_RESPONSE);
    respond(xhrs[2], 200, PLAIN_RESPONSE);
    await flush();
    t('concurrency: still capped at 2 while draining', used() === 5 && xhrs.slice(3).every((x) => !x.status),
      'requests: ' + used());
    respond(xhrs[3], 200, PLAIN_RESPONSE);
    respond(xhrs[4], 200, PLAIN_RESPONSE);
    const rs = await Promise.all(ps);
    t('concurrency: all queued lookups complete', rs.every((r) => r.status === 'not_ai'));
  }
  {
    const svc = await fresh();
    const p = svc.getAiLabel(id(5));
    respond(xhrs[0], 200, AI_RESPONSE);
    await p;
    advance(3599000);
    const hit = await svc.getAiLabel(id(5));
    t('ttl: result still served just inside one hour', used() === 1 && hit.status === 'ai');
    t('ttl: a cache read does not extend the expiry', hit.expiresAt === clock - 3599000 + 3600000,
      JSON.stringify(hit));
    advance(2000);
    svc.getAiLabel(id(5));
    t('ttl: expired result triggers a new lookup', used() === 2, 'requests: ' + used());
  }

  // ---- cache bound ----
  {
    const svc = await fresh();
    for (let i = 0; i < 1000; i++) {
      const p = svc.getAiLabel(id(1000 + i));
      respond(xhrs[xhrs.length - 1], 200, PLAIN_RESPONSE);
      await p;
    }
    t('cache bound: 1000 entries all retained', (await svc.getAiLabel(id(1000))) && used() === 1000);
    // id(1000) was just read, so it is the most recently used; id(1001) is oldest.
    const p = svc.getAiLabel(id(5000));
    respond(xhrs[xhrs.length - 1], 200, PLAIN_RESPONSE);
    await p;
    const before = used();
    await svc.getAiLabel(id(1000));
    t('cache bound: a recently read entry survives eviction', used() === before);
    svc.getAiLabel(id(1001));
    t('cache bound: least recently used entry was evicted', used() === before + 1,
      'requests: ' + used() + ' expected ' + (before + 1));
  }

  // ---- rate limiting ----
  {
    const svc = await fresh();
    const a = svc.getAiLabel(id(20));
    const b = svc.getAiLabel(id(21));
    const queued = svc.getAiLabel(id(22));
    respond(xhrs[0], 429, '{}');
    const ra = await a;
    const rq = await queued;
    t('429: the limited lookup resolves unknown', ra.status === 'unknown', JSON.stringify(ra));
    t('429: lookups still waiting in the queue resolve unknown', rq.status === 'unknown', JSON.stringify(rq));
    t('429: waiting lookups never reach the network', used() === 2, 'requests: ' + used());
    const during = await svc.getAiLabel(id(23));
    t('429: no new request during the pause', during.status === 'unknown' && used() === 2,
      'requests: ' + used());
    advance(30000);
    await svc.getAiLabel(id(23));
    t('429: still paused 30s later', used() === 2);
    advance(30001);
    svc.getAiLabel(id(22));
    t('429: new lookups are allowed after 60s', used() === 3, 'requests: ' + used());
    respond(xhrs[1], 200, AI_RESPONSE);
    const rb = await b;
    t('429: the other in-flight request still completes normally', rb.status === 'ai');
    // The paused result must not poison the cache as a negative answer.
    respond(xhrs[2], 200, AI_RESPONSE);
    const later = await svc.getAiLabel(id(22));
    t('429: the paused id is not cached as not_ai', later.status === 'ai', JSON.stringify(later));
  }

  // ---- cancellation ----
  {
    const svc = await fresh();
    let settled = 0;
    const results = [];
    const watch = (p) => p.then((r) => { settled++; results.push(r); });
    watch(svc.getAiLabel(id(30)));
    watch(svc.getAiLabel(id(30)));
    watch(svc.getAiLabel(id(31)));
    watch(svc.getAiLabel(id(32)));
    t('cancel setup: 2 active + 1 queued', used() === 2);
    svc.cancelAiLabelRequests();
    await flush();
    t('cancel: every waiter settles exactly once', settled === 4, 'settled: ' + settled);
    t('cancel: waiters get unknown', results.every((r) => r.status === 'unknown'));
    t('cancel: active XHRs are aborted', xhrs[0].aborted && xhrs[1].aborted);
    t('cancel: queued lookup is dropped without a request', used() === 2, 'requests: ' + used());
    respond(xhrs[0], 200, AI_RESPONSE);
    respond(xhrs[1], 200, AI_RESPONSE);
    await flush();
    t('cancel: a late response does not start queued work', used() === 2, 'requests: ' + used());
    svc.getAiLabel(id(30));
    t('cancel: a late response is not cached', used() === 3, 'requests: ' + used());
    // Capacity must be fully restored after a cancel.
    svc.getAiLabel(id(33));
    t('cancel: capacity is restored for new work', used() === 4, 'requests: ' + used());
  }
  {
    const svc = await fresh();
    const p = svc.getAiLabel(id(40));
    respond(xhrs[0], 200, AI_RESPONSE);
    await p;
    svc.cancelAiLabelRequests();
    const again = await svc.getAiLabel(id(40));
    t('cancel: already cached results are kept', used() === 1 && again.status === 'ai');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
