#!/bin/bash
cd "$(dirname "$0")/.."
run () {
  cp "$1" src/adblock.js; cp "$2" src/hooks/json-stringify.ts
  npx webpack --mode=production > /dev/null 2>&1
  echo "### $3"
  node bench/isolate.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -8
}
run /tmp/adblock.baseline.js /tmp/js.bak       "BASELINE (as shipped)"
run /tmp/adblock.final.js    /tmp/js.final.ts  "OPTIMISED"
cp /tmp/adblock.final.js src/adblock.js; cp /tmp/js.final.ts src/hooks/json-stringify.ts
npx webpack --mode=production > /dev/null 2>&1
