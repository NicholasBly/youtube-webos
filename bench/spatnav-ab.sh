#!/bin/bash
cd "$(dirname "$0")/.."
run () {
  cp "$1" src/spatial-navigation-polyfill.js; cp "$2" src/ui.js
  npx webpack --mode=production > /dev/null 2>&1
  echo "### $3"
  node bench/spatnav-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | grep -E "getBoundingClientRect|getComputedStyle|panel"
  node bench/spatnav-correctness.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
}
run /tmp/spatnav.baseline.js /tmp/ui.baseline.js "BASELINE (as shipped)"
run /tmp/spatnav.final.js    /tmp/ui.final.js    "OPTIMISED"
cp /tmp/spatnav.final.js src/spatial-navigation-polyfill.js; cp /tmp/ui.final.js src/ui.js
npx webpack --mode=production > /dev/null 2>&1
