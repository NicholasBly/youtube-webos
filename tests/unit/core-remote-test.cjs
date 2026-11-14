/**
 * core/remote.js as a unit in a vm sandbox: sendKey through the createEvent
 * fallback (webOS 3, where the KeyboardEvent constructor throws) and the
 * modern constructor, the colour-code table with the alternate codes, keyCodeOf.
 *
 * Run: node tests/unit/core-remote-test.cjs
 */
const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { CORE, loggerStub, blankDom } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- core/remote.js: the createEvent fallback ------------------------------------
  {
    const win = blankDom().window;
    // webOS 3: `new KeyboardEvent(...)` throws, so the module must detect that at
    // load and build its events with document.createEvent.
    class ThrowingKeyboardEvent {
      constructor() {
        throw new TypeError('Illegal constructor');
      }
    }
    let created = 0;
    const realCreateEvent = win.document.createEvent.bind(win.document);
    win.document.createEvent = (kind) => {
      created++;
      return realCreateEvent(kind);
    };
    const { createLogger, lines } = loggerStub();
    const { sandbox, get } = loadSources([CORE('remote.js')], {
      createLogger,
      KeyboardEvent: ThrowingKeyboardEvent,
      document: win.document,
      window: win
    });
    const REMOTE_KEYS = get('REMOTE_KEYS');
    const FLAG = get('SYNTHETIC_KEY_FLAG');
    const keyCodeOf = get('keyCodeOf');
    const seen = [];
    const record = (e) =>
      seen.push({
        type: e.type,
        keyCode: e.keyCode,
        which: e.which,
        charCode: e.charCode,
        key: e.key,
        flag: e[FLAG],
        target: e.target
      });
    win.document.body.addEventListener('keydown', record);
    win.document.body.addEventListener('keyup', record);

    sandbox.sendKey(REMOTE_KEYS.RED);
    t(
      'fallback: a key press is a keydown then a keyup on document.body by default',
      seen.length === 2 &&
        seen[0].type === 'keydown' &&
        seen[1].type === 'keyup' &&
        seen[0].target === win.document.body,
      JSON.stringify(seen.map((s) => s.type))
    );
    t('fallback: both events were built with document.createEvent', created === 2, String(created));
    t(
      'fallback: keyCode and which read the key code through the getters, charCode is 0',
      seen.every((s) => s.keyCode === 403 && s.which === 403 && s.charCode === 0),
      JSON.stringify(seen)
    );
    t(
      'fallback: initKeyboardEvent carries the key name',
      seen.every((s) => s.key === 'Red'),
      JSON.stringify(seen.map((s) => s.key))
    );
    t(
      'fallback: both events carry the synthetic flag as a plain true property',
      FLAG === '__ytafSynthetic' && seen.every((s) => s.flag === true)
    );

    seen.length = 0;
    sandbox.sendKey(REMOTE_KEYS.YELLOW_ALT);
    t(
      'fallback: YELLOW_ALT reports 170 in charCode as well as keyCode, the way webOS 3 does',
      seen.length === 2 && seen.every((s) => s.keyCode === 170 && s.charCode === 170),
      JSON.stringify(seen)
    );
    t('keyCodeOf of the alternate yellow event is 170', keyCodeOf(seen[0]) === 170);

    seen.length = 0;
    const other = win.document.createElement('div');
    win.document.body.appendChild(other);
    const onOther = [];
    other.addEventListener('keydown', (e) => onOther.push(e.keyCode));
    sandbox.sendKey(REMOTE_KEYS.ENTER, other);
    t(
      'an explicit target gets the press, and it bubbles to the body',
      onOther.join() === '13' && seen.length === 2 && seen[0].target === other,
      JSON.stringify(onOther)
    );

    seen.length = 0;
    sandbox.sendKey({ key: 'Nothing' });
    sandbox.sendKey(undefined);
    t(
      'a key definition without a code is refused with a warning and nothing is dispatched',
      seen.length === 0 && lines.warn.length === 2 && /Invalid key definition/.test(lines.warn[0]),
      lines.warn.join(' | ')
    );
  }

  // ---- core/remote.js: the modern constructor ----------------------------------------
  {
    const win = blankDom().window;
    let constructed = 0;
    const CountingKeyboardEvent = new Proxy(win.KeyboardEvent, {
      construct(Target, args) {
        constructed++;
        return new Target(...args);
      }
    });
    let created = 0;
    const realCreateEvent = win.document.createEvent.bind(win.document);
    win.document.createEvent = (kind) => {
      created++;
      return realCreateEvent(kind);
    };
    const { createLogger } = loggerStub();
    const { sandbox, get } = loadSources([CORE('remote.js')], {
      createLogger,
      KeyboardEvent: CountingKeyboardEvent,
      document: win.document,
      window: win
    });
    const REMOTE_KEYS = get('REMOTE_KEYS');
    const FLAG = get('SYNTHETIC_KEY_FLAG');
    const keyCodeOf = get('keyCodeOf');
    t(
      'modern: the module probes the constructor once at load',
      constructed === 1,
      String(constructed)
    );
    const seen = [];
    win.document.body.addEventListener('keydown', (e) => seen.push(e));
    win.document.body.addEventListener('keyup', (e) => seen.push(e));
    sandbox.sendKey(REMOTE_KEYS.BLUE);
    t(
      'modern: both events come from the constructor, none from createEvent',
      constructed === 3 && created === 0,
      constructed + '/' + created
    );
    t(
      'modern: keyCode, which and the key name are set, the press bubbles and is not cancelable',
      seen.length === 2 &&
        seen.every(
          (e) =>
            e.keyCode === 406 &&
            e.which === 406 &&
            e.charCode === 0 &&
            e.key === 'Blue' &&
            e.bubbles &&
            !e.cancelable
        ),
      seen.map((e) => [e.keyCode, e.key, e.bubbles, e.cancelable].join(':')).join(' | ')
    );
    t(
      'modern: the synthetic flag is on both events',
      seen.every((e) => e[FLAG] === true)
    );
    t(
      'modern: the events are real KeyboardEvents of the page',
      seen.every((e) => e instanceof win.KeyboardEvent)
    );

    // The colour-code table and keyCodeOf need no DOM.
    const map = get('COLOR_CODE_MAP');
    const entries = [...map].map(([c, n]) => c + ':' + n).join(',');
    t(
      'COLOR_CODE_MAP has the four primary colour codes',
      map.get(403) === 'red' &&
        map.get(404) === 'green' &&
        map.get(405) === 'yellow' &&
        map.get(406) === 'blue',
      entries
    );
    t(
      'COLOR_CODE_MAP has the alternate codes: 166 red, 172 green, 170 yellow, 167 and 191 blue',
      map.get(166) === 'red' &&
        map.get(172) === 'green' &&
        map.get(170) === 'yellow' &&
        map.get(167) === 'blue' &&
        map.get(191) === 'blue',
      entries
    );
    t(
      'COLOR_CODE_MAP has nine entries and no navigation keys',
      map.size === 9 && !map.has(13) && !map.has(461),
      entries
    );
    t(
      'REMOTE_KEYS.YELLOW_ALT is the 170 half of the yellow burst, with charCode set',
      REMOTE_KEYS.YELLOW_ALT.code === 170 &&
        REMOTE_KEYS.YELLOW_ALT.charCode === 170 &&
        REMOTE_KEYS.YELLOW.alt.includes(170)
    );
    t(
      'keyCodeOf: charCode wins when set',
      keyCodeOf({ charCode: 170, keyCode: 0 }) === 170 &&
        keyCodeOf({ charCode: 166, keyCode: 403 }) === 166
    );
    t(
      'keyCodeOf: keyCode when charCode is 0 or missing',
      keyCodeOf({ charCode: 0, keyCode: 403 }) === 403 && keyCodeOf({ keyCode: 461 }) === 461
    );
  }

  report.finish();
})();
