/**
 * The thumbnail engine's inputs and outputs, shared by its three scripts: the
 * URLs of the rungs, a tile and a lockup carrying an hqdefault thumbnail, a
 * browse payload of tiles, what the engine emitted for a video, a rendered
 * tile in the page, and an Image stub whose loads the test shapes.
 *
 *   hq(id), sd(id)                   the hqdefault / sddefault URL of a video
 *   isHq(url), isSd(url), isMax(url) which rung a URL names
 *   thumbs(id)                       a thumbnail container with the hqdefault entry
 *   tile(id), tileUrl(item)          a tileRenderer carrying it, and its URL
 *   lockup(id)                       the same in the lockupViewModel shape
 *   browsePayload(win, ids)          the JSON text of a browse response with one shelf of tiles
 *   parseIds(win, ids)               the items of that payload parsed through the page's hook
 *   emitted(win, id)                 the URL the engine emits for one video on a fresh parse
 *   mount(win, id, url)              a rendered ytlr-thumbnail-details tile with that background
 *   imageStub(win, srcs, width)      every image loads at `width` (default 640; 120 is the grey
 *                                    placeholder of a missing rung; 'never' never settles,
 *                                    'error' fails as on a network error), the URLs asked for
 *                                    recorded in `srcs` and the loads finished counted in
 *                                    `srcs.settled`
 */
'use strict';

const { browseResponse, shelfOf, shelfItemsOf } = require('./gen-payload.cjs');

const hq = (id) => 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
const sd = (id) => 'https://i.ytimg.com/vi/' + id + '/sddefault.jpg';
const isHq = (u) => u.indexOf('/hqdefault.jpg') !== -1;
const isSd = (u) => u.indexOf('/sddefault.jpg') !== -1;
const isMax = (u) => u.indexOf('/maxresdefault.jpg') !== -1;
const thumbs = (id) => ({ thumbnails: [{ url: hq(id), width: 480, height: 360 }] });
const tile = (id) => ({
  tileRenderer: { header: { tileHeaderRenderer: { thumbnail: thumbs(id) } } }
});
const tileUrl = (item) => item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url;
const lockup = (id) => ({
  lockupViewModel: {
    contentImage: {
      thumbnailViewModel: { image: { sources: [{ url: hq(id), width: 480, height: 360 }] } }
    }
  }
});
const browsePayload = (win, ids) => win.JSON.stringify(browseResponse([shelfOf(ids.map(tile))]));
const parseIds = (win, ids) => shelfItemsOf(win.JSON.parse(browsePayload(win, ids)));
const emitted = (win, id) => tileUrl(parseIds(win, [id])[0]);

function mount(win, id, url) {
  const el = win.document.createElement('ytlr-thumbnail-details');
  el.style.backgroundImage = 'url("' + (url || hq(id)) + '")';
  win.document.querySelector('ytlr-app').appendChild(el);
  return el;
}

function imageStub(win, srcs, width = 640) {
  srcs.settled = 0;
  win.Image = class {
    set src(url) {
      srcs.push(url);
      if (width === 'never') return;
      setTimeout(() => {
        if (width === 'error') {
          if (this.onerror) this.onerror();
        } else {
          this.naturalWidth = width;
          if (this.onload) this.onload();
        }
        srcs.settled++;
      }, 0);
    }
  };
}

module.exports = {
  hq,
  sd,
  isHq,
  isSd,
  isMax,
  thumbs,
  tile,
  tileUrl,
  lockup,
  browsePayload,
  parseIds,
  emitted,
  mount,
  imageStub
};
