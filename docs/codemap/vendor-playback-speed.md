# Code map: vendor/playback-speed/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [vendor/playback-speed/audio-engine.js](#mod-audio-engine-js), [vendor/playback-speed/containers.js](#mod-containers-js), [vendor/playback-speed/mse-hook.js](#mod-mse-hook-js), [vendor/playback-speed/wsola.js](#mod-wsola-js)

<a id="mod-audio-engine-js"></a>

## vendor/playback-speed/audio-engine.js

593 lines · imports [vendor/playback-speed/wsola.js](#mod-wsola-js) · imported by [features/playback-speed/controller.js](features-playback-speed.md#mod-controller-js)

- <a id="fn-audio-engine-js-audioengine-constructor"></a>`AudioEngine.constructor({ win, speed, leadS = 0.4, chunkS = 0.1, extraDelayMs = 0, onError, createStretcher })` · L6–102
- <a id="fn-audio-engine-js-audioengine-onpause"></a>`AudioEngine.onPause()` · L71–78
- <a id="fn-audio-engine-js-audioengine-onwaiting"></a>`AudioEngine.onWaiting()` · L79–84
- <a id="fn-audio-engine-js-audioengine-onseeking"></a>`AudioEngine.onSeeking()` · L85–96
- <a id="fn-audio-engine-js-audioengine-onplaying"></a>`AudioEngine.onPlaying()` · L97–101
- <a id="fn-audio-engine-js-audioengine-attachvideo"></a>`AudioEngine.attachVideo(el)` · L104–112
- <a id="fn-audio-engine-js-audioengine-setvolume"></a>`AudioEngine.setVolume(v, muted)` · L114–118
- <a id="fn-audio-engine-js-audioengine-configure"></a>`AudioEngine.configure(cfg)` · L120–150
- <a id="fn-audio-engine-js-audioengine-issamecfg"></a>`AudioEngine.isSameCfg(c1, c2)` · L152–172
- <a id="fn-audio-engine-js-audioengine-push"></a>`AudioEngine.push(chunks)` · L174–194
- <a id="fn-audio-engine-js-audioengine-lowerbound"></a>`AudioEngine.lowerBound(ptsUs)` · L196–205
- <a id="fn-audio-engine-js-audioengine-discard"></a>`AudioEngine.discard(a, b)` · L207–252
- <a id="fn-audio-engine-js-audioengine-reset"></a>`AudioEngine.reset()` · L254–266
- <a id="fn-audio-engine-js-audioengine-destroy"></a>`AudioEngine.destroy()` · L268–285
- <a id="fn-audio-engine-js-audioengine-reporterror"></a>`AudioEngine.reportError(e)` · L287–293
- <a id="fn-audio-engine-js-audioengine-onaudiodata"></a>`AudioEngine.onAudioData(data)` · L295–313
- <a id="fn-audio-engine-js-audioengine-pumpdecoder"></a>`AudioEngine.pumpDecoder()` · L315–339
- <a id="fn-audio-engine-js-audioengine-stopfuture"></a>`AudioEngine.stopFuture()` · L341–351
- <a id="fn-audio-engine-js-audioengine-tick"></a>`AudioEngine.tick()` · L353–518
- <a id="fn-audio-engine-js-audioengine-tick-node-onended"></a>`AudioEngine.tick.node.onended()` · L511–511
- <a id="fn-audio-engine-js-audioengine-prunepcm"></a>`AudioEngine.prunePcm(beforeT)` · L520–533
- <a id="fn-audio-engine-js-audioengine-softcorrect"></a>`AudioEngine.softCorrect(drift)` · L535–552
- <a id="fn-audio-engine-js-audioengine-extractpcm"></a>`AudioEngine.extractPcm(startT, duration)` · L554–592

<a id="mod-containers-js"></a>

## vendor/playback-speed/containers.js

> Far above what a media fragment holds (a few hundred samples).

844 lines · imported by [vendor/playback-speed/mse-hook.js](#mod-mse-hook-js)

- <a id="fn-containers-js-parseboxes"></a>`parseBoxes(u8, start, end)` · L4–60
- <a id="fn-containers-js-classifymp4"></a>`classifyMp4(u8)` · L62–69
- <a id="fn-containers-js-dfs"></a>`dfs(u8, start, end, target)` · L71–87
- <a id="fn-containers-js-findmdhdtimescale"></a>`findMdhdTimescale(u8)` · L89–102
- <a id="fn-containers-js-rewriteinittimescale"></a>`rewriteInitTimescale(u8, speed)` · L104–118
- <a id="fn-containers-js-readdescr"></a>`readDescr(view, start, end)` · L120–132
- <a id="fn-containers-js-opusheadfromdops"></a>`opusHeadFromDOps(d)` · L134–148
- <a id="fn-containers-js-parseinitinfo"></a>`parseInitInfo(u8)` · L150–165
- <a id="fn-containers-js-audioconfigfrominit"></a>`audioConfigFromInit(u8)` · L167–240
- <a id="fn-containers-js-demuxfragments"></a>`demuxFragments(u8, { timescale, trex })` · L242–432
- <a id="fn-containers-js-readvint"></a>`readVint(u8, start)` · L434–465
- <a id="fn-containers-js-parseelements"></a>`parseElements(u8, start, end)` · L467–516
- <a id="fn-containers-js-levelone"></a>`levelOne(u8)` · L521–526
- <a id="fn-containers-js-classifywebm"></a>`classifyWebm(u8)` · L528–537
- <a id="fn-containers-js-findtimecodescale"></a>`findTimecodeScale(u8)` · L539–560
- <a id="fn-containers-js-encodevint"></a>`encodeVint(val)` · L562–582
- <a id="fn-containers-js-rewritetimecodescale"></a>`rewriteTimecodeScale(u8, speed)` · L584–672
- <a id="fn-containers-js-audioconfigfromwebminit"></a>`audioConfigFromWebmInit(u8)` · L674–733
- <a id="fn-containers-js-demuxclusters"></a>`demuxClusters(u8, { timecodeScale, trackNumber })` · L735–844

<a id="mod-mse-hook-js"></a>

## vendor/playback-speed/mse-hook.js

776 lines · imports [vendor/playback-speed/containers.js](#mod-containers-js) · imported by [features/playback-speed/controller.js](features-playback-speed.md#mod-controller-js), [features/playback-speed/index.js](features-playback-speed.md#mod-index-js), [features/playback-speed/native-menu.js](features-playback-speed.md#mod-native-menu-js)

- <a id="fn-mse-hook-js-issupportedspeed"></a>`isSupportedSpeed(speed)` · L18–20
- <a id="fn-mse-hook-js-speedtimemap-constructor"></a>`SpeedTimeMap.constructor(speed)` · L23–26
- <a id="fn-mse-hook-js-speedtimemap-get-speed"></a>`SpeedTimeMap.get speed()` · L28–30
- <a id="fn-mse-hook-js-speedtimemap-set-speed"></a>`SpeedTimeMap.set speed(value)` · L32–37
- <a id="fn-mse-hook-js-speedtimemap-toelement"></a>`SpeedTimeMap.toElement(t)` · L39–41
- <a id="fn-mse-hook-js-speedtimemap-tocontent"></a>`SpeedTimeMap.toContent(t)` · L43–45
- <a id="fn-mse-hook-js-speedtimemap-mapranges"></a>`SpeedTimeMap.mapRanges(ranges, direction)` · L47–65
- <a id="fn-mse-hook-js-speedtimemap-mapranges-start"></a>`SpeedTimeMap.mapRanges.start(i)` · L54–58
- <a id="fn-mse-hook-js-speedtimemap-mapranges-end"></a>`SpeedTimeMap.mapRanges.end(i)` · L59–63
- <a id="fn-mse-hook-js-attachelementshim"></a>`attachElementShim(el, timeMap, { onRateRequest })` · L68–160
- <a id="fn-mse-hook-js-attachelementshim-defineprop"></a>`attachElementShim.defineProp(prop, get, set)` · L73–99
- <a id="fn-mse-hook-js-attachelementshim-defineprop-newdesc-set"></a>`attachElementShim.defineProp.newDesc.set(val)` · L93–95
- <a id="fn-mse-hook-js-attachelementshim-mapranges"></a>`attachElementShim.mapRanges(ranges)` · L101–105
- <a id="fn-mse-hook-js-attachelementshim-mapranges-start"></a>`attachElementShim.mapRanges.start(i)` · L103–103
- <a id="fn-mse-hook-js-attachelementshim-mapranges-end"></a>`attachElementShim.mapRanges.end(i)` · L104–104
- <a id="fn-mse-hook-js-attachelementshim-detach"></a>`attachElementShim.detach()` · L150–157
- <a id="fn-mse-hook-js-installmsehook"></a>`installMseHook(win, { getSpeed, createAudioSink, onRateRequest, onError, onNativeAudio })` · L162–776
- <a id="fn-mse-hook-js-installmsehook-attach"></a>`installMseHook.attach(el, session)` · L185–191 · Attaching twice would stack two shims (x S^2): reuse a live one for the same session, replace one that belongs to another session.
- <a id="fn-mse-hook-js-installmsehook-win-url-createobjecturl"></a>`installMseHook.win.URL.createObjectURL(obj)` · L193–199
- <a id="fn-mse-hook-js-installmsehook-win-url-revokeobjecturl"></a>`installMseHook.win.URL.revokeObjectURL(url)` · L202–205 · Don't keep every MediaSource (and its audio engine) alive for the session.
- <a id="fn-mse-hook-js-installmsehook-win-mediasource-prototype-addsourcebuffer"></a>`installMseHook.win.MediaSource.prototype.addSourceBuffer(mime)` · L224–270
- <a id="fn-mse-hook-js-installmsehook-patchmediasource"></a>`installMseHook.patchMediaSource(ms, session)` · L272–325
- <a id="fn-mse-hook-js-installmsehook-patchmediasource-list-item"></a>`installMseHook.patchMediaSource.list.item(idx)` · L308–313
- <a id="fn-mse-hook-js-installmsehook-lookslikeinitstart"></a>`installMseHook.looksLikeInitStart(u8)` · L327–341
- <a id="fn-mse-hook-js-installmsehook-patchvideosourcebuffer"></a>`installMseHook.patchVideoSourceBuffer(sb, mime, speed, onError)` · L343–439
- <a id="fn-mse-hook-js-installmsehook-patchvideosourcebuffer-sb-appendbuffer"></a>`installMseHook.patchVideoSourceBuffer.sb.appendBuffer(data)` · L350–389
- <a id="fn-mse-hook-js-installmsehook-patchvideosourcebuffer-sb-remove"></a>`installMseHook.patchVideoSourceBuffer.sb.remove(start, end)` · L391–393
- <a id="fn-mse-hook-js-installmsehook-patchvideosourcebuffer-defineaccessor"></a>`installMseHook.patchVideoSourceBuffer.defineAccessor(prop, scale)` · L395–412
- <a id="fn-mse-hook-js-installmsehook-patchvideosourcebuffer-start"></a>`installMseHook.patchVideoSourceBuffer.start(i)` · L433–433
- <a id="fn-mse-hook-js-installmsehook-patchvideosourcebuffer-end"></a>`installMseHook.patchVideoSourceBuffer.end(i)` · L434–434
- <a id="fn-mse-hook-js-installmsehook-uninstall"></a>`installMseHook.uninstall()` · L441–448
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-constructor"></a>`installMseHook.FakeAudioSourceBuffer.constructor(win, mime, speed, sink, onError)` · L457–476
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-get-timestampoffset"></a>`installMseHook.FakeAudioSourceBuffer.get timestampOffset()` · L478–480
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-set-timestampoffset"></a>`installMseHook.FakeAudioSourceBuffer.set timestampOffset(val)` · L481–483
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-get-buffered"></a>`installMseHook.FakeAudioSourceBuffer.get buffered()` · L485–502
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-get-buffered-start"></a>`installMseHook.FakeAudioSourceBuffer.get buffered.start(i)` · L491–495
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-get-buffered-end"></a>`installMseHook.FakeAudioSourceBuffer.get buffered.end(i)` · L496–500
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-addrange"></a>`installMseHook.FakeAudioSourceBuffer._addRange(start, end)` · L504–521
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-appendbuffer"></a>`installMseHook.FakeAudioSourceBuffer.appendBuffer(data)` · L523–696
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-evictbehind"></a>`installMseHook.FakeAudioSourceBuffer._evictBehind()` · L698–708
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-finishlater"></a>`installMseHook.FakeAudioSourceBuffer._finishLater()` · L710–722
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-remove"></a>`installMseHook.FakeAudioSourceBuffer.remove(start, end)` · L724–750
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-abort"></a>`installMseHook.FakeAudioSourceBuffer.abort()` · L752–764
- <a id="fn-mse-hook-js-installmsehook-fakeaudiosourcebuffer-changetype"></a>`installMseHook.FakeAudioSourceBuffer.changeType(type)` · L766–773

<a id="mod-wsola-js"></a>

## vendor/playback-speed/wsola.js

252 lines · imported by [vendor/playback-speed/audio-engine.js](#mod-audio-engine-js)

- <a id="fn-wsola-js-wsolastretcher-constructor"></a>`WsolaStretcher.constructor({ sampleRate, channels, frameMs = 46, searchMs = 12, searchStep = 1, corrStep = 1 })` · L2–48
- <a id="fn-wsola-js-wsolastretcher-setspeed"></a>`WsolaStretcher.setSpeed(s)` · L50–52
- <a id="fn-wsola-js-wsolastretcher-ensureincapacity"></a>`WsolaStretcher._ensureInCapacity(required)` · L54–63
- <a id="fn-wsola-js-wsolastretcher-ensureoutcapacity"></a>`WsolaStretcher._ensureOutCapacity(required)` · L65–74
- <a id="fn-wsola-js-wsolastretcher-push"></a>`WsolaStretcher.push(channelArrays)` · L76–99
- <a id="fn-wsola-js-wsolastretcher-process"></a>`WsolaStretcher._process()` · L101–187
- <a id="fn-wsola-js-wsolastretcher-available"></a>`WsolaStretcher.available()` · L189–196
- <a id="fn-wsola-js-wsolastretcher-pull"></a>`WsolaStretcher.pull(n)` · L198–231
- <a id="fn-wsola-js-wsolastretcher-flush"></a>`WsolaStretcher.flush()` · L233–242
- <a id="fn-wsola-js-wsolastretcher-reset"></a>`WsolaStretcher.reset()` · L244–251
