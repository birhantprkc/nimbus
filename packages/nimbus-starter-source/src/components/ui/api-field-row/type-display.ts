/**
 * Type-display helpers for the API field explorer — pure projection of an
 * `ApiFieldView` into the coloured type preview (keyword vs literal vs link),
 * the `object { a, b, N more }` shorthand, and the constraint pills. Kept out of
 * the `.astro` files so the formatting has one home and can be unit-tested
 * without a render.
 */
import type { ApiConstraint, ApiFieldView, ApiUnionView } from "@cloudflare/nimbus-docs/api";

export interface TypeToken {
  text: string;
  /** Tailwind classes — semantic tokens so light/dark track automatically. */
  cls: string;
  href?: string;
  /** Monospace token — `$ref` names and literals render in mono; the property
   *  name, `optional`, punctuation, and primitives in sans. */
  mono?: boolean;
}

/** Blue link — a type that resolves to a schema page (rendered in mono). */
export const LINK_CLS = "text-info font-medium hover:underline underline-offset-2";
const KEYWORD_CLS = "text-muted-foreground"; // object / array / unresolved keywords (muted sans)
const STRING_CLS = "text-success"; // string literals
const NUMBER_CLS = "text-warning"; // numeric / boolean literals
const MUTED_CLS = "text-muted-foreground";

const PREVIEW_CAP = 5;

function literalTokens(values: readonly unknown[]): TypeToken[] {
  const out: TypeToken[] = [];
  values.forEach((v, i) => {
    if (i > 0) out.push({ text: " or ", cls: MUTED_CLS });
    out.push(
      typeof v === "string"
        ? { text: JSON.stringify(v), cls: STRING_CLS, mono: true }
        : { text: String(v), cls: NUMBER_CLS, mono: true },
    );
  });
  return out;
}

function variantTokens(union: ApiUnionView): TypeToken[] {
  const variants =
    union.mapping && union.mapping.length > 0
      ? union.mapping.map((m) => m.variant)
      : union.variants;
  const out: TypeToken[] = [];
  variants.forEach((v, i) => {
    if (i > 0) out.push({ text: " or ", cls: MUTED_CLS });
    out.push({ text: v.label, cls: v.href ? LINK_CLS : KEYWORD_CLS, href: v.href, mono: Boolean(v.href) });
  });
  return out;
}

const isArrayType = (type: string): boolean => type.startsWith("array<");
const innerType = (type: string): string =>
  isArrayType(type) ? type.slice("array<".length, -1) : type;

const isMapType = (type: string): boolean => type.startsWith("map<");
const mapInner = (type: string): string => type.slice("map<".length, -1);

/** The coloured type preview for a field, as a token stream. */
export function typeTokens(field: ApiFieldView): TypeToken[] {
  // A typed map (`map<T>`) reads as "map of T", parallel to "array of T".
  if (isMapType(field.type)) {
    const inner = mapInner(field.type);
    return [
      { text: "map of ", cls: MUTED_CLS },
      field.typeRef
        ? { text: inner, cls: LINK_CLS, href: field.typeRef.href, mono: true }
        : { text: inner || "any", cls: KEYWORD_CLS },
    ];
  }

  const arr = isArrayType(field.type);
  const prefix: TypeToken[] = arr ? [{ text: "array of ", cls: MUTED_CLS }] : [];

  if (field.union) return [...prefix, ...variantTokens(field.union)];

  if (arr) {
    const inner = innerType(field.type);
    if (field.enum && field.enum.length > 0) return [...prefix, ...literalTokens(field.enum)];
    if (field.typeRef)
      return [...prefix, { text: inner, cls: LINK_CLS, href: field.typeRef.href, mono: true }];
    return [...prefix, { text: inner || "any", cls: KEYWORD_CLS }];
  }

  if (field.enum && field.enum.length > 0) return literalTokens(field.enum);
  if (field.typeRef) return [{ text: field.type, cls: LINK_CLS, href: field.typeRef.href, mono: true }];
  if (field.typeRefs && field.typeRefs.length > 0) {
    return field.typeRefs.flatMap((r, i) => [
      ...(i > 0 ? [{ text: " or ", cls: MUTED_CLS }] : []),
      { text: r.label, cls: LINK_CLS, href: r.href, mono: true },
    ]);
  }

  // Primitive (`string`, `number`, …) or a bare `object` — muted sans.
  return [{ text: field.type, cls: KEYWORD_CLS }];
}

/** The `{ a, b, c, N more }` shorthand for an object field — or null when a
 *  field has no inline object children to preview (a union or a leaf). */
export function objectPreview(field: ApiFieldView): { names: string[]; more: number } | null {
  if (field.union || field.children.length === 0) return null;
  const names = field.children.slice(0, PREVIEW_CAP).map((c) => c.name);
  return { names, more: Math.max(0, field.childCount - names.length) };
}

export interface ConstraintPair {
  name: string;
  value: string;
}

/** Constraints as `name: value` pairs (the value shown boxed inline-code,
 *  comma-separated), e.g. `format: int64`, `maxLength: 255`. */
export function constraintPairs(c: ApiConstraint | undefined): ConstraintPair[] {
  if (!c) return [];
  const out: ConstraintPair[] = [];
  if (c.format) out.push({ name: "format", value: c.format });
  if (c.maximum !== undefined) out.push({ name: "maximum", value: String(c.maximum) });
  if (c.minimum !== undefined) out.push({ name: "minimum", value: String(c.minimum) });
  if (c.maxLength !== undefined) out.push({ name: "maxLength", value: String(c.maxLength) });
  if (c.minLength !== undefined) out.push({ name: "minLength", value: String(c.minLength) });
  if (c.pattern) out.push({ name: "pattern", value: c.pattern });
  return out;
}

/** A field opens an expander when it nests object children or union variants. */
export function isExpandable(field: ApiFieldView): boolean {
  return Boolean(field.union) || field.children.length > 0 || field.truncated;
}
