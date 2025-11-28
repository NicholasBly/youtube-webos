// yt-fixes.js
// Fixes miscellaneous YouTube UI annoyances on webOS
import { configRead } from './config.js';

let historyCache = false;
let signInObserver = null;

export function initYouTubeFixes() {
    console.log('[YT-Fixes] Initializing...');
    
    // 1. Sign-In Prompts Fix
    initSignInPromptFix();

    // 2. Search History Fix (New UI Bug)
    initSearchHistoryFix();
}

// --- Search History Fix ---
function initSearchHistoryFix() {
    // 1. Initial Check: The element might already be there!
    // If we fix it here, we don't even need to start the observer.
    if (attemptSearchHistoryFix()) {
        return; 
    }

    // 2. Observer: If not found yet, watch for it to appear.
    // If an observer is already running, we don't need a new one (assuming it works).
    // For simplicity, we just check again. If attemptSearchHistoryFix returns false, 
    // it implies we still need to wait.
    
    const observer = new MutationObserver((mutations, obs) => {
        if (historyCache) {
            obs.disconnect();
            return;
        }
        
        if (attemptSearchHistoryFix()) {
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Tries to find and fix the search history container.
 * Returns true if the issue is resolved (native history found OR custom history injected).
 * Returns false if the container hasn't appeared yet.
 */
function attemptSearchHistoryFix() {
    if (historyCache) return true;

    const suggestionsBox = document.querySelector('ytlr-search-suggestions');
    
    if (!suggestionsBox) {
        return false; // Not found yet, keep observing
    }

    // Case A: YouTube successfully populated the list natively
    if (suggestionsBox.childElementCount > 0) {
        console.log('[YT-Fixes] Native search history detected. Caching.');
        historyCache = true;
        return true;
    }

    // Case B: List is empty, try to inject our own
    if (!suggestionsBox.dataset.historyFixed) {
        const injected = populateSearchHistory(suggestionsBox);
        
        if (injected) {
            console.log('[YT-Fixes] Custom search history injected. Caching.');
            historyCache = true;
            return true;
        }
		else
		{
			console.log('[YT-Fixes] Search history not found in local storage. Exiting...');
			historyCache = true;
            return true;
		}
    }

    return true; 
}

function populateSearchHistory(container) {
    // 1. Read Data from Local Storage
    const storageKey = 'yt.leanback.default.search-history::recent-searches';
    const rawData = window.localStorage.getItem(storageKey);
    
    if (!rawData) return false;

    try {
        const parsed = JSON.parse(rawData);
        // Data format: {"data":[["term", count, timestamp], ...]}
        const historyData = parsed.data;

        if (!historyData || !Array.isArray(historyData) || historyData.length === 0) return false;

        console.log('[YT-Fixes] Found disconnected search history. Injecting...', historyData.length);

        // 2. Prepare Container
        container.dataset.historyFixed = 'true';
        container.style.cssText = `
            display: flex; 
            flex-direction: column; 
            width: 30rem; 
            position: absolute; 
            left: 6.5rem;
            top: 7.25rem;
            height: auto; 
            padding: 1rem; 
            box-sizing: border-box;
            background-color: transparent;
            z-index: 999;
        `;

        // 3. Create List Items
        historyData.slice(0, 8).forEach(item => {
            const searchTerm = item[0];
            
            const row = document.createElement('div');
            row.className = 'injected-history-item';
            row.setAttribute('tabindex', '0'); // Make focusable by TV remote
            row.setAttribute('role', 'button');
            
            // Style mimicking YouTube TV list items
            row.style.cssText = `
                display: flex;
                align-items: center;
                padding: 0.8rem 1rem;
                margin-bottom: 0.5rem;
                background-color: rgba(255,255,255,0.1);
                border-radius: 4px;
                cursor: pointer;
                color: #f1f1f1;
                font-family: Roboto, sans-serif;
                font-size: 1.4rem;
                transition: background-color 0.2s;
            `;

            // Icon
            row.innerHTML = `
                <span style="margin-right: 1rem; opacity: 0.7;">↺</span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${searchTerm}</span>
            `;

            // Hover/Focus Effects
            row.addEventListener('focus', () => row.style.backgroundColor = '#f1f1f1');
            row.addEventListener('focus', () => row.style.color = '#0f0f0f');
            row.addEventListener('blur', () => row.style.backgroundColor = 'rgba(255,255,255,0.1)');
            row.addEventListener('blur', () => row.style.color = '#f1f1f1');

            // Click Action -> Force Navigation
            row.addEventListener('click', () => {
                console.log('[YT-Fixes] History item clicked:', searchTerm);
                // Attempt to navigate directly to results
                window.location.hash = `#/results?search_query=${encodeURIComponent(searchTerm)}`;
            });

            // Enter Key Support for TV Remote
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') row.click();
            });

            container.appendChild(row);
        });

        return true; // Successfully injected

    } catch (e) {
        console.warn('[YT-Fixes] Failed to inject search history', e);
        return false;
    }
}

function initSignInPromptFix() {
    // If observer exists, we can still manually re-check existing nodes
    // to see if config changed and we need to hide them now.
    if (signInObserver) {
        document.querySelectorAll('ytlr-alert-with-actions-renderer').forEach(prompt => {
            if (isSignInPrompt(prompt)) applyFixToPrompt(prompt);
        });
        return;
    }

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
    signInObserver = observer;
    
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
    // RESPECT CONFIG: Only apply if enabled
    if (!configRead('hideGuestSignInPrompts')) return;

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