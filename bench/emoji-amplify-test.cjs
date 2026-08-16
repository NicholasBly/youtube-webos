/**
 * Does emoji-font.js AMPLIFY YouTube's own DOM churn, or merely observe it?
 *
 * The TV session showed ~30 emoji-observer records/sec on an idle home screen
 * with domNodes flat. This drives a fixed number of YouTube-style incremental
 * -dom text updates (which set node.data in place, as YouTube TV does) and
 * counts total records, with the emoji fix ON vs OFF.
 *
 *   ratio ~1.0  -> the observer is a passive witness to YouTube's churn
 *   ratio >1.0  -> our own writes are feeding back into the observer
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';
const TICKS = 40;

function run(emojiOn, withEmojiText) {
  return new Promise((resolve) => {
    const dom = new JSDOM(
      '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
      { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
        virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
    const win = dom.window;
    setUserAgent(win, UA.webos3);
    win.launchParams = '{}';
    win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
    let rafQueue = [];
    win.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
    win.cancelAnimationFrame = () => {};
    const pumpFrame = () => { const q = rafQueue; rafQueue = []; for (const cb of q) cb(Date.now()); };

    win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
      enableLegacyEmojiFix: emojiOn, enableAdBlock: true, enableSponsorBlock: false,
      enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
    }));
    applyChrome38Downgrade(win);
    win.eval(fs.readFileSync(bundlePath, 'utf8'));

    setTimeout(async () => {
      let records = 0;
      const spy = new win.MutationObserver((m) => { records += m.length; });
      spy.observe(win.document.body, { childList: true, subtree: true, characterData: true });

      const app = win.document.querySelector('ytlr-app');
      // A shelf of tiles, like a real home screen.
      const titles = [];
      for (let i = 0; i < 12; i++) {
        const d = win.document.createElement('div');
        const s = win.document.createElement('span');
        s.textContent = withEmojiText
          ? `Track ${i} \u200B\uD83C\uDFB5\u200C live \u200B\uD83D\uDE00\u200C`
          : `Track ${i} plain title text`;
        d.appendChild(s);
        app.appendChild(d);
        titles.push(s);
      }
      const tick = () => new Promise((r) => setTimeout(r, 0));
      pumpFrame(); await tick(); pumpFrame(); await tick();

      const baseRecords = records;
      const baseNodes = win.document.getElementsByTagName('*').length;

      // YouTube's incremental-dom updates a text node's data in place.
      for (let t = 0; t < TICKS; t++) {
        const s = titles[t % titles.length];
        const tn = s.firstChild;
        if (tn && tn.nodeType === 3) tn.data = tn.data;      // idom-style rewrite
        pumpFrame();
        await tick();
      }
      const endNodes = win.document.getElementsByTagName('*').length;
      resolve({ records: records - baseRecords, nodeGrowth: endNodes - baseNodes,
                injected: win.document.querySelectorAll('.twemoji-injected').length });
    }, 400);
  });
}

(async () => {
  const off  = await run(false, true);
  const onNo = await run(true, false);
  const onYes = await run(true, true);
  console.log(`${TICKS} YouTube-style in-place text updates on a 12-tile shelf:\n`);
  console.log(`  emoji fix OFF, emoji in text : ${String(off.records).padStart(5)} records   node growth ${off.nodeGrowth}`);
  console.log(`  emoji fix ON,  plain text    : ${String(onNo.records).padStart(5)} records   node growth ${onNo.nodeGrowth}`);
  console.log(`  emoji fix ON,  emoji in text : ${String(onYes.records).padStart(5)} records   node growth ${onYes.nodeGrowth}   injected spans ${onYes.injected}`);
  const amp = off.records ? (onYes.records / off.records) : Infinity;
  console.log(`\n  amplification with emoji present: ${amp.toFixed(2)}x baseline churn`);
  console.log(amp > 1.5
    ? '  -> our own writes ARE feeding the observer'
    : '  -> the observer is largely a passive witness to YouTube churn');
})();
