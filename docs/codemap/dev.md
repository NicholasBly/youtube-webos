# Code map: dev/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [dev/perf-mon.js](#mod-perf-mon-js)

<a id="mod-perf-mon-js"></a>

## dev/perf-mon.js

> perf-mon.js — YTAF Engine Diagnostics ===================================================================== Dev-only instrumentation for the webOS YouTube mod.
>
> WHAT IT DOES 1. Hooks every runtime boundary this mod actually crosses (JSON.parse, JSON.stringify, fetch, XHR, MutationObserver, IntersectionObserver, timers, rAF, DOM queries, layout reads, event listeners) and charges the cost back to the module + function responsible. 2. Carries a registry of every function in the codebase and its role, so the cluster reports "this is firing / this is silent / this should not be running here" instead of anonymous numbers. 3. Runs a feature-expectation sweep on every page transition: for each enabled option it knows what should happen on this page, and verifies it against live DOM and runtime evidence. 4. Renders an automotive instrument cluster sized for a TV across a room. 5. Emits machine-readable bottleneck reports for an AI agent to review.
>
> LOAD ORDER MATTERS. Import this first in userScript.js (after the polyfills). It installs "inner" probes immediately, so it sits underneath adblock's JSON.parse hook and can time the native parse; then it arms "outer" probes in a deferred task once the bundle has finished evaluating, so it also sits above every mod hook and can time the total. Mod overhead = outer - inner.
>
> REMOTE   Press 0 three times within 1.5s to toggle the cluster. LEFT/RIGHT tab. UP/DOWN scroll. OK emits a report. BACK closes. (YELLOW is NOT used: YouTube's own leanback UI claims it, and screensaver-fix.js synthesises a YELLOW press every 30s on Shorts.) CONSOLE  __PERF.help(), __PERF.toggle()

4741 lines · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [Meter](#fn-perf-mon-js-meter), [Counter](#fn-perf-mon-js-counter), [fmtMs](#fn-perf-mon-js-fmtms), [chan](#fn-perf-mon-js-chan), [chanRate](#fn-perf-mon-js-chanrate), [countUpgradedThumbs](#fn-perf-mon-js-countupgradedthumbs), [observersFrom](#fn-perf-mon-js-observersfrom), [qa](#fn-perf-mon-js-qa), [byId](#fn-perf-mon-js-byid), [ensureVideoTickProbe](#fn-perf-mon-js-ensurevideotickprobe), [fnStats](#fn-perf-mon-js-fnstats), [hasClass](#fn-perf-mon-js-hasclass), [parseTypeSeen](#fn-perf-mon-js-parsetypeseen), [anyFnRan](#fn-perf-mon-js-anyfnran), [q](#fn-perf-mon-js-q), [cfgGet](#fn-perf-mon-js-cfgget), [playerVideo](#fn-perf-mon-js-playervideo), [topFunctions](#fn-perf-mon-js-topfunctions), [installInnerJsonProbe](#fn-perf-mon-js-installinnerjsonprobe), [installObserverProbes](#fn-perf-mon-js-installobserverprobes), [installTimerProbes](#fn-perf-mon-js-installtimerprobes), [installDomProbes](#fn-perf-mon-js-installdomprobes), [installEventProbes](#fn-perf-mon-js-installeventprobes), [installNetworkProbes](#fn-perf-mon-js-installnetworkprobes), [armOuter](#fn-perf-mon-js-armouter)
- **Settings:** uses `enableAdBlock`, `enableTrackingBlock`, `upgradeThumbnails`, `enableSponsorBlock`, `enableReturnYouTubeDislike`, `forceHighResVideo`, `enableLegacyEmojiFix`, `removeGlobalShorts`, `removeTopLiveGames`, `removeMostRelevant`, `hideGuestSignInPrompts`, `hideEndcards`, `enableAutoLogin`, `showWatch`, `enableOledCareMode`, `logoStyle`, `fixMultilineTitles`, `removeBlackBorders`, `disableNotifications`, `forcePreviews`
- **Hooks:** `window.__PERF`

- <a id="fn-perf-mon-js-safe"></a>`safe(fn, label)` · L140–152 · Instrumentation must never take the app down.
- <a id="fn-perf-mon-js-meter"></a>`Meter(name)` · L159–169 · Windowed meter: cumulative totals plus a ring of recent samples, so we can answer "how many ms of blocking work in the last second" — the only figure that correlates with dropped frames.
- <a id="fn-perf-mon-js-meter-prototype-add"></a>`Meter.prototype.add(v)` · L170–179
- <a id="fn-perf-mon-js-meter-prototype-window"></a>`Meter.prototype.window(w)` · L180–191
- <a id="fn-perf-mon-js-meter-prototype-avg"></a>`Meter.prototype.avg()` · L192–194
- <a id="fn-perf-mon-js-counter"></a>`Counter()` · L197–202 · Rate counter for events with no duration.
- <a id="fn-perf-mon-js-counter-prototype-hit"></a>`Counter.prototype.hit(n)` · L203–208
- <a id="fn-perf-mon-js-counter-prototype-rate"></a>`Counter.prototype.rate(w)` · L209–215
- <a id="fn-perf-mon-js-fmtms"></a>`fmtMs(v)` · L217–223
- <a id="fn-perf-mon-js-clamp"></a>`clamp(v, lo, hi)` · L224–228
- <a id="fn-perf-mon-js-trunc"></a>`trunc(s, n)` · L229–232
- <a id="fn-perf-mon-js-modulefromsource"></a>`moduleFromSource(fn)` · L308–320
- <a id="fn-perf-mon-js-capturestack"></a>`captureStack()` · L561–571
- <a id="fn-perf-mon-js-modulefromstack"></a>`moduleFromStack(stack)` · L573–584
- <a id="fn-perf-mon-js-isourcode"></a>`isOurCode(stack)` · L586–591
- <a id="fn-perf-mon-js-originof"></a>`originOf(fn, hint)` · L596–639 · Resolve and memoise {module, fn, role, cost, ours} for a callback.
- <a id="fn-perf-mon-js-unknownorigin"></a>`unknownOrigin(hint)` · L641–652
- <a id="fn-perf-mon-js-ledgerfor"></a>`ledgerFor(origin)` · L665–676
- <a id="fn-perf-mon-js-modulemeter"></a>`moduleMeter(mod)` · L678–682
- <a id="fn-perf-mon-js-currentcontext"></a>`currentContext()` · L684–686
- <a id="fn-perf-mon-js-charge"></a>`charge(origin, fn, thisArg, args)` · L689–704 · Run fn under an attribution context and charge its inclusive wall time.
- <a id="fn-perf-mon-js-topfunctions"></a>`topFunctions(limit, windowMs)` · L706–730
- <a id="fn-perf-mon-js-channel"></a>`channel(name)` · L797–810
- <a id="fn-perf-mon-js-detectpage"></a>`detectPage()` · L819–830
- <a id="fn-perf-mon-js-onpagechange"></a>`onPageChange(fn)` · L833–835
- <a id="fn-perf-mon-js-checkpage"></a>`checkPage()` · L837–854
- <a id="fn-perf-mon-js-keepsample"></a>`keepSample(text)` · L873–880
- <a id="fn-perf-mon-js-synthorigin"></a>`synthOrigin(fnName, fallbackModule)` · L892–903
- <a id="fn-perf-mon-js-chargehook"></a>`chargeHook(origin, msSpent)` · L905–911
- <a id="fn-perf-mon-js-classifyresponse"></a>`classifyResponse(text)` · L913–925
- <a id="fn-perf-mon-js-typebucket"></a>`typeBucket(t)` · L927–939
- <a id="fn-perf-mon-js-installinnerjsonprobe"></a>`installInnerJsonProbe()` · L941–966
- <a id="fn-perf-mon-js-installinnerjsonprobe-innerparse"></a>`installInnerJsonProbe.innerParse(text, reviver)` · L944–953
- <a id="fn-perf-mon-js-installinnerjsonprobe-json-stringify"></a>`installInnerJsonProbe.JSON.stringify(value, replacer, space)` · L958–965
- <a id="fn-perf-mon-js-installouterjsonprobe"></a>`installOuterJsonProbe()` · L968–1051
- <a id="fn-perf-mon-js-installouterjsonprobe-outerparse"></a>`installOuterJsonProbe.outerParse(text, reviver)` · L986–1023
- <a id="fn-perf-mon-js-installouterjsonprobe-json-stringify"></a>`installOuterJsonProbe.JSON.stringify(value, replacer, space)` · L1028–1048
- <a id="fn-perf-mon-js-classifyurl"></a>`classifyUrl(url)` · L1068–1074
- <a id="fn-perf-mon-js-recordrequest"></a>`recordRequest(kind, method, url, ms, ok)` · L1076–1101
- <a id="fn-perf-mon-js-installnetworkprobes"></a>`installNetworkProbes()` · L1103–1223
- <a id="fn-perf-mon-js-installnetworkprobes-navigator-sendbeacon"></a>`installNetworkProbes.navigator.sendBeacon(url, _data)` · L1110–1124
- <a id="fn-perf-mon-js-installnetworkprobes-window-fetch"></a>`installNetworkProbes.window.fetch(resource, init)` · L1132–1169
- <a id="fn-perf-mon-js-installnetworkprobes-window-fetch-done"></a>`installNetworkProbes.window.fetch.done(ok)` · L1138–1143
- <a id="fn-perf-mon-js-installnetworkprobes-xhr-prototype-open"></a>`installNetworkProbes.XHR.prototype.open(method, url)` · L1178–1186
- <a id="fn-perf-mon-js-installnetworkprobes-xhr-prototype-send"></a>`installNetworkProbes.XHR.prototype.send()` · L1188–1221
- <a id="fn-perf-mon-js-installnetworkprobes-xhr-prototype-send-finish"></a>`installNetworkProbes.XHR.prototype.send.finish()` · L1193–1201
- <a id="fn-perf-mon-js-installnetworkprobes-xhr-prototype-send-this-onreadystatechange"></a>`installNetworkProbes.XHR.prototype.send.this.onreadystatechange()` · L1206–1209
- <a id="fn-perf-mon-js-describetarget"></a>`describeTarget(target)` · L1235–1247
- <a id="fn-perf-mon-js-describeoptions"></a>`describeOptions(o)` · L1249–1259
- <a id="fn-perf-mon-js-registerobserver"></a>`registerObserver(rec)` · L1261–1265
- <a id="fn-perf-mon-js-installobserverprobes"></a>`installObserverProbes()` · L1267–1376
- <a id="fn-perf-mon-js-installobserverprobes-patchedmo"></a>`installObserverProbes.PatchedMO(callback)` · L1273–1331
- <a id="fn-perf-mon-js-installobserverprobes-patchedmo-wrapped"></a>`installObserverProbes.PatchedMO.wrapped(records, observer)` · L1287–1307
- <a id="fn-perf-mon-js-installobserverprobes-patchedmo-inst-observe"></a>`installObserverProbes.PatchedMO.inst.observe(target, options)` · L1315–1324
- <a id="fn-perf-mon-js-installobserverprobes-patchedmo-inst-disconnect"></a>`installObserverProbes.PatchedMO.inst.disconnect()` · L1325–1328
- <a id="fn-perf-mon-js-installobserverprobes-patchedio"></a>`installObserverProbes.PatchedIO(callback, options)` · L1339–1372
- <a id="fn-perf-mon-js-installobserverprobes-patchedio-wrapped"></a>`installObserverProbes.PatchedIO.wrapped(entries, observer)` · L1352–1358
- <a id="fn-perf-mon-js-installobserverprobes-patchedio-inst-observe"></a>`installObserverProbes.PatchedIO.inst.observe(target)` · L1361–1369
- <a id="fn-perf-mon-js-installtimerprobes"></a>`installTimerProbes()` · L1382–1484
- <a id="fn-perf-mon-js-installtimerprobes-window-settimeout"></a>`installTimerProbes.window.setTimeout(fn, delay)` · L1389–1407
- <a id="fn-perf-mon-js-installtimerprobes-window-settimeout-wrapped"></a>`installTimerProbes.window.setTimeout.wrapped()` · L1398–1405
- <a id="fn-perf-mon-js-installtimerprobes-window-setinterval"></a>`installTimerProbes.window.setInterval(fn, delay)` · L1409–1440
- <a id="fn-perf-mon-js-installtimerprobes-window-setinterval-wrapped"></a>`installTimerProbes.window.setInterval.wrapped()` · L1425–1435
- <a id="fn-perf-mon-js-installtimerprobes-window-clearinterval"></a>`installTimerProbes.window.clearInterval(id)` · L1442–1445
- <a id="fn-perf-mon-js-installtimerprobes-window-requestanimationframe"></a>`installTimerProbes.window.requestAnimationFrame(fn)` · L1449–1482
- <a id="fn-perf-mon-js-installtimerprobes-window-requestanimationframe-wrapped"></a>`installTimerProbes.window.requestAnimationFrame.wrapped(ts)` · L1456–1480
- <a id="fn-perf-mon-js-installdomprobes"></a>`installDomProbes()` · L1493–1542
- <a id="fn-perf-mon-js-installdomprobes-wrapquery"></a>`installDomProbes.wrapQuery(proto, name, counter, meter)` · L1495–1508
- <a id="fn-perf-mon-js-installdomprobes-wrapquery-proto-name"></a>`installDomProbes.wrapQuery.proto[name](_sel)` · L1498–1507
- <a id="fn-perf-mon-js-installdomprobes-element-prototype-getboundingclientrect"></a>`installDomProbes.Element.prototype.getBoundingClientRect()` · L1529–1532
- <a id="fn-perf-mon-js-installdomprobes-window-getcomputedstyle"></a>`installDomProbes.window.getComputedStyle()` · L1536–1539
- <a id="fn-perf-mon-js-listenerkey"></a>`listenerKey(type, options)` · L1554–1557
- <a id="fn-perf-mon-js-installeventprobes"></a>`installEventProbes()` · L1559–1605
- <a id="fn-perf-mon-js-installeventprobes-et-prototype-addeventlistener"></a>`installEventProbes.ET.prototype.addEventListener(type, listener, options)` · L1567–1593
- <a id="fn-perf-mon-js-installeventprobes-et-prototype-removeeventlistener"></a>`installEventProbes.ET.prototype.removeEventListener(type, listener, options)` · L1595–1604
- <a id="fn-perf-mon-js-wrapprototype"></a>`wrapPrototype(obj, moduleName)` · L1631–1682
- <a id="fn-perf-mon-js-wrapprototype-wrapper"></a>`wrapPrototype.wrapper()` · L1662–1664
- <a id="fn-perf-mon-js-pollforprototypes"></a>`pollForPrototypes()` · L1684–1697
- <a id="fn-perf-mon-js-pollforprototypes-tick"></a>`pollForPrototypes.tick()` · L1686–1694
- <a id="fn-perf-mon-js-q"></a>`q(sel)` · L1709–1715
- <a id="fn-perf-mon-js-qa"></a>`qa(sel)` · L1716–1722
- <a id="fn-perf-mon-js-byid"></a>`byId(id)` · L1723–1729
- <a id="fn-perf-mon-js-hasclass"></a>`hasClass(cls)` · L1730–1732
- <a id="fn-perf-mon-js-cfg"></a>`cfg()` · L1779–1796
- <a id="fn-perf-mon-js-cfgget"></a>`cfgGet(key)` · L1798–1801
- <a id="fn-perf-mon-js-chan"></a>`chan(name)` · L1821–1823
- <a id="fn-perf-mon-js-chanrate"></a>`chanRate(name, w)` · L1824–1827
- <a id="fn-perf-mon-js-fnstats"></a>`fnStats(module, fn)` · L1828–1838
- <a id="fn-perf-mon-js-anyfnran"></a>`anyFnRan(module, fns)` · L1839–1845
- <a id="fn-perf-mon-js-isupgradedtile"></a>`isUpgradedTile(el)` · L1860–1866
- <a id="fn-perf-mon-js-countupgradedthumbs"></a>`countUpgradedThumbs()` · L1868–1886
- <a id="fn-perf-mon-js-playervideo"></a>`playerVideo()` · L1889–1891 · The one &lt;video> the mod cares about.
- <a id="fn-perf-mon-js-ensurevideotickprobe"></a>`ensureVideoTickProbe()` · L1900–1913
- <a id="fn-perf-mon-js-countdom"></a>`countDom()` · L1922–1950 · getElementsByTagName('\*') stops at a shadow boundary, and YouTube's ytlr-\* elements are custom elements that may hold their subtree in a shadow root.
- <a id="fn-perf-mon-js-observersfrom"></a>`observersFrom(moduleName)` · L1952–1959
- <a id="fn-perf-mon-js-parsetypeseen"></a>`parseTypeSeen(type, withinMs)` · L1960–1965
- <a id="fn-perf-mon-js-allfeatures"></a>`allFeatures()` · L2702–2704
- <a id="fn-perf-mon-js-featureenabled"></a>`featureEnabled(f)` · L2706–2711
- <a id="fn-perf-mon-js-evaluatefeature"></a>`evaluateFeature(f, page)` · L2717–2766 · Evaluate one feature against the current page.
- <a id="fn-perf-mon-js-evaluateall"></a>`evaluateAll(page)` · L2768–2774
- <a id="fn-perf-mon-js-evaluateallcached"></a>`evaluateAllCached(ttl)` · L2783–2790
- <a id="fn-perf-mon-js-dedupe"></a>`dedupe(list)` · L2799–2808
- <a id="fn-perf-mon-js-runsweep"></a>`runSweep(page, reason)` · L2810–2858
- <a id="fn-perf-mon-js-logsweep"></a>`logSweep(sweep)` · L2870–2934
- <a id="fn-perf-mon-js-findbottlenecks"></a>`findBottlenecks()` · L3230–3241
- <a id="fn-perf-mon-js-buildreport"></a>`buildReport()` · L3247–3426
- <a id="fn-perf-mon-js-coverage"></a>`coverage()` · L3428–3450
- <a id="fn-perf-mon-js-emitreport"></a>`emitReport(reason)` · L3455–3505
- <a id="fn-perf-mon-js-maybeemitreport"></a>`maybeEmitReport(reason)` · L3507–3522
- <a id="fn-perf-mon-js-installvitals"></a>`installVitals()` · L3528–3608
- <a id="fn-perf-mon-js-installvitals-loop"></a>`installVitals.loop()` · L3533–3545
- <a id="fn-perf-mon-js-el"></a>`el(tag, styles, text)` · L3643–3653 · All elements are created here so they can all carry the `twemoji-injected` marker: emoji-font.js treats that class as "already processed" and skips the subtree, which keeps the monitor out of the observer it is measur...
- <a id="fn-perf-mon-js-svg"></a>`svg(tag, attrs)` · L3655–3663
- <a id="fn-perf-mon-js-polar"></a>`polar(cx, cy, r, deg)` · L3668–3671
- <a id="fn-perf-mon-js-arcpath"></a>`arcPath(cx, cy, r, a0, a1)` · L3673–3693
- <a id="fn-perf-mon-js-makegauge"></a>`makeGauge(o)` · L3699–3833 · @param {object} o {size, label, unit, max, redFrom, invert} invert: low values are the problem (used for FPS)
- <a id="fn-perf-mon-js-makegauge-set"></a>`makeGauge.set(v, displayText)` · L3823–3831
- <a id="fn-perf-mon-js-makelamp"></a>`makeLamp(label)` · L3835–3850
- <a id="fn-perf-mon-js-buildui"></a>`buildUI()` · L3862–4009
- <a id="fn-perf-mon-js-setrow"></a>`setRow(container, cells)` · L4011–4031
- <a id="fn-perf-mon-js-renderengine"></a>`renderEngine(c)` · L4033–4095
- <a id="fn-perf-mon-js-renderfeatures"></a>`renderFeatures(c)` · L4097–4135
- <a id="fn-perf-mon-js-renderfunctions"></a>`renderFunctions(c)` · L4137–4167
- <a id="fn-perf-mon-js-rendersystems"></a>`renderSystems(c)` · L4169–4257
- <a id="fn-perf-mon-js-updateui"></a>`updateUI()` · L4259–4331
- <a id="fn-perf-mon-js-show"></a>`show()` · L4335–4346
- <a id="fn-perf-mon-js-hide"></a>`hide()` · L4348–4355
- <a id="fn-perf-mon-js-toggle"></a>`toggle()` · L4357–4360
- <a id="fn-perf-mon-js-issynthetickey"></a>`isSyntheticKey(evt)` · L4412–4415
- <a id="fn-perf-mon-js-istogglepress"></a>`isTogglePress(evt, code)` · L4417–4434
- <a id="fn-perf-mon-js-consume"></a>`consume(evt)` · L4444–4448 · ui.js binds its shortcut router with document.addEventListener('keydown', handler, true) - the same node and the same phase as us.
- <a id="fn-perf-mon-js-installremote"></a>`installRemote()` · L4450–4497
- <a id="fn-perf-mon-js-boot"></a>`boot()` · L4514–4573
- <a id="fn-perf-mon-js-armouter"></a>`armOuter()` · L4577–4582 · Outer probes go on last, once every other module in the bundle has installed its own hooks — that is what makes the parse sandwich work.
- <a id="fn-perf-mon-js-window-perf-report"></a>`window.__PERF.report(reason)` · L4603–4605 · Full machine-readable snapshot, also printed to the console.
- <a id="fn-perf-mon-js-window-perf-sweep"></a>`window.__PERF.sweep()` · L4609–4611 · Re-run the feature expectation sweep right now.
- <a id="fn-perf-mon-js-window-perf-features"></a>`window.__PERF.features()` · L4613–4625 · What every feature should be doing on this page, and whether it is.
- <a id="fn-perf-mon-js-window-perf-functions"></a>`window.__PERF.functions(windowMs)` · L4627–4632 · Hottest instrumented functions in the last N ms.
- <a id="fn-perf-mon-js-window-perf-registry"></a>`window.__PERF.registry()` · L4634–4636 · Everything the monitor knows about the codebase.
- <a id="fn-perf-mon-js-window-perf-calibrate"></a>`window.__PERF.calibrate(samples, iterations)` · L4655–4695 · Definitive measurement of what the mod's JSON filtering actually costs.
- <a id="fn-perf-mon-js-window-perf-wrapprotos"></a>`window.__PERF.__wrapProtos()` · L4698–4703 · Force a prototype-instrumentation pass (normally polled every 2s).
- <a id="fn-perf-mon-js-window-perf-help"></a>`window.__PERF.help()` · L4707–4739
