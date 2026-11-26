// The tiles the app currently has thumbnails rendered for: a free visibility
// signal, since the list is virtualised and "has a rendered thumbnail" already
// means "on or near screen". Not IntersectionObserver: webOS 3 has none, and
// reading .style.backgroundImage touches no layout at all.
import { PROBE_VISIBLE_BURST, VISIBLE_SAMPLE_TTL } from './constants.js';
import { SELECTORS } from '../../core/selectors.js';
import { THUMB_IN_CSS_RE } from './ladder.js';
import { state } from './state.js';

/**
 * Calls `fn(element, videoId, backgroundImage)` for every rendered tile whose
 * background is a thumbnail. No try: the selector is a constant, and a try
 * would keep this loop (every sample and every sweep) unoptimised on webOS 3.
 */
export function renderedThumbnails(fn) {
  const nodes = document.querySelectorAll(SELECTORS.THUMBNAIL_NODES);
  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i];
    const background = element.style && element.style.backgroundImage;
    if (!background) continue;
    const match = THUMB_IN_CSS_RE.exec(background);
    if (match) fn(element, match[1], background);
  }
}

/** The videoIds on screen, sampled at most once per VISIBLE_SAMPLE_TTL. */
export function sampleRenderedIds() {
  const now = performance.now();
  if (state.visibleSample && now - state.visibleSampleAt < VISIBLE_SAMPLE_TTL) {
    return state.visibleSample;
  }

  const ids = new Set();
  renderedThumbnails((element, videoId) => ids.add(videoId));

  // Scrolling new tiles into view is itself a grant of budget: scrolling through
  // already-loaded content fetches nothing, so without it on-screen grey boxes
  // would wait behind the idle gate with a full queue in front of them.
  if (state.visibleSample === null || !sameIds(state.visibleSample, ids)) {
    state.visibleBudget = PROBE_VISIBLE_BURST;
  }

  state.visibleSample = ids;
  state.visibleSampleAt = now;
  return ids;
}

/** Whether two sets hold the same ids. */
function sameIds(a, b) {
  if (a.size !== b.size) return false;
  const iterator = a.values();
  let step = iterator.next();
  while (!step.done) {
    if (!b.has(step.value)) return false;
    step = iterator.next();
  }
  return true;
}
