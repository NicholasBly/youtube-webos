// The MutationObserver that feeds the queue, armed and disarmed by the
// Legacy Emoji Fix setting.
import { configRead } from '../../core/config.js';
import { parsedTextCache } from './tokenize.js';
import {
  textNodesToProcess,
  emojiState,
  dropStaleRender,
  queueTextNode,
  processQueue,
  scanElement
} from './text-nodes.js';
import { log } from './log.js';

const emojiObs = new MutationObserver((mutations) => {
  // Elements added in this batch. A subtree is usually attached and then
  // filled in, so the same text would be scanned once per nesting level;
  // scanning only the outermost added elements covers everything once.
  const added = [];
  for (let i = 0; i < mutations.length; i++) {
    const mut = mutations[i];

    if (mut.type === 'characterData') {
      dropStaleRender(mut.target);
      queueTextNode(mut.target);
    } else if (mut.type === 'childList') {
      const addedNodes = mut.addedNodes;
      for (let j = 0; j < addedNodes.length; j++) {
        const node = addedNodes[j];

        if (node.nodeType === Node.TEXT_NODE) {
          queueTextNode(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // A rendered emoji and its twin (tokenize.js) carry no sentinels:
          // scanElement's text check stops at them.
          added.push(node);
        }
      }
    }
  }
  // One walk up the parents per node against the set of added elements,
  // rather than contains() between every pair.
  const addedSet = added.length > 1 ? new Set(added) : null;
  for (let i = 0; i < added.length; i++) {
    const node = added[i];
    let nested = false;
    if (addedSet) {
      for (let p = node.parentNode; p; p = p.parentNode) {
        if (addedSet.has(p)) {
          nested = true;
          break;
        }
      }
    }
    if (!nested) scanElement(node);
  }

  if (textNodesToProcess.size > 0 && emojiState.frameId === null) {
    emojiState.frameId = window.requestAnimationFrame(processQueue);
  }
});

let isObserving = false;

/**
 * Starts the emoji observer (and scans the page once) while the Emoji + Characters Fix is on; stops
 * it and clears its queues when it is turned off.
 */
export function manageObserverState() {
  // On only while the fix is enabled.
  const shouldObserve = configRead('enableLegacyEmojiFix');

  if (shouldObserve && !isObserving) {
    emojiObs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    scanElement(document.body);
    if (textNodesToProcess.size > 0 && emojiState.frameId === null) {
      emojiState.frameId = window.requestAnimationFrame(processQueue);
    }
    isObserving = true;
    log.debug('Legacy Emoji fix enabled.');
  } else if (!shouldObserve && isObserving) {
    emojiObs.disconnect();
    textNodesToProcess.clear();
    parsedTextCache.clear();
    isObserving = false;
    log.debug('Legacy Emoji fix disabled.');
  }
}

/** Drops the queued nodes on a heavy UI transition, while the observer is armed. */
export function flushQueue() {
  if (isObserving) textNodesToProcess.clear();
}
