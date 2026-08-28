import type { FieldSink } from "./field-walk.js";
import type { OpenApiDocument } from "./openapi-types.js";
import type { SampleTools } from "./samples.js";
import type { Coordinate } from "./model.js";

// The shared write-surface the parse passes (operations/schemas/webhooks) drive,
// implemented by Walker. Read-context plus the node/page/nav verbs — never the
// accumulation stores. Lives on its own as a contract shared by all three passes.
export interface ParseContext extends FieldSink {
  readonly collection: string;
  readonly doc: OpenApiDocument;
  readonly firstServer?: string;
  readonly sampleTools: SampleTools | null;
  readonly requireOperationId: boolean;
  page(coord: Coordinate, slug: string): void;
  attachToNav(tag: string | undefined, coord: Coordinate, label: string): void;
  ensureSection(tag: string, description?: string, page?: boolean): void;
}
