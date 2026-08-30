/**
 * Synthesises YouTube-TV-shaped JSON responses so the JSON.parse/stringify
 * hooks can be benchmarked on realistic trees rather than toy objects.
 */
function tile(i, withEmoji) {
  return {
    tileRenderer: {
      tileMetadata: {
        tileMetadataRenderer: {
          title: { runs: [{ text: (withEmoji ? '\u200B\uD83D\uDE00\u200C ' : '') + 'Video title number ' + i }] },
          lines: [{ lineRenderer: { items: [{ lineItemRenderer: { text: { simpleText: 'Channel ' + i } } }] } }]
        }
      },
      header: { tileHeaderRenderer: {
        thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/vid' + i + '/hqdefault.jpg', width: 480, height: 360 }] },
        trackingParams: 'CBQQ_____wEYACITCP' + i
      } },
      onSelectCommand: { watchEndpoint: { videoId: 'vid00000' + i }, clickTrackingParams: 'CBQQ' + i },
      style: 'TILE_STYLE_YTLR_DEFAULT',
      contentType: 'TILE_CONTENT_TYPE_VIDEO',
      trackingParams: 'CBQQ_____wEYASITCP' + i
    }
  };
}

function shelf(i, tilesPer, withEmoji) {
  const items = [];
  for (let t = 0; t < tilesPer; t++) items.push(tile(i * 1000 + t, withEmoji));
  return {
    shelfRenderer: {
      title: { runs: [{ text: i === 3 ? 'Shorts' : 'Shelf ' + i }] },
      tvhtml5ShelfRendererType: i === 3 ? 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS' : 'TVHTML5_SHELF_RENDERER_TYPE_DEFAULT',
      content: { horizontalListRenderer: { items, trackingParams: 'CBQQ' + i } },
      trackingParams: 'CBQQ_____wEYAiITCP' + i
    }
  };
}

function makeBrowse({ shelves = 12, tilesPer = 20, withEmoji = false } = {}) {
  const contents = [];
  for (let i = 0; i < shelves; i++) contents.push(shelf(i, tilesPer, withEmoji));
  contents.splice(2, 0, { adSlotRenderer: { adSlotMetadata: { slotId: 'x' }, trackingParams: 'ad' } });
  return {
    responseContext: {
      visitorData: 'Cgt4eHh4eHh4eHh4eA%3D%3D',
      serviceTrackingParams: [
        { service: 'GFEEDBACK', params: [{ key: 'logged_in', value: '0' }, { key: 'e', value: '234' }] },
        { service: 'CSI', params: [{ key: 'c', value: 'TVHTML5' }] }
      ],
      mainAppWebResponseContext: { loggedOut: true },
      webResponseContextExtensionData: { hasDecorated: true }
    },
    contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: {
      content: { sectionListRenderer: { contents, trackingParams: 'sec' } }
    } } } },
    trackingParams: 'CAAQ_____wEYACITCA'
  };
}

function makePlayer() {
  return {
    responseContext: { visitorData: 'x', serviceTrackingParams: [{ service: 'GFEEDBACK', params: [] }] },
    playabilityStatus: { status: 'OK', playableInEmbed: true },
    streamingData: {
      expiresInSeconds: '21540',
      formats: Array.from({ length: 6 }, (_, i) => ({
        itag: 18 + i, url: 'https://rr3---sn-x.googlevideo.com/videoplayback?expire=1&itag=' + i,
        mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', bitrate: 500000 + i, width: 640, height: 360,
        contentLength: '12345678', quality: 'medium', approxDurationMs: '213000'
      })),
      adaptiveFormats: Array.from({ length: 24 }, (_, i) => ({
        itag: 133 + i, url: 'https://rr3---sn-x.googlevideo.com/videoplayback?expire=1&itag=' + i,
        mimeType: 'video/mp4; codecs="avc1.4d401e"', bitrate: 300000 + i * 1000,
        initRange: { start: '0', end: '739' }, indexRange: { start: '740', end: '1791' },
        contentLength: '1234567', quality: 'hd720', approxDurationMs: '213000'
      }))
    },
    adPlacements: Array.from({ length: 3 }, (_, i) => ({ adPlacementRenderer: { config: { adPlacementConfig: { kind: 'AD_PLACEMENT_KIND_START' } }, renderer: { id: i } } })),
    playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
    videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'Some video \uD83D\uDE00', lengthSeconds: '213', author: 'Chan', shortDescription: 'x'.repeat(400) },
    endscreen: { endscreenRenderer: { elements: Array.from({ length: 6 }, (_, i) => ({ endscreenElementRenderer: { id: i, trackingParams: 'e' + i } })) } },
    playerOverlays: { playerOverlayRenderer: { timelyActionRenderers: [{ a: 1 }], trackingParams: 'po' } },
    trackingParams: 'CAAQ'
  };
}

function makeStringifyBody() {
  return {
    context: {
      client: { hl: 'en', gl: 'US', clientName: 'TVHTML5', clientVersion: '7.20240101', platform: 'TV',
                deviceMake: 'LG', deviceModel: 'webOS', userAgent: 'Mozilla/5.0', screenPixelDensity: 1,
                screenDensityFloat: 1, utcOffsetMinutes: 0, tvAppInfo: { livingRoomAppMode: 'LIVING_ROOM_APP_MODE_UNSPECIFIED' } },
      user: { lockedSafetyMode: false },
      request: { useSsl: true, internalExperimentFlags: Array.from({ length: 40 }, (_, i) => ({ key: 'flag' + i, value: 'true' })) },
      clickTracking: { clickTrackingParams: 'CAAQ' }
    },
    videoId: 'dQw4w9WgXcQ',
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', lactMilliseconds: '1000', signatureTimestamp: 19999 } },
    racyCheckOk: true, contentCheckOk: true
  };
}

module.exports = { makeBrowse, makePlayer, makeStringifyBody };
