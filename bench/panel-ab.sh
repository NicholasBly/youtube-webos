#!/bin/bash
cd "$(dirname "$0")/.."
run () {
  cp "$1" src/ui.js
  npx webpack --mode=production > /dev/null 2>&1
  echo "### $2"
  node bench/panel-bench.cjs dist/webOSUserScripts/userScript.js "$2" 2>&1 | grep -E "visible after|IN the handler|wall time|deferred to|TOTAL panel"
  node bench/panel-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
}
run /tmp/ui.panel.baseline.js "BASELINE (all pages synchronous)"
run /tmp/ui.panel.final.js    "OPTIMISED (pages 2-4 deferred)"
cp /tmp/ui.panel.final.js src/ui.js
npx webpack --mode=production > /dev/null 2>&1
