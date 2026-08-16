#!/bin/bash
# Back-to-back A/B of the hot-path changes on the same machine state.
cd "$(dirname "$0")/.."
run () {
  cp "$1" src/adblock.js; cp "$2" src/hooks/json-stringify.ts
  npx webpack --mode=production > /dev/null 2>&1
  echo "### $3"
  node bench/isolate.cjs dist/webOSUserScripts/userScript.js 2>&1 | grep -E "all off|adblock only|emoji only|adblock\+emoji|everything"
}
for i in 1 2; do
  run /tmp/adblock.baseline.js /tmp/js.bak   "BASELINE (as shipped) - pass $i"
  run /tmp/adblock.final.js    /tmp/js.final.ts "OPTIMISED - pass $i"
done
cp /tmp/adblock.final.js src/adblock.js; cp /tmp/js.final.ts src/hooks/json-stringify.ts
npx webpack --mode=production > /dev/null 2>&1
