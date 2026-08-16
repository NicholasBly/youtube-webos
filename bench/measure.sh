#!/bin/bash
# Build + measure both variants. Usage: bench/measure.sh <label>
LABEL="${1:-run}"
cd "$(dirname "$0")/.."
rm -rf dist
S=$(date +%s%N); npx webpack --mode=production > /tmp/legacy.log 2>&1; E=$(date +%s%N)
LEG_MS=$(( (E-S)/1000000 ))
LEG_RAW=$(stat -c %s dist/webOSUserScripts/userScript.js)
LEG_GZ=$(gzip -9 -c dist/webOSUserScripts/userScript.js | wc -c)
LEG_IDX=$(stat -c %s dist/index.js)
rm -rf dist
S=$(date +%s%N); npx webpack --mode=production --env modern > /tmp/modern.log 2>&1; E=$(date +%s%N)
MOD_MS=$(( (E-S)/1000000 ))
MOD_RAW=$(stat -c %s dist/webOSUserScripts/userScript.js)
MOD_GZ=$(gzip -9 -c dist/webOSUserScripts/userScript.js | wc -c)
MOD_IDX=$(stat -c %s dist/index.js)
# Leave dist/ as the legacy build: every other harness assumes webOS 3.
npx webpack --mode=production > /dev/null 2>&1
printf "%-22s legacy=%7d B (gz %6d) idx=%6d build=%5dms | modern=%7d B (gz %6d) idx=%6d build=%5dms\n" \
  "$LABEL" "$LEG_RAW" "$LEG_GZ" "$LEG_IDX" "$LEG_MS" "$MOD_RAW" "$MOD_GZ" "$MOD_IDX" "$MOD_MS"
