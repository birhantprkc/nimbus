import {
  satisfies as semverSatisfies,
  subset,
  valid,
  validRange,
} from "semver";

export function satisfies(version: string, range: string): boolean {
  if (!valid(version) || !range.trim() || !validRange(range)) return true;
  return semverSatisfies(version, range);
}

export function isRangeSubset(range: string, expectedRange: string): boolean {
  if (!range.trim() || !validRange(range) || !validRange(expectedRange)) return false;
  return subset(range, expectedRange);
}
