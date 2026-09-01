/**
 * `nimbus-docs/server` — the framework-owned server contract (ticket seam #3).
 *
 * One audience contract, consumed by both the content projection and (later)
 * the hosted MCP server and web visibility. The starter's `src/middleware.ts`
 * is a thin pass-through that may set `App.Locals.nimbus.audience`; defining the
 * identity here (not in the forked middleware) is what lets the framework
 * *guarantee* the public-baseline floor — `getAudience` defaults to `public`
 * when nothing set it, so a missing or misconfigured middleware can never widen
 * visibility, only the reverse.
 *
 * The audience `key` carries the identity kind (`public`, and later
 * `editor`/`preview` for CMS draft preview); `groups` carries permitted-group
 * membership. Anticipating an editor/preview identity keeps the seam shape
 * stable when preview unlocks unpublished content at request time.
 *
 * The server content artifact (seam #5) is a separate export added additively
 * to this entry — the audience contract does not depend on it.
 */

import { PUBLIC_AUDIENCE, resolveAudience } from "./_internal/projection.js";
import type { Audience, ProjectionContext } from "./_internal/projection.js";

export type { Audience, ProjectionContext };
export { PUBLIC_AUDIENCE, resolveAudience };

export interface NimbusLocals {
  audience: Audience;
}

interface AudienceCarrier {
  nimbus?: { audience?: Audience };
}

/**
 * The framework-guaranteed audience for a request. Reads
 * `Astro.locals.nimbus.audience` and falls back to the public floor, so
 * projection is safe whether or not the starter middleware ran.
 */
export function getAudience(locals?: AudienceCarrier): Audience {
  return locals?.nimbus?.audience ?? PUBLIC_AUDIENCE;
}

declare global {
  namespace App {
    interface Locals {
      nimbus?: NimbusLocals;
    }
  }
}
