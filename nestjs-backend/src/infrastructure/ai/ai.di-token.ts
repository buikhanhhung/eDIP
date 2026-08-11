/**
 * One token per capability, not one per vendor.
 *
 * Callers ask for "something that can embed" and get whichever provider is
 * configured. Nothing outside `infrastructure/` names Bedrock or OpenAI.
 */
export const LLM_SERVICE = Symbol('LLM_SERVICE');
export const EMBEDDING_SERVICE = Symbol('EMBEDDING_SERVICE');
export const VISION_SERVICE = Symbol('VISION_SERVICE');
