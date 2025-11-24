// yt-fixes.js
// Fixes miscellaneous YouTube UI annoyances on webOS

export function initYouTubeFixes() {
    console.log('[YT-Fixes] Initializing...');
    
    // Watch for the Sign-In Prompt
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    // Check the node itself
                    if (isSignInPrompt(node)) {
                        applyFixToPrompt(node);
                    }
                    // Check children (in case a whole page loaded at once)
                    if (node.querySelectorAll) {
                        const prompts = node.querySelectorAll('ytlr-alert-with-actions-renderer');
                        prompts.forEach(prompt => {
                            if (isSignInPrompt(prompt)) applyFixToPrompt(prompt);
                        });
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial check
    document.querySelectorAll('ytlr-alert-with-actions-renderer').forEach(prompt => {
        if (isSignInPrompt(prompt)) applyFixToPrompt(prompt);
    });
}

function isSignInPrompt(element) {
    if (!element || !element.matches || !element.matches('ytlr-alert-with-actions-renderer')) return false;
    // Covers "Sign in to subscribe" and "Sign in to subscribe to this channel."
    return element.textContent.includes('Sign in to subscribe');
}

function applyFixToPrompt(element) {
    if (element.dataset.ytFixApplied) return;

    console.log('[YT-Fixes] Found "Sign in" prompt. applying fixes...');

    // 1. Find the Wrapper (List Item)
    // Try the standard class first, then fallback to WebOS 25/New UI class (.TXB27d)
    let listItem = element.closest('.ytVirtualListItem');
    if (!listItem) {
        listItem = element.closest('.TXB27d');
    }

    if (!listItem) {
        // Last resort: look for the nearest absolute positioned div if classes changed again
        const genericParent = element.closest('div[style*="position: absolute"]');
        if (genericParent) listItem = genericParent;
        else return; 
    }

    const listContainer = listItem.parentElement;
    if (!listContainer) return;

    // 2. Calculate how much space to remove
    let heightToRemoveRem = 5.125; // Default fallback
    const heightMatch = listItem.style.height.match(/([\d.]+)rem/);
    if (heightMatch) {
        heightToRemoveRem = parseFloat(heightMatch[1]);
    }

    // 3. NUKE FOCUS (Fixes the "Ghost Focus" issue)
    // We remove every attribute that tells the TV "I am clickable"
    element.removeAttribute('hybridnavfocusable');
    element.removeAttribute('tabindex');
    element.setAttribute('aria-hidden', 'true');
    
    // Drill down and disable the button inside too
    const buttons = element.querySelectorAll('[hybridnavfocusable], [tabindex], button, ytlr-button');
    buttons.forEach(btn => {
        btn.removeAttribute('hybridnavfocusable');
        btn.setAttribute('tabindex', '-1');
        btn.style.display = 'none'; // Visually hide button specifically
    });

    // 4. Hide Visuals
    element.style.display = 'none';
    
    // 5. Collapse Wrapper
    listItem.style.height = '0rem';
    listItem.style.visibility = 'hidden';
    listItem.style.pointerEvents = 'none'; // Ensures mouse/pointer can't hit it
    
    // Mark as fixed
    element.dataset.ytFixApplied = 'true';
    listItem.dataset.ytFixCollapsed = 'true'; // Marker to skip shifting this one

    // 6. Shift Siblings Up (Fixes the "Empty Space" issue)
    applyShiftToContainer(listContainer, heightToRemoveRem);
}

function applyShiftToContainer(container, shiftAmountRem) {
    // A. Shift all CURRENT items immediately
    // Query both old class and New UI class
    const currentItems = container.querySelectorAll('.ytVirtualListItem, .TXB27d');
    currentItems.forEach(node => shiftNodeUp(node, shiftAmountRem));

    // B. Watch for NEW items (scrolling down) and shift them too
    if (container.dataset.ytShiftObserverAttached) return;
    
    const shiftObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    // Check if it is a list item (Old Class OR New Class)
                    const isListItem = node.classList.contains('ytVirtualListItem') || 
                                     node.classList.contains('TXB27d');
                    
                    if (isListItem) {
                        shiftNodeUp(node, shiftAmountRem);
                    }
                }
            });
        });
    });
    
    shiftObserver.observe(container, { childList: true });
    container.dataset.ytShiftObserverAttached = 'true';
}

function shiftNodeUp(node, amountRem) {
    // Don't shift the prompt itself (which is already collapsed)
    if (node.dataset.ytFixCollapsed) return;
    
    // Don't double-shift
    if (node.dataset.ytShiftApplied) return;

    const transform = node.style.transform;
    const match = transform.match(/translateY\(([\d.-]+)rem\)/i);
    
    if (match) {
        const currentY = parseFloat(match[1]);
        
        // If the item is at 0, it's the first item. 
        // If we shift it to negative, it goes off screen. 
        // But since the prompt was at 0 and we hid it, the item at 5.125 needs to go to 0.
        
        const newY = currentY - amountRem;
        
        // Apply with !important to prevent YouTube from overwriting it immediately
        node.style.setProperty('transform', `translateY(${newY}rem) translateZ(0px)`, 'important');
        node.style.transition = 'none'; // Disable animation so it snaps instantly
        
        node.dataset.ytShiftApplied = 'true';
        
        // Debug log to verify it's working
        // console.log(`[YT-Fixes] Shifted item from ${currentY} to ${newY}`);
    }
}