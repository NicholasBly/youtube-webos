function isPrimitive(
  value: unknown
): value is string | number | boolean | null | undefined | symbol | bigint {
  return Object(value) !== value;
}

const originalStringify = JSON.stringify;
const HAS_STRUCTURED_CLONE = typeof structuredClone === 'function';

type FunctionReplacer = (this: any, key: string, value: any) => any;
type WhitelistReplacer = (string | number)[] | null;

function stringify(
  value: unknown,
  replacer?: FunctionReplacer | WhitelistReplacer,
  space?: string | number
): string {
  if (!isPrimitive(value)) {
    // Check if this specific object actually contains the YouTube player context FIRST
    const holder = value as Record<string, any>;
    const ctx = holder?.playbackContext?.contentPlaybackContext as Record<string, unknown> | undefined;

    // Only trigger the heavy deep clone if the target exists and needs modification
    if (!isPrimitive(ctx) && ctx.isInlinePlaybackNoAd !== true) {
      
      if (HAS_STRUCTURED_CLONE) {
	    try {
		  value = structuredClone(value);
	    } catch {
		  value = JSON.parse(originalStringify(value));
	    }
	  } else {
	    value = JSON.parse(originalStringify(value));
	  }
      
      // Extract the cloned context and apply the flag
      const clonedCtx = (value as Record<string, any>).playbackContext.contentPlaybackContext;
      clonedCtx.isInlinePlaybackNoAd = true;
      
      console.info(`[JSON.stringify] Set isInlinePlaybackNoAd`);
    }
  }

  // Pass either the untouched original object or our modified clone to the native stringify
  return originalStringify(value, replacer as any, space);
}

JSON.stringify = stringify;