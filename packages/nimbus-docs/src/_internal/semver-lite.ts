/**
 * Minimal semver range check for the adapter installer's compatibility warning
 * (ticket AC#6 edge). Supports the grammar the recipes use: caret
 * (`^X[.Y[.Z]]`), the comparators `>=`/`>`/`<=`/`<`/`=`, exact versions, and
 * space-separated conjunctions (`>=14.1.0 <14.2.0`). Fails OPEN — anything it
 * can't parse returns `true`, so a warning is only ever raised on a version it
 * can prove is out of range, never on uncertainty.
 */

type Tuple = [number, number, number];

function parseVersion(v: string): Tuple | null {
  const core = v.trim().replace(/^[v=]+/, "").split(/[-+]/)[0] ?? "";
  const parts = core.split(".");
  if (parts[0] === "" || parts.length === 0) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
}

function cmp(a: Tuple, b: Tuple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

function caretBounds(partial: string): [Tuple, Tuple] | null {
  const lower = parseVersion(partial);
  if (!lower) return null;
  const [maj, min, pat] = lower;
  const upper: Tuple =
    maj > 0 ? [maj + 1, 0, 0] : min > 0 ? [0, min + 1, 0] : [0, 0, pat + 1];
  return [lower, upper];
}

function satisfiesComparator(version: Tuple, comparator: string): boolean {
  const comp = comparator.trim();
  if (comp === "" || comp === "*") return true;
  if (comp.startsWith("^")) {
    const bounds = caretBounds(comp.slice(1));
    if (!bounds) return true;
    return cmp(version, bounds[0]) >= 0 && cmp(version, bounds[1]) < 0;
  }
  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(comp);
  const target = m ? parseVersion(m[2] ?? "") : null;
  if (!target) return true;
  const c = cmp(version, target);
  switch (m?.[1] ?? "=") {
    case ">=":
      return c >= 0;
    case "<=":
      return c <= 0;
    case ">":
      return c > 0;
    case "<":
      return c < 0;
    default:
      return c === 0;
  }
}

export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  if (!v) return true;
  return range
    .trim()
    .split(/\s+/)
    .every((comparator) => satisfiesComparator(v, comparator));
}
