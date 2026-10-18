import { OPEN_IN_TARGETS, type OpenInTarget } from '@lamp/domain';

/**
 * Settings → Open in (M9-10): `UserSettings.openInTargets` lists the shown targets in order, so
 * a hidden target has no place of its own. It's listed after the shown ones, in the usual order,
 * and goes to the end of them when shown again.
 */

/** Every target, shown ones first in the user's order, then the hidden ones. */
export const allTargets = (shown: readonly OpenInTarget[]): OpenInTarget[] => [
  ...shown,
  ...OPEN_IN_TARGETS.filter((key) => !shown.includes(key)),
];

export function setShown(
  shown: readonly OpenInTarget[],
  key: OpenInTarget,
  on: boolean,
): OpenInTarget[] {
  const rest = shown.filter((k) => k !== key);
  return on ? [...rest, key] : rest;
}

/** `key` moved to `index` among the shown targets. */
export function moveShown(
  shown: readonly OpenInTarget[],
  key: OpenInTarget,
  index: number,
): OpenInTarget[] {
  const rest = shown.filter((k) => k !== key);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), key, ...rest.slice(at)];
}
