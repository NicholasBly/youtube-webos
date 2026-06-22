// src/perf_mon.js

class PerfMonitor {
    constructor() {
        this.stats = {
            fps: 0,
            longTasks: [],
            slowRequests: [],
            domNodes: 0,
        };
        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        this.uiElement = null;
        this.mutationStats = {};

        // Delay initialization slightly to let the DOM settle
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this.init();
        } else {
            document.addEventListener('DOMContentLoaded', () => this.init());
        }
    }

    init() {
        this.initUI();
        this.interceptMutationObserver();
        this.startTracking();
    }

    initUI() {
        if (document.getElementById('webos-perf-mon')) return;

        this.uiElement = document.createElement('div');
        this.uiElement.id = 'webos-perf-mon';
        Object.assign(this.uiElement.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '400px',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: '#00ff00',
            fontFamily: 'monospace',
            fontSize: '12px',
            zIndex: '9999999',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #00ff00',
            pointerEvents: 'none', // Lets clicks pass through to YouTube
            lineHeight: '1.5',
            boxShadow: '0px 0px 15px rgba(0,0,0,0.5)'
        });
        
        document.body.appendChild(this.uiElement);
        setInterval(() => this.updateUI(), 1000); // Update OSD every second
    }

    startTracking() {
        // 1. Track FPS
        const loop = () => {
            this.frameCount++;
            const now = performance.now();
            if (now - this.lastFpsTime >= 1000) {
                this.stats.fps = this.frameCount;
                this.frameCount = 0;
                this.lastFpsTime = now;
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);

        // 2. Track CPU Spikes / Main Thread Blocks (Long Tasks API)
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    let source = 'Unknown Script';
                    if (entry.attribution && entry.attribution.length > 0) {
                        source = entry.attribution[0].name || entry.attribution[0].containerType;
                    }
                    this.stats.longTasks.push({
                        duration: entry.duration.toFixed(1),
                        name: entry.name,
                        source: source,
                        time: new Date().toLocaleTimeString()
                    });
                    
                    // Keep the top 5 worst offenders (longest duration)
                    this.stats.longTasks.sort((a, b) => parseFloat(b.duration) - parseFloat(a.duration));
                    if (this.stats.longTasks.length > 5) this.stats.longTasks.pop();
                }
            });
            observer.observe({ type: 'longtask', buffered: true });
        } catch (e) {
            console.warn('[PerfMon] Long Task API not supported on this webOS version.');
        }

        // 3. Track Slow Resource Loads (>500ms)
        try {
            const resObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.duration > 500 && !entry.name.includes('generate_204')) { 
                        const urlObj = new URL(entry.name, location.origin);
                        this.stats.slowRequests.push({
                            duration: entry.duration.toFixed(1),
                            file: (urlObj.pathname.split('/').pop() || urlObj.hostname).substring(0, 30)
                        });
                        this.stats.slowRequests.sort((a, b) => parseFloat(b.duration) - parseFloat(a.duration));
                        if (this.stats.slowRequests.length > 4) this.stats.slowRequests.pop();
                    }
                }
            });
            resObserver.observe({ type: 'resource', buffered: true });
        } catch(e) {}
    }

    // 4. Intercept and profile MutationObservers (Huge performance drainer)
    interceptMutationObserver() {
        const OrigObserver = window.MutationObserver;
        const self = this;

        window.MutationObserver = function(callback) {
            // Get a snippet of the stack trace to identify WHICH script created this observer
            const stack = (new Error().stack || '').split('\n');
            const callerInfo = stack.length > 2 ? stack[2].trim().replace(/^at\s+/i, '') : 'Unknown Origin';

            const wrappedCallback = function(mutations, observer) {
                const start = performance.now();
                callback(mutations, observer); // Run the actual observer
                const duration = performance.now() - start;

                if (!self.mutationStats[callerInfo]) {
                    self.mutationStats[callerInfo] = { count: 0, totalTime: 0 };
                }
                self.mutationStats[callerInfo].count += mutations.length;
                self.mutationStats[callerInfo].totalTime += duration;
            };
            return new OrigObserver(wrappedCallback);
        };
    }

    getWorstMutations() {
        const entries = Object.entries(this.mutationStats).map(([caller, stats]) => {
            return { caller: caller, ...stats };
        });
        // Sort by total time hogged by the CPU
        entries.sort((a, b) => b.totalTime - a.totalTime);
        return entries.slice(0, 3);
    }

    updateUI() {
        if (!this.uiElement) return;
        this.stats.domNodes = document.querySelectorAll('*').length;

        // 1. Safely clear the UI without innerHTML
        this.uiElement.textContent = '';

        // 2. Helper functions to build DOM elements natively
        const createSpan = (text, color = null, bold = false) => {
            const el = document.createElement('span');
            el.textContent = text;
            if (color) el.style.color = color;
            if (bold) el.style.fontWeight = 'bold';
            return el;
        };
        const addEl = (el) => this.uiElement.appendChild(el);
        const addBr = () => this.uiElement.appendChild(document.createElement('br'));

        // --- General Health ---
        const header = createSpan('🛠️ webOS YT Perf Monitor', 'white', true);
        header.style.fontSize = '14px';
        header.style.textDecoration = 'underline';
        addEl(header);
        addBr(); addBr();

        const fpsColor = this.stats.fps < 30 ? '#ff4444' : '#00ff00';
        const domColor = this.stats.domNodes > 6000 ? '#ffaa00' : '#00ff00';
        
        addEl(createSpan('FPS: '));
        addEl(createSpan(this.stats.fps, fpsColor, true));
        addEl(createSpan(' | DOM Nodes: '));
        addEl(createSpan(this.stats.domNodes, domColor, true));
        addBr(); addBr();

        // --- CPU / Main Thread Blocks ---
        addEl(createSpan('🛑 Worst CPU Spikes (Long Tasks)', '#ffaa00', true));
        addBr();
        if (this.stats.longTasks.length === 0) {
            addEl(createSpan('  - Tracking...', 'gray'));
            addBr();
        } else {
            this.stats.longTasks.forEach(t => {
                addEl(createSpan('  - '));
                addEl(createSpan(`${t.duration}ms`, null, true));
                addEl(createSpan(` | ${t.name === 'self' ? 'Main Script' : t.name}`));
                addBr();
            });
        }
        addBr();

        // --- Heavy Mutations ---
        addEl(createSpan('🧬 Heaviest Mutation Observers', '#00e5ff', true));
        addBr();
        const worstMutations = this.getWorstMutations();
        if (worstMutations.length === 0) {
            addEl(createSpan('  - Tracking...', 'gray'));
            addBr();
        } else {
            worstMutations.forEach(m => {
                let shortCaller = m.caller.split('/').pop().substring(0, 45) + '...';
                
                addEl(createSpan('  - '));
                addEl(createSpan(`${m.totalTime.toFixed(1)}ms`, null, true));
                addEl(createSpan(` CPU time (${m.count} muts)`));
                addBr();
                
                const callerSpan = createSpan(`    ${shortCaller}`, 'gray');
                callerSpan.style.fontSize = '10px';
                addEl(callerSpan);
                addBr();
            });
        }
        addBr();

        // --- Slow Resources ---
        addEl(createSpan('🐌 Slowest Network/Loading', '#ffff00', true));
        addBr();
        if (this.stats.slowRequests.length === 0) {
            addEl(createSpan('  - Tracking...', 'gray'));
            addBr();
        } else {
            this.stats.slowRequests.forEach(r => {
                addEl(createSpan('  - '));
                addEl(createSpan(`${r.duration}ms`, null, true));
                addEl(createSpan(` | ${r.file}`));
                addBr();
            });
        }
    }
}

// Inject singleton
if (!window.__webosPerfMon) {
    window.__webosPerfMon = new PerfMonitor();
}