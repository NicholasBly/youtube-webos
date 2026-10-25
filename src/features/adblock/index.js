// Ad blocking: the JSON.parse and JSON.stringify hooks (parse-hook.js,
// stringify-hook.ts) that userScript.js installs for the life of the page, and
// the telemetry blockers (tracking-block.js); all of them follow the adblock
// flags (flags.js).
export { installParseHook } from './parse-hook.js';
export { installStringifyHook } from './stringify-hook.ts';
export { startTrackingBlock } from './tracking-block.js';
