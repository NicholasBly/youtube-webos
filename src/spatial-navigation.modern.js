/* Modern Spatial Navigation Polyfill (Target: Chrome 87+)
 * Optimized for webOS 22-25 & modern environments.
 * Hyper-Optimized for maximum throughput, zero layout thrashing, and minimal GC.
 */
(function () {
  if ('navigate' in window) return;

  const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  const TAB_KEY_CODE = 9;
  const SPINNABLE_INPUT_TYPES = new Set(['email', 'date', 'month', 'number', 'time', 'week']);
  const TEXT_INPUT_TYPES = new Set(['password', 'text', 'search', 'tel', 'url', null]);
  
  // TICK CACHES: Map is faster than WeakMap for ephemeral, single-tick lifetimes.
  let mapOfBoundRect = null;
  let mapOfComputedStyle = null;
  
  let startingPoint = null;
  let savedSearchOrigin = { element: null, rect: null };
  let searchOriginRect = null;
  
  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  
  window.addEventListener('resize', () => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
  }, { passive: true });

  function initiateSpatialNavigation() {
    window.navigate = navigate;
    window.Element.prototype.spatialNavigationSearch = spatialNavigationSearch;
    window.Element.prototype.focusableAreas = focusableAreas;
    window.Element.prototype.getSpatialNavigationContainer = getSpatialNavigationContainer;

    if (window.CSS?.registerProperty) {
      const computedRoot = window.getComputedStyle(document.documentElement);
      if (!computedRoot.getPropertyValue('--spatial-navigation-contain')) {
        CSS.registerProperty({ name: '--spatial-navigation-contain', syntax: 'auto | contain', inherits: false, initialValue: 'auto' });
      }
      if (!computedRoot.getPropertyValue('--spatial-navigation-action')) {
        CSS.registerProperty({ name: '--spatial-navigation-action', syntax: 'auto | focus | scroll', inherits: false, initialValue: 'auto' });
      }
      if (!computedRoot.getPropertyValue('--spatial-navigation-function')) {
        CSS.registerProperty({ name: '--spatial-navigation-function', syntax: 'normal | grid', inherits: false, initialValue: 'normal' });
      }
    }
  }

  function spatialNavigationHandler() {
    window.addEventListener('keydown', (e) => {
      const currentKeyMode = window.parent?.__spatialNavigation__?.keyMode ?? window.__spatialNavigation__?.keyMode;
      const eventTarget = document.activeElement;
      const dir = ARROW_KEY_CODE[e.keyCode];

      if (e.keyCode === TAB_KEY_CODE) startingPoint = null;

      if (!currentKeyMode || currentKeyMode === 'NONE' || 
         (currentKeyMode === 'SHIFTARROW' && !e.shiftKey) || 
         (currentKeyMode === 'ARROW' && e.shiftKey)) return;

      if (!e.defaultPrevented) {
        let focusNavigableArrowKey = { left: true, up: true, right: true, down: true };

        if (eventTarget.nodeName === 'INPUT' || eventTarget.nodeName === 'TEXTAREA') {
          focusNavigableArrowKey = handlingEditableElement(e);
        }

        if (focusNavigableArrowKey[dir]) {
          e.preventDefault();
          
          // Use standard Map for fastest possible single-frame read/write speeds
          mapOfBoundRect = new Map();
          mapOfComputedStyle = new Map(); 
          
          navigate(dir);
          
          // Free memory instantly
          mapOfBoundRect = null;
          mapOfComputedStyle = null; 
          startingPoint = null;
        }
      }
    });

    document.addEventListener('mouseup', (e) => {
    startingPoint = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    window.addEventListener('focusin', (e) => {
      if (e.target !== window) {
        savedSearchOrigin.element = e.target;
        savedSearchOrigin.rect = e.target.getBoundingClientRect(); // Uncached, rare event
      }
    });
  }
  
  function getCachedComputedStyle(element) {
    if (!mapOfComputedStyle) return window.getComputedStyle(element);
    let style = mapOfComputedStyle.get(element);
    if (!style) {
      style = window.getComputedStyle(element);
      mapOfComputedStyle.set(element, style);
    }
    return style;
  }

  function navigate(dir) {
    const searchOrigin = findSearchOrigin();
    let eventTarget = searchOrigin;
    let elementFromPosition = null;

    if (startingPoint) {
      elementFromPosition = document.elementFromPoint(startingPoint.x, startingPoint.y) ?? document.body;
      if (isFocusable(elementFromPosition) && !isContainer(elementFromPosition)) {
        startingPoint = null;
      } else {
        eventTarget = isContainer(elementFromPosition) ? elementFromPosition : elementFromPosition.getSpatialNavigationContainer();
      }
    }

    if (eventTarget === document || eventTarget === document.documentElement) {
      eventTarget = document.body || document.documentElement;
    }

    let container = null;
    if ((isContainer(eventTarget) || eventTarget.nodeName === 'BODY') && eventTarget.nodeName !== 'INPUT') {
      if (eventTarget.nodeName === 'IFRAME') eventTarget = eventTarget.contentDocument.documentElement;
      container = eventTarget;
      let bestInsideCandidate = null;

      if ((document.activeElement === searchOrigin) || (document.activeElement === document.body && searchOrigin === document.documentElement)) {
        const action = getCSSSpatNavAction(eventTarget);
        if (action === 'scroll' && scrollingController(eventTarget, dir)) return;
        else if (action === 'focus') {
          bestInsideCandidate = eventTarget.spatialNavigationSearch(dir, { container: eventTarget, candidates: getSpatialNavigationCandidates(eventTarget, { mode: 'all' }) });
          if (focusingController(bestInsideCandidate, dir)) return;
        } else if (action === 'auto') {
          bestInsideCandidate = eventTarget.spatialNavigationSearch(dir, { container: eventTarget });
          if (focusingController(bestInsideCandidate, dir) || scrollingController(eventTarget, dir)) return;
        }
      } else {
        container = container.getSpatialNavigationContainer();
      }
    }

    container = eventTarget.getSpatialNavigationContainer();
    let parentContainer = container.parentElement ? container.getSpatialNavigationContainer() : null;

    if (!parentContainer && window.location !== window.parent.location) {
      parentContainer = window.parent.document.documentElement;
    }

    const containerAction = getCSSSpatNavAction(container);
    if (containerAction === 'scroll' && scrollingController(container, dir)) return;
    else if (containerAction === 'focus') navigateChain(eventTarget, container, parentContainer, dir, 'all');
    else if (containerAction === 'auto') navigateChain(eventTarget, container, parentContainer, dir, 'visible');
  }

  function focusingController(bestCandidate, dir) {
    if (bestCandidate) {
      if (!createSpatNavEvents('beforefocus', bestCandidate, null, dir)) return true;
      const container = bestCandidate.getSpatialNavigationContainer();
      bestCandidate.focus({ preventScroll: container === window || getCSSSpatNavAction(container) !== 'focus' });
      startingPoint = null;
      return true;
    }
    return false;
  }

  function scrollingController(container, dir) {
    if (isScrollable(container, dir) && !isScrollBoundary(container, dir)) {
      moveScroll(container, dir);
      return true;
    }
    if (!container.parentElement && !isHTMLScrollBoundary(container, dir)) {
      moveScroll(container.ownerDocument.documentElement, dir);
      return true;
    }
    return false;
  }

  function moveScroll(element, dir, offset = 0) {
    if (!element) return;
    
    const scrollStep = 40 + offset;

    switch (dir) {
      case 'left': element.scrollBy({ left: -scrollStep }); break;
      case 'right': element.scrollBy({ left: scrollStep }); break;
      case 'up': element.scrollBy({ top: -scrollStep }); break;
      case 'down': element.scrollBy({ top: scrollStep }); break;
    }
  }

  // Accumulator pattern. Zero spread operators. Zero intermediate arrays.
  function getSpatialNavigationCandidates(container, option = { mode: 'visible' }, acc = []) {
    if (container.childElementCount > 0) {
      if (!container.parentElement) container = container.querySelector('body') ?? document.body;
      const children = container.children;
      
      for (let i = 0; i < children.length; i++) {
        const elem = children[i];
        if (isDelegableContainer(elem)) {
          acc.push(elem);
        } else if (isFocusable(elem)) {
          acc.push(elem);
          if (!isContainer(elem) && elem.childElementCount) getSpatialNavigationCandidates(elem, { mode: 'all' }, acc);
        } else if (elem.childElementCount) {
          getSpatialNavigationCandidates(elem, { mode: 'all' }, acc);
        }
      }
    }
    
    if (!acc._isFiltered && option.mode !== 'all') {
      const filtered = [];
      for (let i = 0; i < acc.length; i++) {
        if (isVisible(acc[i])) filtered.push(acc[i]);
      }
      filtered._isFiltered = true;
      return filtered;
    }
    return acc;
  }

  function getFilteredSpatialNavigationCandidates(element, dir, candidates, container) {
    container = container || element.getSpatialNavigationContainer();
    candidates = (!candidates || candidates.length === 0) ? getSpatialNavigationCandidates(container) : candidates;
    return filteredCandidates(element, candidates, dir, container);
  }

  function spatialNavigationSearch(dir, args = {}) {
    const targetElement = this;
    const defaultContainer = targetElement.getSpatialNavigationContainer();
    const container = args.container || defaultContainer;
    
    let defaultCandidates = getSpatialNavigationCandidates(defaultContainer);
    if (args.container && defaultContainer.contains(args.container)) {
      const additional = getSpatialNavigationCandidates(container);
      for (let i = 0; i < additional.length; i++) defaultCandidates.push(additional[i]);
    }
    
    const rawCandidates = args.candidates?.length ? args.candidates : defaultCandidates;
    const candidates = [];
    
    const isDefault = rawCandidates === defaultCandidates; 
    
    for (let i = 0; i < rawCandidates.length; i++) {
        const c = rawCandidates[i];
        if (container.contains(c) && (!isDefault || container !== c)) candidates.push(c);
    }

    if (!candidates.length) return null;

    let internalCandidates = [];
    let externalCandidates = [];
    
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c !== targetElement) {
        (targetElement.contains(c) ? internalCandidates : externalCandidates).push(c);
      }
    }

    const internalSet = new Set(internalCandidates);
    let insideOverlappedCandidates = getOverlappedCandidates(targetElement);
    
    for (let i = 0; i < insideOverlappedCandidates.length; i++) {
        const c = insideOverlappedCandidates[i];
        if (!internalSet.has(c) && container.contains(c)) internalCandidates.push(c);
    }

    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (isContainer(c) && isEntirelyVisible(targetElement, c)) {
            const areas = c.focusableAreas();
            for (let j = 0; j < areas.length; j++) {
                if (areas[j] !== targetElement && container.contains(areas[j])) externalCandidates.push(areas[j]);
            }
        }
    }

    if (externalCandidates.length) {
      externalCandidates = getFilteredSpatialNavigationCandidates(targetElement, dir, externalCandidates, container);
    }
    
    let bestTarget;
    if (searchOriginRect) {
      bestTarget = selectBestCandidate(targetElement, getFilteredSpatialNavigationCandidates(targetElement, dir, internalCandidates, container), dir);
    }

    if (internalCandidates.length && targetElement.nodeName !== 'INPUT') {
      bestTarget = selectBestCandidateFromEdge(targetElement, internalCandidates, dir);
    }

    bestTarget = bestTarget || selectBestCandidate(targetElement, externalCandidates, dir);

    if (bestTarget && isDelegableContainer(bestTarget)) {
      const innerTarget = getSpatialNavigationCandidates(bestTarget, { mode: 'all' });
      const descendantsBest = innerTarget.length ? targetElement.spatialNavigationSearch(dir, { candidates: innerTarget, container: bestTarget }) : null;
      if (descendantsBest) bestTarget = descendantsBest;
      else if (!isFocusable(bestTarget)) {
        candidates.splice(candidates.indexOf(bestTarget), 1);
        bestTarget = candidates.length ? targetElement.spatialNavigationSearch(dir, { candidates, container }) : null;
      }
    }
    return bestTarget;
  }

  function filteredCandidates(currentElm, candidates, dir, container) {
    if (!dir) return candidates;
    const originalContainer = currentElm.getSpatialNavigationContainer();
    const eventTargetRect = (originalContainer.parentElement && container !== originalContainer && !isVisible(currentElm)) ? 
      getBoundingClientRect(originalContainer) : (searchOriginRect || getBoundingClientRect(currentElm));

    const isCurrentContainer = (isContainer(currentElm) || currentElm.nodeName === 'BODY') && currentElm.nodeName !== 'INPUT';
    const result = [];
    
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (!container.contains(candidate) || candidate === currentElm) continue;
        
        const candidateRect = getBoundingClientRect(candidate);
        if (isCurrentContainer) {
            if ((currentElm.contains(candidate) && isInside(eventTargetRect, candidateRect)) || isOutside(candidateRect, eventTargetRect, dir)) {
                result.push(candidate);
            }
        } else {
            const candidateBody = candidate.nodeName === 'IFRAME' ? candidate.contentDocument.body : null;
            if (candidateBody !== currentElm && isOutside(candidateRect, eventTargetRect, dir) && !isInside(eventTargetRect, candidateRect)) {
                result.push(candidate);
            }
        }
    }
    return result;
  }

  function selectBestCandidate(currentElm, candidates, dir) {
    const container = currentElm.getSpatialNavigationContainer();
    const isGrid = getCachedComputedStyle(container).getPropertyValue('--spatial-navigation-function').trim() === 'grid';
    const currentTargetRect = searchOriginRect || getBoundingClientRect(currentElm);

    if (isGrid) {
      const aligned = [];
      for (let i = 0; i < candidates.length; i++) {
          if (isAligned(currentTargetRect, getBoundingClientRect(candidates[i]), dir)) aligned.push(candidates[i]);
      }
      if (aligned.length) candidates = aligned;
    }
    
    return getClosestElement(currentElm, candidates, dir, isGrid ? getAbsoluteDistance : getDistance);
  }

  function selectBestCandidateFromEdge(currentElm, candidates, dir) {
    return getClosestElement(currentElm, candidates, dir, startingPoint ? getDistanceFromPoint : getInnerDistance);
  }

  function getClosestElement(currentElm, candidates, dir, distanceFunction) {
    let eventTargetRect;
    if (window.location !== window.parent.location && (currentElm.nodeName === 'BODY' || currentElm.nodeName === 'HTML')) {
      eventTargetRect = window.frameElement.getBoundingClientRect(); // Uncached frame bound
      eventTargetRect.x = 0;
      eventTargetRect.y = 0;
    } else {
      eventTargetRect = searchOriginRect || getBoundingClientRect(currentElm);
    }

    let minDistance = Number.POSITIVE_INFINITY;
    let minDistanceElements = [];

    if (candidates) {
        for (let i = 0; i < candidates.length; i++) {
            const distance = distanceFunction(eventTargetRect, getBoundingClientRect(candidates[i]), dir);
            if (distance < minDistance) {
                minDistance = distance;
                minDistanceElements = [candidates[i]];
            } else if (distance === minDistance) {
                minDistanceElements.push(candidates[i]);
            }
        }
    }

    if (!minDistanceElements.length) return null;
    return (minDistanceElements.length > 1 && distanceFunction === getAbsoluteDistance) ? 
      getClosestElement(currentElm, minDistanceElements, dir, getEuclideanDistance) : minDistanceElements[0];
  }

  function getSpatialNavigationContainer() {
    let container = this;
    do {
      if (!container.parentElement) {
        container = (window.location !== window.parent.location) ? window.parent.document.documentElement : window.document.documentElement;
        break;
      }
      container = container.parentElement;
    } while (!isContainer(container));
    return container;
  }

  function getScrollContainer(element) {
    let scrollContainer = element;
    do {
      if (!scrollContainer.parentElement) {
        scrollContainer = (window.location !== window.parent.location) ? window.parent.document.documentElement : window.document.documentElement;
        break;
      }
      scrollContainer = scrollContainer.parentElement;
    } while (!isScrollContainer(scrollContainer) || !isVisible(scrollContainer));

    return (scrollContainer === document || scrollContainer === document.documentElement) ? window : scrollContainer;
  }

  // Direct looping over NodeList instead of spreading to array first.
  function focusableAreas(option = { mode: 'visible' }) {
    const container = this.parentElement ? this : document.body;
    const elements = container.getElementsByTagName('*');
    const result = [];
    
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (isFocusable(el) && (option.mode === 'all' || isVisible(el))) result.push(el);
    }
    return result;
  }

  function createSpatNavEvents(eventType, containerElement, currentElement, direction) {
    if (eventType === 'beforefocus' || eventType === 'notarget') {
      return containerElement.dispatchEvent(new CustomEvent('nav' + eventType, {
        bubbles: true, cancelable: true, detail: { causedTarget: currentElement, dir: direction }
      }));
    }
  }

  function readCssVar(element, varName) {
    return (getCachedComputedStyle(element).getPropertyValue(`--${varName}`) || '').trim();
  }

  function isCSSSpatNavContain(element) {
    return readCssVar(element, 'spatial-navigation-contain') === 'contain';
  }

  function getCSSSpatNavAction(element) {
    return readCssVar(element, 'spatial-navigation-action') || 'auto';
  }

  function navigateChain(eventTarget, container, parentContainer, dir, option) {
    let currentOption = { candidates: getSpatialNavigationCandidates(container, { mode: option }), container };

    while (parentContainer) {
      if (focusingController(eventTarget.spatialNavigationSearch(dir, currentOption), dir)) return;
      if (option === 'visible' && scrollingController(container, dir)) return;
      
      if (!createSpatNavEvents('notarget', container, eventTarget, dir)) return;

      if (container === document || container === document.documentElement) {
        if (window.location !== window.parent.location) {
          eventTarget = window.frameElement;
          container = eventTarget.ownerDocument.documentElement;              
        }
      } else {
        container = parentContainer;
      }
      
      currentOption = { candidates: getSpatialNavigationCandidates(container, { mode: option }), container };
      let nextContainer = container.getSpatialNavigationContainer();
      parentContainer = nextContainer !== container ? nextContainer : null;
    }

    currentOption = { candidates: getSpatialNavigationCandidates(container, { mode: option }), container };
    if (!parentContainer && container && focusingController(eventTarget.spatialNavigationSearch(dir, currentOption), dir)) return;
    if (!createSpatNavEvents('notarget', currentOption.container, eventTarget, dir)) return;
    if (getCSSSpatNavAction(container) === 'auto' && option === 'visible') scrollingController(container, dir);
  }

  function findSearchOrigin() {
    let searchOrigin = document.activeElement;
    if (!searchOrigin || (searchOrigin === document.body && !document.querySelector(':focus'))) {
      if (savedSearchOrigin.element && searchOrigin !== savedSearchOrigin.element) {
        const style = getCachedComputedStyle(savedSearchOrigin.element);
        if (savedSearchOrigin.element.disabled || style.visibility === 'hidden' || style.visibility === 'collapse') return savedSearchOrigin.element;
      }
      searchOrigin = document.documentElement;
    }
    
    if (savedSearchOrigin.element) {
      const rect = getBoundingClientRect(savedSearchOrigin.element);
      if (rect.height === 0 || rect.width === 0) searchOriginRect = savedSearchOrigin.rect;
    }
    
    if (!isVisibleInScroller(searchOrigin)) {
      const scroller = getScrollContainer(searchOrigin);
      if (scroller && (scroller === window || getCSSSpatNavAction(scroller) === 'auto')) return scroller;
    }
    return searchOrigin;
  }

  function isContainer(element) {
    return !element.parentElement || element.nodeName === 'IFRAME' || isScrollContainer(element) || isCSSSpatNavContain(element);
  }

  function isDelegableContainer(element) {
    return readCssVar(element, 'spatial-navigation-contain') === 'delegable';
  }

  function isScrollContainer(element) {
    const style = getCachedComputedStyle(element);
    return (style.overflowX !== 'visible' && style.overflowX !== 'clip' && isOverflow(element, 'left')) ||
           (style.overflowY !== 'visible' && style.overflowY !== 'clip' && isOverflow(element, 'down'));
  }

  function isScrollable(element, dir) {
    if (!element || typeof element !== 'object') return false;
    if (dir) {
      if (isOverflow(element, dir)) {
        const style = getCachedComputedStyle(element);
        if (dir === 'left' || dir === 'right') return style.overflowX !== 'visible' && style.overflowX !== 'clip' && style.overflowX !== 'hidden';
        if (dir === 'up' || dir === 'down') return style.overflowY !== 'visible' && style.overflowY !== 'clip' && style.overflowY !== 'hidden';
      }
      return false;
    }
    return element.nodeName === 'HTML' || element.nodeName === 'BODY' || (isScrollContainer(element) && isOverflow(element));
  }

  function isOverflow(element, dir) {
    if (!element || typeof element !== 'object') return false;
    if (dir) {
      if (dir === 'left' || dir === 'right') return element.scrollWidth > element.clientWidth;
      if (dir === 'up' || dir === 'down') return element.scrollHeight > element.clientHeight;
    }
    return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
  }

  function isHTMLScrollBoundary(element, dir) {
  switch (dir) {
      case 'left': return element.scrollLeft <= 1;
      case 'right': return Math.abs(element.scrollWidth - element.scrollLeft - element.clientWidth) <= 1;
      case 'up': return element.scrollTop <= 1;
      case 'down': return Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) <= 1;
    }
    return false;
  }

  function isScrollBoundary(element, dir) {
    if (!isScrollable(element, dir)) return false;
    switch (dir) {
      case 'left': return element.scrollLeft === 0;
      case 'right': return Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)) <= 1;
      case 'up': return element.scrollTop === 0;
      case 'down': return Math.abs(element.scrollTop - (element.scrollHeight - element.clientHeight)) <= 1;
    }
    return false;
  }

  function isVisibleInScroller(element) {
    const elementRect = getBoundingClientRect(element);
    const scroller = getScrollContainer(element);
    const scrollerRect = scroller !== window ? getBoundingClientRect(scroller) : { left: 0, right: viewportWidth, top: 0, bottom: viewportHeight };
    return isInside(scrollerRect, elementRect, 'left') && isInside(scrollerRect, elementRect, 'down');
  }

  function isFocusable(element) {
    if (element.tabIndex < 0 || isAtagWithoutHref(element) || isActuallyDisabled(element) || isExpresslyInert(element) || !isBeingRendered(element)) return false;
    return !element.parentElement || (isScrollable(element) && isOverflow(element)) || element.tabIndex >= 0;
  }

  function isAtagWithoutHref(element) {
    return element.tagName === 'A' && !element.hasAttribute('href') && !element.hasAttribute('tabIndex');
  }

  function isActuallyDisabled(element) {
    const t = element.tagName;
    return (t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'OPTGROUP' || t === 'OPTION' || t === 'FIELDSET') && element.disabled;
  }

  function isExpresslyInert(element) {
    return element.inert && !element.ownerDocument.documentElement.inert;
  }

  function isBeingRendered(element) {
    if (!element.parentElement) return isVisibleStyleProperty(element);
    if (!isVisibleStyleProperty(element.parentElement)) return false;
    const style = getCachedComputedStyle(element);
    return isVisibleStyleProperty(element) && style.opacity !== '0' && style.height !== '0px' && style.width !== '0px';
  }

  function isVisible(element) {
    return !element.parentElement || (isVisibleStyleProperty(element) && hitTest(element));
  }

  function isEntirelyVisible(element, container) {
    const rect = getBoundingClientRect(element);
    const containerRect = getBoundingClientRect(container || element.getSpatialNavigationContainer());
    return !(rect.left < containerRect.left || rect.right > containerRect.right || rect.top < containerRect.top || rect.bottom > containerRect.bottom);
  }

  function isVisibleStyleProperty(element) {
    const style = getCachedComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }

  // Uses cached DOMRect properties instead of layout-triggering offsetWidth
  function hitTest(element) {
    const rect = getBoundingClientRect(element);
    const docElm = element.ownerDocument.documentElement;
    if (element.nodeName !== 'IFRAME' && (rect.top < 0 || rect.left < 0 || rect.top > docElm.clientHeight || rect.left > docElm.clientWidth)) return false;

    const offsetX = (rect.width * 0.1) || 1;
    const offsetY = (rect.height * 0.1) || 1;

    const points = [
      [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2],
      [rect.left + offsetX, rect.top + offsetY],
      [rect.right - offsetX, rect.bottom - offsetY]
    ];

    for (let i = 0; i < 3; i++) {
      const elemFromPoint = element.ownerDocument.elementFromPoint(points[i][0], points[i][1]);
      if (element === elemFromPoint || element.contains(elemFromPoint)) return true;
    }
    return false;
  }

  function isInside(containerRect, childRect) {
    return (containerRect.left <= childRect.right && containerRect.right >= childRect.right || containerRect.left <= childRect.left && containerRect.right >= childRect.left) &&
           (containerRect.top <= childRect.top && containerRect.bottom >= childRect.top || containerRect.top <= childRect.bottom && containerRect.bottom >= childRect.bottom);
  }

  function isOutside(rect1, rect2, dir) {
    switch (dir) {
      case 'left': return isRightSide(rect2, rect1);
      case 'right': return isRightSide(rect1, rect2);
      case 'up': return isBelow(rect2, rect1);
      case 'down': return isBelow(rect1, rect2);
    }
    return false;
  }

  function isRightSide(rect1, rect2) {
    return rect1.left >= rect2.right || (rect1.left >= rect2.left && rect1.right > rect2.right && rect1.bottom > rect2.top && rect1.top < rect2.bottom);
  }

  function isBelow(rect1, rect2) {
    return rect1.top >= rect2.bottom || (rect1.top >= rect2.top && rect1.bottom > rect2.bottom && rect1.left < rect2.right && rect1.right > rect2.left);
  }

  function isAligned(rect1, rect2, dir) {
    return (dir === 'left' || dir === 'right') ? (rect1.bottom > rect2.top && rect1.top < rect2.bottom) : (rect1.right > rect2.left && rect1.left < rect2.right);
  }

  // Math.hypot removed in favor of faster Math.sqrt computation
  function getDistanceFromPoint(point, element, dir) {
    const points = getEntryAndExitPoints(dir, startingPoint, element);
    const x = points.entryPoint.x - points.exitPoint.x;
    const y = points.entryPoint.y - points.exitPoint.y;
    return Math.sqrt((x * x) + (y * y));
  }

  function getInnerDistance(rect1, rect2, dir) {
    const edge = { left: 'right', right: 'left', up: 'bottom', down: 'top' }[dir];
    return Math.abs(rect1[edge] - rect2[edge]);
  }

  function getDistance(searchOrigin, candidateRect, dir) {
    const points = getEntryAndExitPoints(dir, searchOrigin, candidateRect);
    const P1 = Math.abs(points.entryPoint.x - points.exitPoint.x);
    const P2 = Math.abs(points.entryPoint.y - points.exitPoint.y);
    const A = Math.sqrt((P1 * P1) + (P2 * P2));
    
    const intersectionRect = getIntersectionRect(searchOrigin, candidateRect);
    const D = intersectionRect.area;
    
    let B = 0, C = 0;
    const isLR = dir === 'left' || dir === 'right';
    
    if (dir) {
      const alignBias = isAligned(searchOrigin, candidateRect, dir) ? Math.min(intersectionRect[isLR ? 'height' : 'width'] / searchOrigin[isLR ? 'height' : 'width'], 1) : 0;
      const orthogonalBias = alignBias > 0 ? 0 : searchOrigin[isLR ? 'height' : 'width'] / 2;
      B = ((isLR ? P2 : P1) + orthogonalBias) * (isLR ? 30 : 2);
      C = 5.0 * alignBias;
    }
    return A + B - C - D;
  }

  function getEuclideanDistance(rect1, rect2, dir) {
    const points = getEntryAndExitPoints(dir, rect1, rect2);
    const x = points.entryPoint.x - points.exitPoint.x;
    const y = points.entryPoint.y - points.exitPoint.y;
    return Math.sqrt((x * x) + (y * y));
  }

  function getAbsoluteDistance(rect1, rect2, dir) {
    const points = getEntryAndExitPoints(dir, rect1, rect2);
    return (dir === 'left' || dir === 'right') ? Math.abs(points.entryPoint.x - points.exitPoint.x) : Math.abs(points.entryPoint.y - points.exitPoint.y);
  }

  function getEntryAndExitPoints(dir = 'down', searchOrigin, candidateRect) {
    const points = { entryPoint: { x: 0, y: 0 }, exitPoint: { x: 0, y: 0 } };
    
    if (startingPoint) {
      points.exitPoint = searchOrigin;
      if (dir === 'left') points.entryPoint.x = candidateRect.right;
      else if (dir === 'right') points.entryPoint.x = candidateRect.left;
      else if (dir === 'up') points.entryPoint.y = candidateRect.bottom;
      else if (dir === 'down') points.entryPoint.y = candidateRect.top;

      if (dir === 'left' || dir === 'right') {
        points.entryPoint.y = Math.max(candidateRect.top, Math.min(startingPoint.y, candidateRect.bottom));
      } else {
        points.entryPoint.x = Math.max(candidateRect.left, Math.min(startingPoint.x, candidateRect.right));
      }
    } else {
      if (dir === 'left') { points.exitPoint.x = searchOrigin.left; points.entryPoint.x = Math.min(candidateRect.right, searchOrigin.left); }
      else if (dir === 'right') { points.exitPoint.x = searchOrigin.right; points.entryPoint.x = Math.max(candidateRect.left, searchOrigin.right); }
      else if (dir === 'up') { points.exitPoint.y = searchOrigin.top; points.entryPoint.y = Math.min(candidateRect.bottom, searchOrigin.top); }
      else if (dir === 'down') { points.exitPoint.y = searchOrigin.bottom; points.entryPoint.y = Math.max(candidateRect.top, searchOrigin.bottom); }

      if (dir === 'left' || dir === 'right') {
        if (isBelow(searchOrigin, candidateRect)) { points.exitPoint.y = searchOrigin.top; points.entryPoint.y = Math.min(candidateRect.bottom, searchOrigin.top); }
        else if (isBelow(candidateRect, searchOrigin)) { points.exitPoint.y = searchOrigin.bottom; points.entryPoint.y = Math.max(candidateRect.top, searchOrigin.bottom); }
        else { points.exitPoint.y = points.entryPoint.y = Math.max(searchOrigin.top, candidateRect.top); }
      } else {
        if (isRightSide(searchOrigin, candidateRect)) { points.exitPoint.x = searchOrigin.left; points.entryPoint.x = Math.min(candidateRect.right, searchOrigin.left); }
        else if (isRightSide(candidateRect, searchOrigin)) { points.exitPoint.x = searchOrigin.right; points.entryPoint.x = Math.max(candidateRect.left, searchOrigin.right); }
        else { points.exitPoint.x = points.entryPoint.x = Math.max(searchOrigin.left, candidateRect.left); }
      }
    }
    return points;
  }

  function getIntersectionRect(rect1, rect2) {
    const maxLeft = Math.max(rect1.left, rect2.left);
    const maxTop = Math.max(rect1.top, rect2.top);
    const minRight = Math.min(rect1.right, rect2.right);
    const minBottom = Math.min(rect1.bottom, rect2.bottom);

    const width = Math.abs(maxLeft - minRight);
    const height = Math.abs(maxTop - minBottom);
    const area = (maxLeft < minRight && maxTop < minBottom) ? Math.sqrt(width * height) : 0;

    return { width, height, area };
  }

  function handlingEditableElement(e) {
	  const target = document.activeElement;
	  const focusNavigableArrowKey = { left: false, up: false, right: false, down: false };
	  const dir = ARROW_KEY_CODE[e.keyCode];
	  if (!dir) return focusNavigableArrowKey;

	  if (SPINNABLE_INPUT_TYPES.has(target.type) && (dir === 'up' || dir === 'down')) {
		focusNavigableArrowKey[dir] = true;
	  } else if (TEXT_INPUT_TYPES.has(target.type) || target.nodeName === 'TEXTAREA') {
		if (target.selectionStart === target.selectionEnd) {
		  if (target.selectionStart === 0) { focusNavigableArrowKey.left = true; focusNavigableArrowKey.up = true; }
		  if (target.selectionEnd === target.value.length) { focusNavigableArrowKey.right = true; focusNavigableArrowKey.down = true; }
		}
	  } else {
		focusNavigableArrowKey[dir] = true;
	  }
	  return focusNavigableArrowKey;
	}

  function getBoundingClientRect(element) {
    if (!mapOfBoundRect) return element.getBoundingClientRect(); 
    
    let rect = mapOfBoundRect.get(element);
    if (!rect) {
      const r = element.getBoundingClientRect();
      
      rect = {
        top: Number(r.top.toFixed(2)),
        right: Number(r.right.toFixed(2)),
        bottom: Number(r.bottom.toFixed(2)),
        left: Number(r.left.toFixed(2)),
        width: Number(r.width.toFixed(2)),
        height: Number(r.height.toFixed(2))
      };
      mapOfBoundRect.set(element, rect);
    }
    return rect;
  }

  function getOverlappedCandidates(targetElement) {      
    const areas = targetElement.getSpatialNavigationContainer().focusableAreas();
    const result = [];
    for (let i = 0; i < areas.length; i++) {
        if (targetElement !== areas[i] && isEntirelyVisible(areas[i], targetElement)) result.push(areas[i]);
    }
    return result;
  }

  function getExperimentalAPI() {
    function canScroll(container, dir) {
      return (isScrollable(container, dir) && !isScrollBoundary(container, dir)) ||
             (!container.parentElement && !isHTMLScrollBoundary(container, dir));
    }

    function findTarget(findCandidate, element, dir, option) {
      let eventTarget = element;
      if (eventTarget === document || eventTarget === document.documentElement) {
        eventTarget = document.body || document.documentElement;
      }

      if ((isContainer(eventTarget) || eventTarget.nodeName === 'BODY') && eventTarget.nodeName !== 'INPUT') {
        if (eventTarget.nodeName === 'IFRAME') eventTarget = eventTarget.contentDocument.body;
        const candidates = getSpatialNavigationCandidates(eventTarget, option);
        if (candidates?.length > 0) {
          return findCandidate ? getFilteredSpatialNavigationCandidates(eventTarget, dir, candidates) : eventTarget.spatialNavigationSearch(dir, {candidates});
        }
        if (canScroll(eventTarget, dir)) return findCandidate ? [] : eventTarget;
      }

      let container = eventTarget.getSpatialNavigationContainer();
      let parentContainer = container.parentElement ? container.getSpatialNavigationContainer() : null;
      if (!parentContainer && window.location !== window.parent.location) {
        parentContainer = window.parent.document.documentElement;
      }

      while (parentContainer) {
        const candidates = filteredCandidates(eventTarget, getSpatialNavigationCandidates(container, option), dir, container);
        if (candidates?.length > 0) {
          const bestNextTarget = eventTarget.spatialNavigationSearch(dir, {candidates, container});
          if (bestNextTarget) return findCandidate ? candidates : bestNextTarget;
        } else if (canScroll(container, dir)) {
          return findCandidate ? [] : eventTarget;
        } else if (container === document || container === document.documentElement) {
          container = window.document.documentElement;
          if (window.location !== window.parent.location) {
            eventTarget = window.frameElement;
            container = window.parent.document.documentElement;
            parentContainer = container.parentElement ? container.getSpatialNavigationContainer() : null;
            if (!parentContainer) break;
          }
        } else {
          if (isFocusable(container)) eventTarget = container;
          container = parentContainer;
          parentContainer = container.parentElement ? container.getSpatialNavigationContainer() : null;
          if (!parentContainer) break;
        }
      }

      if (!parentContainer && container) {
        const candidates = filteredCandidates(eventTarget, getSpatialNavigationCandidates(container, option), dir, container);
        if (candidates?.length > 0) {
          const bestNextTarget = eventTarget.spatialNavigationSearch(dir, {candidates, container});
          if (bestNextTarget) return findCandidate ? candidates : bestNextTarget;
        }
      }

      if (canScroll(container, dir)) return eventTarget;
    }

    return {
      isContainer,
      isScrollContainer,
      isVisibleInScroller,
      findCandidates: (element, dir, option) => findTarget(true, element, dir, option),
      findNextTarget: (element, dir, option) => findTarget(false, element, dir, option),
      getDistanceFromTarget: (element, candidateElement, dir) => {
        if ((isContainer(element) || element.nodeName === 'BODY') && element.nodeName !== 'INPUT') {
          const candidates = getSpatialNavigationCandidates(element);
          if (candidates.indexOf(candidateElement) !== -1) {
            return getInnerDistance(getBoundingClientRect(element), getBoundingClientRect(candidateElement), dir);
          }
        }
        return getDistance(getBoundingClientRect(element), getBoundingClientRect(candidateElement), dir);
      }
    };
  }

  function getInitialAPIs() {
    return {
      enableExperimentalAPIs,
      get keyMode() { return this._keymode ? this._keymode : 'ARROW'; },
      set keyMode(mode) { this._keymode = (['SHIFTARROW', 'ARROW', 'NONE'].includes(mode)) ? mode : 'ARROW'; },
      setStartingPoint: function (x, y) { startingPoint = (x && y) ? { x, y } : null; }
    };
  }

  function enableExperimentalAPIs(option) {
    const currentKeyMode = window.__spatialNavigation__?.keyMode;
    window.__spatialNavigation__ = (option === false) ? getInitialAPIs() : Object.assign(getInitialAPIs(), getExperimentalAPI());
    window.__spatialNavigation__.keyMode = currentKeyMode;
    Object.seal(window.__spatialNavigation__);
  }

  initiateSpatialNavigation();
  enableExperimentalAPIs(false);
  
  window.addEventListener('load', spatialNavigationHandler);
})();

export {};