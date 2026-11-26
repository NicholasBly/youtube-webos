# Performance

What the hot paths cost, how to measure a change, and what has already been
tried. Written for whoever optimises next, person or AI agent, so the same
ground is not covered twice. The rules the code keeps for old TVs are in
[ARCHITECTURE.md](ARCHITECTURE.md#rules-the-code-follows-for-old-tvs).

## Where the time goes

Nearly everything the app does per second is one of four things:

| Path | How often | Where |
| --- | --- | --- |
| The `JSON.parse` hook | every response and every other parse YouTube makes | `features/adblock/parse-hook.js` |
| Focus and key listeners | every remote key press | the shortcut router, the clock, the dislike panel, the thumbnail pause, DeArrow's sweep |
| SponsorBlock's time listener | 4 Hz while a segment is ahead, per frame within 1 s of one | `features/sponsorblock/skipping.js` |
| Observers | on DOM changes of what they watch | the progress bar (narrow, per ancestor), the legacy emoji fix (the whole body, webOS 3/4) |

The parse hook is the one that scales with what YouTube sends, so it is the
one measured below. Texts under 500 characters return through the native
parse at once; everything else is priced against the native parse of the
same text.

### The parse hook, by setting and response

`node tests/bench/response-bench.cjs <bundle> legacy`, Node 22 (V8 12), the
legacy bundle, median of 7 runs. `overhead` is hooked minus native, in
microseconds; `native` is what `JSON.parse` alone takes. A webOS 3 TV is, by
a rough estimate, 20 to 50 times slower, so 500 here would be 10 to 25 ms of
a blocked main thread there. None of these numbers was taken on a TV.

| Setting | Response | native | 0.8.5 | now |
| --- | --- | ---: | ---: | ---: |
| defaults | browse, 240 video tiles (158 KB) | 579 | 8 | 14 |
| defaults | comments, 300 (147 KB) | 571 | 4 | 9 |
| legacy emoji fix (webOS 3/4 default) | browse, no emoji | 592 | 508 | 164 |
| legacy emoji fix | browse, one emoji title | 585 | 449 | 342 |
| legacy emoji fix | comments, no emoji | 572 | 430 | 126 |
| DeArrow | browse, 240 video tiles | 622 | 70 | 70 |
| DeArrow | comments | 577 | 324 | 67 |
| DeArrow | live chat, 40 messages (10 KB) | 39 | 29 | 4 |
| everything on | browse, 240 video tiles | 630 | 1007 | 680 |
| everything on | comments | 578 | 1425 | 492 |
| everything on | live chat | 37 | 44 | 20 |

Rows within about 15 of each other are the same: that is the run-to-run
noise (a longer run of the defaults row gave 8.1 before and 8.9 after).

What the table says:

- **The defaults cost about 2 % of a parse.** There is nothing left to win
  there.
- **The legacy emoji fix is the largest default cost on the slowest TVs.**
  Before any walk it has to learn whether the text holds an emoji; that scan
  alone was 75 % of a parse and is now about 20 % (`mayNeedEmojiWork`: a
  class of a few ranges first, the exact class of some 150 only from where
  the first one matched). With an emoji anywhere in the response the whole
  tree is walked: about 180 on top, for one emoji or for 240.
- **A walk for something that is not there is the classic waste.** DeArrow
  walked every response for tiles, comments and live chat included; the
  thumbnail fallback scanned every section it could not read. Both now ask
  the text first.

## Measuring a change

1. Keep the bundle from before the change:
   `npm run build && cp dist/webOSUserScripts/userScript.js /tmp/before.js`
   (and `npm run build:modern` for the other flavour).
2. Make the change, build again, and run the bench on both bundles, more
   than once and alternating: one run drifts by more than most effects.
   `node tests/bench/response-bench.cjs /tmp/before.js legacy` and the same
   with `dist/webOSUserScripts/userScript.js`. `--json` prints rows a script
   can compare.
3. For a single function, load the source the way the unit tests do
   (`tests/harness/sandbox.cjs` `loadSources`) from two checkouts and time
   both in one process. That is how the emoji scan was compared, on seven
   kinds of text, with the answers checked equal.
4. To find where time goes: `npm run build:dev` (readable names), then
   `node --cpu-prof` on a script that loops the hooked parse through
   `tests/harness/page.cjs`. jsdom makes global lookups (`HTMLCanvasElement`,
   `window.x`) look far more expensive than they are on a TV: do not
   optimise those from a profile.
5. `npm run bench` also runs `hook-bench.cjs` (every filter on, one browse
   response, plus the stringify hook) and `panel-bench.cjs` (opening the
   settings: elements built in the key handler).

Node's V8 is not the TV's. Chromium 38 (webOS 3) is V8 3.28: no TurboFan, a
function with a `try` in it is never optimised, and a regular expression is
compiled differently. Prefer changes that remove work (a walk not made, a
scan that stops early) over changes that make the same work faster on one
engine: the first kind carries over, the second has to be measured on the
TV.

### On the TV

With the web inspector attached (`npm run inspect`), the counters are on
`window`: `__ytafAdblockStats`, `__ytafThumbStats`, `__ytafQualityStats`,
`__ytafContinuationStats`, `__ytafDeArrowStats`, and
`window.sponsorblock.barChecks` while a video plays. `npm run build:perf`
adds the perf monitor (press 0 three times).

To time the emoji scan on the TV itself, paste this in the console on the
home screen and scroll a little so responses arrive; it times the scan on
each real response text and prints the mean:

```js
(function () {
  var parse = JSON.parse, n = 0, total = 0;
  var first = /[\u00A9\u00AE\u200B\u200C\u203C-\u3299\uD83C-\uDBFF\uFEFF]/;
  JSON.parse = function (text) {
    if (typeof text === 'string' && text.length > 20000) {
      var t = performance.now();
      text.search(first);
      total += performance.now() - t;
      if (++n % 5 === 0) console.log('emoji first scan, mean ms:', (total / n).toFixed(2));
    }
    return parse.apply(this, arguments);
  };
})();
```

## Tried and set aside

Each of these was measured or reasoned through and not done. Reopen one only
with new evidence.

| Idea | Why not |
| --- | --- |
| A lookahead in front of the exact emoji class, `(?=[^\0-\xA8])[...]`, so ASCII fails on one comparison | No faster on a two-byte text (401 against 372), and four times slower on a one-byte one |
| A `charCodeAt` loop over the text, with the exact class tried on the non-ASCII characters only | Faster than the exact scan on two-byte text in Node (239 against 372) but 2.4 times slower on ASCII-only text, and the speed of a script loop on V8 3.28 cannot be taken from Node. The few-range class is ahead of it on every text (81) and stays a native scan |
| Asking the text for `i.ytimg.com` before every thumbnail pass | A response whose lists the paths read needs no scan at all, so the question would cost a full `indexOf` miss for nothing. It is asked only when a fallback scan is about to run |
| Finding DeArrow's tiles along the schema paths instead of the walk | A real video tile stops the walk (it is not descended into), so on a browse response the walk is already short: 70 on top of 620. The cost was the responses without tiles, which the text gate removes exactly; paths would add a second place to keep in step with YouTube |
| Counting `"tileRenderer"` in the text to prove a path walk found every tile | The filters remove tiles (ads, Shorts, live) between the text and the tree, so the counts differ whenever a filter did anything |
| One shared walk for the emoji fix, the thumbnails and DeArrow | They visit different nodes (every text field; thumbnail containers along paths; tiles only) and stop at different places. Merged, each would pay for the widest |
| Turning the handlers' fields into explicit state objects | The readers are the hot paths, the fields are what some 3,000 test checks pin, and the bundle would grow for no behaviour gained. The states are named in [STATE-MACHINES.md](STATE-MACHINES.md) and the rules run in the tests instead |
| Remembering which stylesheets the comments fix already scanned | Its startup scans stop once the rules are found, which is the first scan after YouTube's stylesheet loads; repeats happen only after YouTube renames the class, and stop when the stylesheet count holds still |
| Starting the webOS 3/4 buffer trim timer only while a MediaSource exists | One timer every 5 s over an empty list: nothing a TV can notice, against a new way for the trim to be off when it is needed |

## Open, in order of expected worth

1. **The emoji walk itself** (webOS 3/4, default on): about a third of a
   parse whenever a response holds one emoji, since the whole tree is then
   walked. Skipping subtrees that never hold text (thumbnail lists, endpoint
   commands) needs captured real responses to prove no text field is missed;
   a tile in the generator has 17 objects, a real one several times that.
2. **Tracking Block's rewrite** (off by default): the text is copied with
   every `trackingParams` blanked, about a third of a parse. A copy is what
   a text rewrite costs; the alternative, blanking after the parse, was
   measured slower by the project before.
3. **Playback Speed's player check** (webOS 23+, experimental): once
   installed, a 1 s interval looks the player up for the rest of the
   session, also after the setting is turned off, and falls back to a
   document-wide class selector while no player is on the page. Binding on
   the player's state events instead needs a check on Shorts, where
   `yt-player-state-change` is not published.
4. **A failed segment fetch is final for the video** (see Per-video instance
   in STATE-MACHINES.md): after the fallback server and two retries, a TV
   that was still getting its network back shows no segments until the next
   video. A retry on the next PLAYING would be cheap; it changes when the
   API is asked, so it wants the maintainer's call.
