/* src/yt-fixes.js */
import { configRead } from './config.js';

let historyCache = false;
let signInObserver = null;

export function initYouTubeFixes() {
    console.log('[YT-Fixes] Initializing...');
    initSignInPromptFix();
    initSearchHistoryFix();
}

function initSearchHistoryFix() {
    if (attemptSearchHistoryFix()) return; 

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

function attemptSearchHistoryFix() {
    if (historyCache) return true;
    const suggestionsBox = document.querySelector('ytlr-search-suggestions');
    if (!suggestionsBox) return false;

    if (suggestionsBox.childElementCount > 0) {
        historyCache = true;
        return true;
    }

    if (!suggestionsBox.dataset.historyFixed) {
        const injected = populateSearchHistory(suggestionsBox);
        if (injected) {
            historyCache = true;
            return true;
        } else {
            // If storage is empty, we stop trying to inject
            historyCache = true; 
            return true;
        }
    }
    return true; 
}

function populateSearchHistory(container) {
    const storageKey = 'yt.leanback.default.search-history::recent-searches';
    const rawData = window.localStorage.getItem(storageKey);
    if (!rawData) return false;

    try {
        const parsed = JSON.parse(rawData);
        const historyData = parsed.data;
        if (!historyData || !Array.isArray(historyData) || historyData.length === 0) return false;

        container.dataset.historyFixed = 'true';
        // ... (Styles same as original)
        container.style.cssText = `display: flex; flex-direction: column; width: 30rem; position: absolute; left: 6.5rem; top: 7.25rem; height: auto; padding: 1rem; box-sizing: border-box; background-color: transparent; z-index: 999;`;

        historyData.slice(0, 8).forEach(item => {
            const searchTerm = item[0];
            const row = document.createElement('div');
            row.className = 'injected-history-item';
            row.setAttribute('tabindex', '0');
            row.setAttribute('role', 'button');
            row.style.cssText = `display: flex; align-items: center; padding: 0.8rem 1rem; margin-bottom: 0.5rem; background-color: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer; color: #f1f1f1; font-family: Roboto, sans-serif; font-size: 1.4rem; transition: background-color 0.2s;`;
            row.innerHTML = `<span style="margin-right: 1rem; opacity: 0.7;">↺</span><span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${searchTerm}</span>`;
            
            row.addEventListener('click', () => {
                window.location.hash = `#/results?search_query=${encodeURIComponent(searchTerm)}`;
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') row.click();
            });

            container.appendChild(row);
        });
        return true;
    } catch (e) {
        return false;
    }
}

function initSignInPromptFix() {
    if (signInObserver) {
        // Manually trigger check if config changed
        checkAndFixPrompts();
        return;
    }

    const observer = new MutationObserver((mutations) => {
        let shouldScan = false;
        for (const m of mutations) {
            // Optimization: Only scan if nodes were added
            if (m.addedNodes.length > 0) {
                shouldScan = true;
                break;
            }
        }
        if (shouldScan) checkAndFixPrompts();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    signInObserver = observer;
    checkAndFixPrompts();
}

// Extracted to standalone function for reuse/throttling
function checkAndFixPrompts() {
    if (!configRead('hideGuestSignInPrompts')) return;
    
    // Select all potential prompts that haven't been fixed yet
    const prompts = document.querySelectorAll('ytlr-alert-with-actions-renderer:not([data-yt-fix-applied="true"])');
    prompts.forEach(prompt => {
        if (prompt.textContent.includes('Sign in to subscribe')) {
            applyFixToPrompt(prompt);
        }
    });
}

function applyFixToPrompt(element) {
    if (element.dataset.ytFixApplied) return;
    
    let listItem = element.closest('.ytVirtualListItem') || 
                   element.closest('.TXB27d') || 
                   element.closest('div[style*="position: absolute"]');

    if (!listItem || !listItem.parentElement) return;

    let heightToRemoveRem = 5.125;
    const heightMatch = listItem.style.height.match(/([\d.]+)rem/);
    if (heightMatch) heightToRemoveRem = parseFloat(heightMatch[1]);

    element.removeAttribute('hybridnavfocusable');
    element.removeAttribute('tabindex');
    element.setAttribute('aria-hidden', 'true');
    
    element.querySelectorAll('[hybridnavfocusable], [tabindex], button, ytlr-button').forEach(btn => {
        btn.removeAttribute('hybridnavfocusable');
        btn.setAttribute('tabindex', '-1');
        btn.style.display = 'none';
    });

    element.style.display = 'none';
    listItem.style.height = '0rem';
    listItem.style.visibility = 'hidden';
    listItem.style.pointerEvents = 'none';
    
    element.dataset.ytFixApplied = 'true';
    listItem.dataset.ytFixCollapsed = 'true';

    applyShiftToContainer(listItem.parentElement, heightToRemoveRem);
}

function applyShiftToContainer(container, shiftAmountRem) {
    if (container.dataset.ytShiftObserverAttached) {
         // Even if observer is attached, we might need to shift existing items
         // that were added before the prompt was detected
         container.querySelectorAll('.ytVirtualListItem, .TXB27d').forEach(node => shiftNodeUp(node, shiftAmountRem));
         return;
    }

    const currentItems = container.querySelectorAll('.ytVirtualListItem, .TXB27d');
    currentItems.forEach(node => shiftNodeUp(node, shiftAmountRem));

    const shiftObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && (node.classList.contains('ytVirtualListItem') || node.classList.contains('TXB27d'))) {
                    shiftNodeUp(node, shiftAmountRem);
                }
            });
        });
    });
    
    shiftObserver.observe(container, { childList: true });
    container.dataset.ytShiftObserverAttached = 'true';
}

function shiftNodeUp(node, amountRem) {
    if (node.dataset.ytFixCollapsed || node.dataset.ytShiftApplied) return;

    const transform = node.style.transform;
    const match = transform.match(/translateY\(([\d.-]+)rem\)/i);
    
    if (match) {
        const newY = parseFloat(match[1]) - amountRem;
        node.style.setProperty('transform', `translateY(${newY}rem) translateZ(0px)`, 'important');
        node.style.transition = 'none';
        node.dataset.ytShiftApplied = 'true';
    }
}