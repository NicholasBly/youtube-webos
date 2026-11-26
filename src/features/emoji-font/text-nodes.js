// Text nodes: which ones qualify, the queue drained once per frame, and the
// in-place replacement of a wrapped emoji run with its rendered span.
import { parsedTextCache, MAX_CACHE_SIZE, tokenizeEmoji, renderTokens } from './tokenize.js';
import { SELECTORS } from '../../core/selectors.js';
import { log } from './log.js';

// No 'g' flag: test() and exec() keep no position between calls.
const WRAPPED_EMOJI_RE = /\u200B([^\u200C]+)\u200C/;
// Only text nodes inside elements where emoji actually render: YouTube's two
// text hosts and the generic containers they sit in, compared by localName.
const ALLOWED_EMOJI_TAGS = new Set(
  [].concat(SELECTORS.TEXT_HOST_TAGS, ['span', 'div', 'h1', 'h2', 'h3'])
);

export const textNodesToProcess = new Set();
const nodeToSpan = new WeakMap();
// What a render put after a text node the app owns (the pieces split off it
// and the spans), with the value it left the node at. The app rewrites titles
// in place (node.data): a rewrite takes all of it away before the new text is
// looked at, or the old emoji and tail would stay beside it.
const renderedAfter = new WeakMap();

/** A characterData record for `node`: drops a render the app has since rewritten. */
export function dropStaleRender(node) {
  const rec = renderedAfter.get(node);
  // The node still holds what the render left: the record was the render's own.
  if (!rec || node.nodeValue === rec.value) return;
  renderedAfter.delete(node);
  for (let i = 0; i < rec.nodes.length; i++) {
    const n = rec.nodes[i];
    if (n.parentNode) n.parentNode.removeChild(n);
  }
}

// Shared with observer.js: the pending frame.
export const emojiState = { frameId: null };

/**
 * Queues a text node for rendering when it holds a wrapped emoji and sits in an element where emoji
 * are drawn.
 */
export function queueTextNode(node) {
  const val = node.nodeValue;
  if (!val || !WRAPPED_EMOJI_RE.test(val)) return;

  // A rendered emoji's own text (tokenize.js) carries no sentinels and has
  // already failed the test above.
  const parent = node.parentElement;
  if (!parent || !ALLOWED_EMOJI_TAGS.has(parent.localName)) return;

  textNodesToProcess.add(node);
}

/** Renders every queued text node (once per animation frame). */
export function processQueue() {
  // forEach, not for...of: this build is the legacy one, where a for...of
  // over a Set becomes an iterator helper inside try/catch/finally, and webOS
  // 3's engine does not optimise a function holding a try.
  textNodesToProcess.forEach(processTextNode);
  textNodesToProcess.clear();
  emojiState.frameId = null;
}

/** The tokens of one emoji run, through the parse cache. */
function tokensFor(cleanEmoji) {
  let tokens = parsedTextCache.get(cleanEmoji);
  if (tokens) return tokens;
  tokens = tokenizeEmoji(cleanEmoji);
  parsedTextCache.set(cleanEmoji, tokens);
  if (parsedTextCache.size > MAX_CACHE_SIZE) {
    // Trim oldest half rather than .clear() — Map iteration is insertion
    // order, so dropping the first 250 keeps the most-recently-parsed
    // emojis hot for the page the user is actually scrolling.
    const keysIter = parsedTextCache.keys();
    const trimCount = MAX_CACHE_SIZE >> 1;
    for (let i = 0; i < trimCount; i++) {
      parsedTextCache.delete(keysIter.next().value);
    }
  }
  return tokens;
}

/** "twemoji changed something" == "at least one img token". */
function hasEmojiImage(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].src !== undefined) return true;
  }
  return false;
}

/**
 * Renders the run `node` holds into the span an earlier pass put after it,
 * or into a new one (added to `created`); the node's own text is emptied.
 */
function renderRun(node, parent, tokens, cleanEmoji, created) {
  node.nodeValue = '';
  const existing = nodeToSpan.get(node);
  if (existing && existing.parentNode === parent) {
    renderTokens(existing, tokens);
    log.debug('Replaced emoji in existing span.');
    return;
  }
  const span = document.createElement('emoji-render');
  span.className = 'twemoji-injected';
  renderTokens(span, tokens);
  parent.insertBefore(span, node.nextSibling);
  nodeToSpan.set(node, span);
  created.push(span);
  log.debug('Injected new emoji-render span for:', cleanEmoji);
}

/**
 * Splits a text node around each wrapped emoji and replaces the emoji with its twemoji image (and a
 * hidden text twin).
 */
function processTextNode(textNode) {
  if (!textNode.parentNode) return;

  const parent = textNode.parentNode;
  if (parent.classList?.contains('twemoji-injected')) return;

  let currentNode = textNode;
  let match = WRAPPED_EMOJI_RE.exec(currentNode.nodeValue || '');
  // The nodes this pass puts after textNode, for dropStaleRender().
  const created = [];

  while (match) {
    const startIndex = match.index;
    const emojiLength = match[0].length;
    const cleanEmoji = match[1];

    if (startIndex > 0) {
      currentNode = currentNode.splitText(startIndex);
      created.push(currentNode);
    }

    let nextNode = null;
    if (currentNode.nodeValue.length > emojiLength) {
      nextNode = currentNode.splitText(emojiLength);
      created.push(nextNode);
    }

    const tokens = tokensFor(cleanEmoji);
    if (hasEmojiImage(tokens)) renderRun(currentNode, parent, tokens, cleanEmoji, created);

    if (nextNode && WRAPPED_EMOJI_RE.test(nextNode.nodeValue || '')) {
      currentNode = nextNode;
      match = WRAPPED_EMOJI_RE.exec(currentNode.nodeValue || '');
    } else {
      break;
    }
  }

  if (created.length > 0) {
    const prev = renderedAfter.get(textNode);
    renderedAfter.set(textNode, {
      nodes: prev ? prev.nodes.concat(created) : created,
      value: textNode.nodeValue
    });
  }
}

/**
 * Queues every text node of an added element that holds a wrapped emoji; elements where emoji are
 * not drawn are skipped.
 */
export function scanElement(el) {
  const tag = el.localName;
  if (!ALLOWED_EMOJI_TAGS.has(tag) && tag !== 'body' && tag !== SELECTORS.APP_ROOT) {
    return;
  }

  const textContent = el.textContent;
  if (!textContent || !WRAPPED_EMOJI_RE.test(textContent)) return;
  // No try: nothing here throws for an element, and a try would keep the walk
  // unoptimised on webOS 3 and 4, where it runs for every added subtree.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  let tNode;
  let queuedCount = 0;
  while ((tNode = walker.nextNode())) {
    queueTextNode(tNode);
    queuedCount++;
  }
  if (queuedCount > 0) {
    log.debug('Found and queued', queuedCount, 'text nodes in element:', el.tagName);
  }
}
