// User-selected model, verified against the installed Desktop catalog.
// deepseek-flash is DeepSeek-V41-Flash; do not substitute a V4 tier default.
export const fixedModelPolicy = Object.freeze({
  mode: 'hub',
  tier_policy: 'flash-only',
  default_tier: 'flash',
  default_effort: 'max',
  escalate_on_failure: false,
  flash_provider: 'deepseek-official', flash_model: 'deepseek-flash',
  pro_provider: 'deepseek-official', pro_model: 'deepseek-flash',
});

export function lockDispatch(args) {
  if (args.worker) throw new Error('User policy pins DSH V41 Flash + Max; external CLI workers require changing that policy first.');
  return { ...args, tier: 'flash', effort: 'max' };
}
