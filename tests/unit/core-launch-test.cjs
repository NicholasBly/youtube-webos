/**
 * core/launch.js as a unit in a vm sandbox: extractLaunchParams and
 * handleLaunch for the contentTarget forms. The launcher page itself, under
 * the Chromium 38 downgrade, is smoke/launch-test.cjs.
 *
 * Run: node tests/unit/core-launch-test.cjs
 */
const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { CORE, loggerStub } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- core/launch.js ----------------------------------------------------------------
  {
    const loadLaunch = (launchParams, extra) => {
      const { createLogger, lines } = loggerStub();
      const win = Object.assign(
        { launchParams, location: { href: 'https://example.com/' } },
        extra
      );
      const { sandbox } = loadSources([CORE('launch.js')], {
        createLogger,
        URL,
        URLSearchParams,
        window: win
      });
      const launch = (params) => {
        sandbox.handleLaunch(params);
        return new URL(win.location.href);
      };
      return { sb: sandbox, win, lines, launch };
    };
    const ENV = ['env_forceFullAnimation', 'env_enableWebSpeech', 'env_enableVoice'];
    const hasEnv = (u) => ENV.every((k) => u.searchParams.get(k) === '1');

    let r = loadLaunch('{"contentTarget":"v=abc"}');
    const first = r.sb.extractLaunchParams();
    t('extractLaunchParams parses window.launchParams', first.contentTarget === 'v=abc');
    r.win.launchParams = '{"contentTarget":"v=other"}';
    t(
      'extractLaunchParams is cached: the same object comes back after launchParams changed',
      r.sb.extractLaunchParams() === first && first.contentTarget === 'v=abc'
    );
    r = loadLaunch('{oops');
    t(
      'corrupt launchParams give an empty object and a warning',
      JSON.stringify(r.sb.extractLaunchParams()) === '{}' &&
        r.lines.warn.some((l) => /Failed to parse launchParams/.test(l)),
      r.lines.warn.join(' | ')
    );
    r = loadLaunch(undefined);
    t(
      'no launchParams give an empty object without a warning',
      JSON.stringify(r.sb.extractLaunchParams()) === '{}' && r.lines.warn.length === 0
    );

    // hasLaunchTarget: what a relaunch must open, and what it must leave alone.
    {
      const has = loadLaunch().sb.hasLaunchTarget;
      t(
        'hasLaunchTarget: a deep link, a cast or a voice intent has a target',
        has({ contentTarget: 'v=abc' }) &&
          has({ target: 'q=cats' }) &&
          has({ contentTarget: { intent: 'SearchContent', intentParam: 'cats' } })
      );
      t(
        'hasLaunchTarget: a plain relaunch has none (no params, empty, other keys, empty strings)',
        !has(undefined) &&
          !has(null) &&
          !has({}) &&
          !has({ displayAffinity: 0 }) &&
          !has({ contentTarget: '', target: '' })
      );
    }

    let u = loadLaunch().launch({});
    t(
      'an empty launch goes to youtube.com/tv#/ with the three env flags',
      u.origin + u.pathname === 'https://www.youtube.com/tv' &&
        u.hash === '#/' &&
        hasEnv(u) &&
        [...u.searchParams].length === 3,
      u.href
    );
    u = loadLaunch().launch(undefined);
    t('handleLaunch(undefined) is the same empty launch', u.hash === '#/' && hasEnv(u));

    u = loadLaunch().launch({ contentTarget: 'v=dQw4w9WgXcQ' });
    t(
      'a v= target is appended to the env flags',
      u.searchParams.get('v') === 'dQw4w9WgXcQ' && hasEnv(u) && u.hash === '#/',
      u.href
    );
    u = loadLaunch().launch({ contentTarget: 'v=v=dQw4w9WgXcQ' });
    t(
      'a doubled v=v= prefix is trimmed to one',
      u.searchParams.get('v') === 'dQw4w9WgXcQ' && u.href.indexOf('v=v=') === -1,
      u.href
    );
    u = loadLaunch().launch({ target: 'v=fromTarget&t=5' });
    t(
      'target stands in when there is no contentTarget, with every pair kept',
      u.searchParams.get('v') === 'fromTarget' && u.searchParams.get('t') === '5',
      u.href
    );
    u = loadLaunch().launch({ contentTarget: 'v=fromContent', target: 'v=fromTarget' });
    t(
      'contentTarget wins over target',
      u.searchParams.get('v') === 'fromContent' && u.searchParams.getAll('v').length === 1,
      u.href
    );

    u = loadLaunch().launch({ contentTarget: 'https://www.youtube.com/tv?v=abc&t=5#/watch' });
    t(
      'a full same-origin URL replaces the launch URL as it is: its query and hash, no env flags',
      u.href === 'https://www.youtube.com/tv?v=abc&t=5#/watch' && !hasEnv(u),
      u.href
    );
    u = loadLaunch().launch({ contentTarget: 'https://evil.example/tv?v=abc' });
    t(
      'a URL on another origin is not followed: the launch stays on youtube.com',
      u.origin === 'https://www.youtube.com' && hasEnv(u),
      u.href
    );

    u = loadLaunch().launch({
      contentTarget: { intent: 'PlayContent', intentParam: 'lofi beats' }
    });
    t(
      'a voice PlayContent intent: inApp, vs=9, va=play, launch=voice and the query in vq',
      u.searchParams.get('inApp') === 'true' &&
        u.searchParams.get('vs') === '9' &&
        u.searchParams.get('va') === 'play' &&
        u.searchParams.getAll('launch').join() === 'voice' &&
        u.searchParams.get('vq') === 'lofi beats' &&
        hasEnv(u),
      u.href
    );
    u = loadLaunch().launch({ contentTarget: { intent: 'SearchContent', intentParam: 'cats' } });
    t(
      'a SearchContent intent adds a second launch=search',
      u.searchParams.get('va') === 'search' &&
        u.searchParams.getAll('launch').join() === 'voice,search' &&
        u.searchParams.get('vq') === 'cats',
      u.href
    );
    u = loadLaunch().launch({ contentTarget: { intent: 'Unrelated', intentParam: 'x' } });
    t(
      'an intent without the Content suffix gets no va but is still a voice launch',
      !u.searchParams.has('va') &&
        u.searchParams.get('launch') === 'voice' &&
        u.searchParams.get('vq') === 'x',
      u.href
    );
    u = loadLaunch().launch({ contentTarget: { intentParam: 'no intent' } });
    t(
      'an intent object without an intent string still sets vq',
      !u.searchParams.has('va') && u.searchParams.get('vq') === 'no intent',
      u.href
    );

    u = loadLaunch().launch({ contentTarget: { intent: 'PlayContent' } });
    t(
      'a voice intent without an intentParam writes no vq (not the string "undefined")',
      u.searchParams.get('launch') === 'voice' && !u.searchParams.has('vq'),
      u.href
    );

    u = loadLaunch().launch({ contentTarget: 'theme=k' });
    t(
      'theme=k strips the three env flags',
      u.searchParams.get('theme') === 'k' && ENV.every((k) => !u.searchParams.has(k)),
      u.href
    );
    u = loadLaunch().launch({ contentTarget: 'theme=dark&v=abc' });
    t('another theme value keeps them', hasEnv(u) && u.searchParams.get('v') === 'abc', u.href);
  }

  report.finish();
})();
