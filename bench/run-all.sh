#!/bin/bash
# Full verification + benchmark suite. Usage: bench/run-all.sh <label>
cd "$(dirname "$0")/.."
LABEL="${1:-run}"
echo "==================== $LABEL ===================="
npx webpack --mode=production > /tmp/leg.log 2>&1
E=$(grep -c "^ERROR" /tmp/leg.log); [ "$E" != "0" ] && { echo "LEGACY BUILD ERRORS: $E"; grep "^ERROR" /tmp/leg.log | head -5; }
echo "--- polyfill conformance ---";  node bench/polyfill-conformance.cjs 2>&1 | tail -2
echo "--- launcher URL cases ---";    node bench/launch-test.cjs 2>&1 | tail -2
echo "--- bundle smoke (webOS 3) ---"; node bench/smoke.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -2
echo "--- adblock filters (webOS 3) ---"; node bench/adblock-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -2
echo "--- modern build smoke (webOS 23+) ---"
npx webpack --mode=production --env modern > /tmp/mod.log 2>&1
ME=$(grep -c "^ERROR" /tmp/mod.log); [ "$ME" != "0" ] && { echo "MODERN BUILD ERRORS: $ME"; grep "^ERROR" /tmp/mod.log | head -3; }
node bench/modern-smoke.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
npx webpack --mode=production > /dev/null 2>&1   # back to legacy for the rest
echo "--- feature dependencies ---";        node bench/dependency-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- thumbnail / dislike hot paths ---"; node bench/module-hotpath-bench.cjs dist/webOSUserScripts/userScript.js 2>&1 | grep -E "getBoundingClientRect|closest\(\)"
echo "--- thumbnail / dislike behaviour ---";  node bench/module-behaviour-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- options panel build cost ---";   node bench/panel-bench.cjs dist/webOSUserScripts/userScript.js 2>&1 | grep -E "IN the handler|wall time|deferred to"
echo "--- options panel behaviour ---";     node bench/panel-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- spatial nav layout reads ---"; node bench/spatnav-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | grep -E "getBoundingClientRect|getComputedStyle"
echo "--- spatial nav behaviour ---";     node bench/spatnav-correctness.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- emoji observer convergence ---"; node bench/emoji-loop-test.cjs dist/webOSUserScripts/userScript.js 40 2>&1 | tail -1
echo "--- emoji amplification ---";        node bench/emoji-amplify-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- JSON hook perf (webOS 3) ---"; node bench/hook-bench.cjs dist/webOSUserScripts/userScript.js legacy "$LABEL" 2>&1 | grep -v "^JSON:"
echo "--- perf_mon build (--env perf) ---"
npx webpack --mode=production --env perf > /tmp/perf.log 2>&1
PE=$(grep -c "^ERROR" /tmp/perf.log); [ "$PE" != "0" ] && { echo "PERF BUILD ERRORS: $PE"; grep -A3 "^ERROR" /tmp/perf.log | head -8; }
node bench/perfmon-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -2
npx webpack --mode=production > /dev/null 2>&1   # leave dist as the normal build
