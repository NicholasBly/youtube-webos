/* Modern Spatial Navigation Polyfill (Target: Chrome 87+)
 * Optimized for webOS 22/25 & modern environments.
 */
(function () {
  if ('navigate' in window) return;

  const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  const TAB_KEY_CODE = 9;
  const SPINNABLE_INPUT_TYPES = new Set(['email', 'date', 'month', 'number', 'time', 'week']);
  const TEXT_INPUT_TYPES = new Set(['password', 'text', 'search', 'tel', 'url', null]);
  
  // Use a WeakMap for modern garbage collection of temporary DOMRect caching during a navigation frame
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
  });

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
      // Modern optional chaining
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
          // Initialize caches for this specific frame/keypress
          mapOfBoundRect = new WeakMap();
          mapOfComputedStyle = new WeakMap(); 
          
          navigate(dir);
          
          // Garbage collect immediately after the navigation frame is done
          mapOfBoundRect = null;
          mapOfComputedStyle = null; 
          startingPoint = null;
        }
      }
    });

    document.addEventListener('mouseup', (e) => startingPoint = { x: e.clientX, y: e.clientY });

    window.addEventListener('focusin', (e) => {
      if (e.target !== window) {
        savedSearchOrigin.element = e.target;
        savedSearchOrigin.rect = e.target.getBoundingClientRect();
      }
    });
  }
  
  function getCachedComputedStyle(element) {
    let style = mapOfComputedStyle?.get(element);
    if (!style) {
      style = window.getComputedStyle(element);
      mapOfComputedStyle?.set(element, style);
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
      bestCandidate.focus({ preventScroll: container !== window && getCSSSpatNavAction(container) !== 'focus' });
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

  /* Modified to use native Element.scrollBy() and increased base offset to 250px */
  function moveScroll(element, dir, offset = 0) {
    if (!element) return;
    
    const scrollY = (viewportHeight * 0.3) + offset; 
    const scrollX = (viewportWidth * 0.15) + offset; 

    switch (dir) {
      case 'left': element.scrollBy({ left: -scrollX }); break;
      case 'right': element.scrollBy({ left: scrollX }); break;
      case 'up': element.scrollBy({ top: -scrollY }); break;
      case 'down': element.scrollBy({ top: scrollY }); break;
    }
  }

  function getSpatialNavigationCandidates(container, option = { mode: 'visible' }) {
    let candidates = [];
    if (container.childElementCount > 0) {
      if (!container.parentElement) container = container.querySelector('body') ?? document.body;
      for (const elem of container.children) {
        if (isDelegableContainer(elem)) {
          candidates.push(elem);
        } else if (isFocusable(elem)) {
          candidates.push(elem);
          if (!isContainer(elem) && elem.childElementCount) candidates.push(...getSpatialNavigationCandidates(elem, { mode: 'all' }));
        } else if (elem.childElementCount) {
          candidates.push(...getSpatialNavigationCandidates(elem, { mode: 'all' }));
        }
      }
    }
    return option.mode === 'all' ? candidates : candidates.filter(isVisible);
  }

  function getFilteredSpatialNavigationCandidates(element, dir, candidates, container) {
    const targetElement = element;
    container = container || targetElement.getSpatialNavigationContainer();
    candidates = (!candidates || candidates.length <= 0) ? getSpatialNavigationCandidates(container) : candidates;
    return filteredCandidates(targetElement, candidates, dir, container);
  }

  function spatialNavigationSearch(dir, args = {}) {
    const targetElement = this;
    const defaultContainer = targetElement.getSpatialNavigationContainer();
    let defaultCandidates = getSpatialNavigationCandidates(defaultContainer);
    const container = args.container || defaultContainer;
    
    if (args.container && defaultContainer.contains(args.container)) {
      defaultCandidates.push(...getSpatialNavigationCandidates(container));
    }
    
    const candidates = args.candidates?.length ? 
      args.candidates.filter(c => container.contains(c)) : 
      defaultCandidates.filter(c => container.contains(c) && container !== c);

    if (!candidates?.length) return null;

    let internalCandidates = [];
    let externalCandidates = [];
    let insideOverlappedCandidates = getOverlappedCandidates(targetElement);

    candidates.forEach(candidate => {
      if (candidate !== targetElement) {
        (targetElement.contains(candidate) ? internalCandidates : externalCandidates).push(candidate);
      }
    });

    const internalSet = new Set(internalCandidates);
    
    let fullyOverlapped = insideOverlappedCandidates.filter(c => !internalSet.has(c));
    let overlappedContainer = candidates.filter(c => isContainer(c) && isEntirelyVisible(targetElement, c));
    let overlappedByParent = overlappedContainer.flatMap(elm => elm.focusableAreas()).filter(c => c !== targetElement);
    
    internalCandidates = [...internalCandidates, ...fullyOverlapped].filter(c => container.contains(c));
    externalCandidates = [...externalCandidates, ...overlappedByParent].filter(c => container.contains(c));

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
    
    return candidates.filter(candidate => {
      if (!container.contains(candidate) || candidate === currentElm) return false;
      const candidateRect = getBoundingClientRect(candidate);
      if (isCurrentContainer) {
        return (currentElm.contains(candidate) && isInside(eventTargetRect, candidateRect)) || isOutside(candidateRect, eventTargetRect, dir);
      } else {
        const candidateBody = candidate.nodeName === 'IFRAME' ? candidate.contentDocument.body : null;
        return candidateBody !== currentElm && isOutside(candidateRect, eventTargetRect, dir) && !isInside(eventTargetRect, candidateRect);
      }
    });
  }

  function selectBestCandidate(currentElm, candidates, dir) {
    const container = currentElm.getSpatialNavigationContainer();
    const isGrid = getCachedComputedStyle(container).getPropertyValue('--spatial-navigation-function').trim() === 'grid';
    const currentTargetRect = searchOriginRect || getBoundingClientRect(currentElm);

    if (isGrid) {
      const aligned = candidates.filter(elm => isAligned(currentTargetRect, getBoundingClientRect(elm), dir));
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
      eventTargetRect = window.frameElement.getBoundingClientRect();
      eventTargetRect.x = 0;
      eventTargetRect.y = 0;
    } else {
      eventTargetRect = searchOriginRect || currentElm.getBoundingClientRect();
    }

    let minDistance = Number.POSITIVE_INFINITY;
    let minDistanceElements = [];

    candidates?.forEach(candidate => {
      const distance = distanceFunction(eventTargetRect, getBoundingClientRect(candidate), dir);
      if (distance < minDistance) {
        minDistance = distance;
        minDistanceElements = [candidate];
      } else if (distance === minDistance) {
        minDistanceElements.push(candidate);
      }
    });

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

  function focusableAreas(option = { mode: 'visible' }) {
    const container = this.parentElement ? this : document.body;
    // Modern spread operator instead of filter.call
    const focusables = [...container.querySelectorAll('*')].filter(isFocusable);
    return option.mode === 'all' ? focusables : focusables.filter(isVisible);
  }

  function createSpatNavEvents(eventType, containerElement, currentElement, direction) {
    if (['beforefocus', 'notarget'].includes(eventType)) {
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
    if (getCSSSpatNavAction(container) === 'auto' && option === 'visible') {
      if (scrollingController(container, dir)) return;
    }
  }

  function findSearchOrigin() {
    let searchOrigin = document.activeElement;
    if (!searchOrigin || (searchOrigin === document.body && !document.querySelector(':focus'))) {
      if (savedSearchOrigin.element && searchOrigin !== savedSearchOrigin.element) {
        const style = window.getCachedComputedStyle(savedSearchOrigin.element);
        if (savedSearchOrigin.element.disabled || ['hidden', 'collapse'].includes(style.visibility)) return savedSearchOrigin.element;
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
    const overflowX = style.overflowX;
    const overflowY = style.overflowY;
    return (overflowX !== 'visible' && overflowX !== 'clip' && isOverflow(element, 'left')) ||
           (overflowY !== 'visible' && overflowY !== 'clip' && isOverflow(element, 'down'));
  }

  function isScrollable(element, dir) {
    if (!element || typeof element !== 'object') return false;
    if (dir) {
      if (isOverflow(element, dir)) {
        const style = getCachedComputedStyle(element);
        const { overflowX, overflowY } = style;
        if (dir === 'left' || dir === 'right') return overflowX !== 'visible' && overflowX !== 'clip' && overflowX !== 'hidden';
        if (dir === 'up' || dir === 'down') return overflowY !== 'visible' && overflowY !== 'clip' && overflowY !== 'hidden';
      }
      return false;
    }
    return ['HTML', 'BODY'].includes(element.nodeName) || (isScrollContainer(element) && isOverflow(element));
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
      case 'left': return element.scrollLeft === 0;
      case 'right': return (element.scrollWidth - element.scrollLeft - element.clientWidth) === 0;
      case 'up': return element.scrollTop === 0;
      case 'down': return (element.scrollHeight - element.scrollTop - element.clientHeight) === 0;
    }
    return false;
  }

  function isScrollBoundary(element, dir) {
    if (isScrollable(element, dir)) {
      switch (dir) {
        case 'left': return element.scrollLeft === 0;
        case 'right': return Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)) <= 1;
        case 'up': return element.scrollTop === 0;
        case 'down': return Math.abs(element.scrollTop - (element.scrollHeight - element.clientHeight)) <= 1;
      }
    }
    return false;
  }

  function isVisibleInScroller(element) {
    const elementRect = element.getBoundingClientRect();
    const scroller = getScrollContainer(element);
    const scrollerRect = scroller !== window ? getBoundingClientRect(scroller) : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
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
    return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTGROUP', 'OPTION', 'FIELDSET'].includes(element.tagName) && element.disabled;
  }

  function isExpresslyInert(element) {
    return element.inert && !element.ownerDocument.documentElement.inert;
  }

  function isBeingRendered(element) {
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
    return style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility);
  }

  function hitTest(element) {
    const rect = getBoundingClientRect(element);
    const docElm = element.ownerDocument.documentElement;
    if (element.nodeName !== 'IFRAME' && (rect.top < 0 || rect.left < 0 || rect.top > docElm.clientHeight || rect.left > docElm.clientWidth)) return false;

    const offsetX = (element.offsetWidth / 10 | 0) || 1;
    const offsetY = (element.offsetHeight / 10 | 0) || 1;

    const points = [
      [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2],
      [rect.left + offsetX, rect.top + offsetY],
      [rect.right - offsetX, rect.bottom - offsetY]
    ];

    for (const [x, y] of points) {
      const elemFromPoint = element.ownerDocument.elementFromPoint(x, y);
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

  function getDistanceFromPoint(point, element, dir) {
    const points = getEntryAndExitPoints(dir, startingPoint, element);
    return Math.hypot(points.entryPoint.x - points.exitPoint.x, points.entryPoint.y - points.exitPoint.y);
  }

  function getInnerDistance(rect1, rect2, dir) {
    const edge = { left: 'right', right: 'left', up: 'bottom', down: 'top' }[dir];
    return Math.abs(rect1[edge] - rect2[edge]);
  }

  function getDistance(searchOrigin, candidateRect, dir) {
    const points = getEntryAndExitPoints(dir, searchOrigin, candidateRect);
    const P1 = Math.abs(points.entryPoint.x - points.exitPoint.x);
    const P2 = Math.abs(points.entryPoint.y - points.exitPoint.y);
    const A = Math.hypot(P1, P2);
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
    return Math.hypot(points.entryPoint.x - points.exitPoint.x, points.entryPoint.y - points.exitPoint.y);
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
    const intersection = { width: 0, height: 0, area: 0 };
    const maxLeft = Math.max(rect1.left, rect2.left);
    const maxTop = Math.max(rect1.top, rect2.top);
    const minRight = Math.min(rect1.right, rect2.right);
    const minBottom = Math.min(rect1.bottom, rect2.bottom);

    intersection.width = Math.abs(maxLeft - minRight);
    intersection.height = Math.abs(maxTop - minBottom);

    if (maxLeft < minRight && maxTop < minBottom) intersection.area = Math.sqrt(intersection.width * intersection.height);
    return intersection;
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
    let rect = mapOfBoundRect?.get(element);
    if (!rect) {
      const bound = element.getBoundingClientRect();
      rect = {
        top: bound.top, right: bound.right, bottom: bound.bottom, left: bound.left,
        width: bound.width, height: bound.height
      };
      mapOfBoundRect?.set(element, rect);
    }
    return rect;
  }

  function getOverlappedCandidates(targetElement) {      
    return targetElement.getSpatialNavigationContainer().focusableAreas().filter(el => targetElement !== el && isEntirelyVisible(el, targetElement));
  }

  initiateSpatialNavigation();
  window.__spatialNavigation__ = { keyMode: 'ARROW', setStartingPoint: (x, y) => startingPoint = (x && y) ? { x, y } : null };
  Object.seal(window.__spatialNavigation__);
  
  window.addEventListener('load', spatialNavigationHandler);
})();

export {};