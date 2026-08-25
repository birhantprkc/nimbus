import {
  apiCoordinate,
  bodyFieldCoordinate,
  fallbackOperationCoordinate,
  isShadowingBodyProperty,
  operationCoordinate,
  parameterCoordinate,
  responseCoordinate,
  responseFieldCoordinate,
  sectionCoordinate,
  tagRouteSegment,
} from "./coordinates.js";
import {
  HTTP_METHODS,
  SCHEMA_FIELD_DEPTH,
  type HttpMethod,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiSchema,
} from "./openapi-types.js";
import type {
  Coordinate,
  OperationFacts,
  ParameterFacts,
  ParameterLocation,
  ResponseFacts,
} from "./model.js";
import { dedupeParameters, mediaExample, picksNonPrimaryMedia, resolveAuth } from "./facts.js";
import { buildOperationSamples, resolveExampleValue } from "./samples.js";
import { addField, walkFields } from "./field-walk.js";
import {
  asString,
  constraintsOf,
  isPlainObject,
  itemsOf,
  primaryMediaEntry,
  primaryMediaSchema,
  typeLabel,
} from "./schema-algebra.js";
import type { ParseContext } from "./parse-context.js";

export function parseOperations(ctx: ParseContext): void {
  for (const [path, item] of Object.entries(ctx.doc.paths ?? {})) {
    if (item === null || typeof item !== "object") continue;
    const sharedParams = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || typeof op !== "object") continue;
      addOperation(ctx, method, path, op, sharedParams);
    }
  }
}

function addOperation(
  ctx: ParseContext,
  method: HttpMethod,
  path: string,
  op: OpenApiOperation,
  sharedParams: OpenApiParameter[],
): void {
  let opCoord: Coordinate;
  const sourceBase = `#/paths/${path}/${method}`;
  if (typeof op.operationId === "string" && op.operationId) {
    opCoord = operationCoordinate(op.operationId);
    ctx.registry.register(opCoord, "operation", { source: sourceBase, isUserIdentity: true });
  } else {
    opCoord = fallbackOperationCoordinate(method, path);
    ctx.registry.register(opCoord, "operation", { source: sourceBase });
    // The generated fallback embeds "METHOD /path", which is never a safe URL
    // route segment (the space alone disqualifies it), so an operation without a
    // stable operationId cannot be given a routable, citeable coordinate. Fail
    // the build with actionable guidance rather than emit a broken route.
    const cause =
      op.operationId === undefined
        ? "has no operationId"
        : op.operationId === ""
          ? "has an empty operationId"
          : `has a non-string operationId (${typeof op.operationId})`;
    ctx.registry.addError(
      `Operation ${method.toUpperCase()} ${path} ${cause}. Every operation needs a stable string operationId to get a routable, citeable coordinate; the generated fallback "${opCoord}" is not a safe URL path segment. Add an operationId in the spec.`,
      opCoord,
      sourceBase,
    );
  }

  const facts = assembleOperation(ctx, {
    coord: opCoord,
    op,
    sourceBase,
    protocol: { method: method.toUpperCase(), path },
    rawOp: ctx.resolver.rawOperation(path, method),
    rawSharedParams: ctx.resolver.rawPathParameters(path),
    sharedParams,
    sampleTarget: { method, path },
  });

  const tag = typeof op.tags?.[0] === "string" ? op.tags[0] : undefined;
  if (tag) ctx.ensureSection(tag);
  const parentSection = tag ? sectionCoordinate(tag) : apiCoordinate(ctx.collection);
  ctx.node(opCoord, "operation", parentSection, facts, sourceBase);

  const slug = tag ? `${tagRouteSegment(tag)}/${opCoord}` : opCoord;
  ctx.page(opCoord, slug);
  ctx.attachToNav(tag, opCoord, asString(op.summary) ?? opCoord);
}

/** An operation-shaped node to assemble: a real path operation or a webhook. */
export interface OperationSite {
  coord: Coordinate;
  op: OpenApiOperation;
  /** JSON-Pointer prefix for child sources, e.g. `#/paths/{path}/{method}`. */
  sourceBase: string;
  protocol: OperationFacts["protocol"];
  /** The raw (ref-preserving) operation, for recovering union branch names. */
  rawOp: Record<string, unknown> | undefined;
  /** Raw (ref-preserving) path-item-level shared parameters — a shared union
   *  parameter recovers its branch names from here, since they don't appear
   *  under the operation's own `parameters`. */
  rawSharedParams?: unknown[];
  sharedParams: OpenApiParameter[];
  /** Present for a real endpoint → synthesise a server URL + code samples.
   *  Absent for a webhook (delivered to the subscriber, never called), so no
   *  server and no `curl`; the body/response examples still resolve. */
  sampleTarget?: { method: HttpMethod; path: string };
}

/**
 * Mint an operation's parameters, body fields, and responses, and return its
 * `OperationFacts`. Shared by real path operations and webhooks — the caller
 * owns identity (coordinate registration), the parent/nav placement, and the
 * page. Property order is load-bearing: it is the serialised model's key order.
 */
export function assembleOperation(ctx: ParseContext, site: OperationSite): OperationFacts {
  const { coord, op, sourceBase, rawOp, sharedParams } = site;
  const request: Coordinate[] = [];
  const responses: Coordinate[] = [];

  // Path-level parameters are shared; an operation-level parameter with the
  // same (name, location) OVERRIDES the shared one (OpenAPI §Path Item). Dedup
  // operation-wins so an override does not mint the coordinate twice.
  const allParams = dedupeParameters(sharedParams, op.parameters ?? []);
  for (const param of allParams) {
    request.push(addParameter(ctx, coord, param, sourceBase, rawOp, site.rawSharedParams));
  }

  const bodySchema = primaryMediaSchema(op.requestBody?.content);
  const rawBodySchema = ctx.resolver.rawContentSchema(rawOp?.requestBody);
  // A top-level `oneOf`/`anyOf` body has no object properties to mint fields
  // from — capture its union on the operation so the body renders variants,
  // preferring the raw schema so its branches link to their schema pages.
  const bodyUnion = bodySchema
    ? ctx.resolver.unionPreferRaw(rawBodySchema, bodySchema, itemsOf(bodySchema))
    : undefined;
  if (bodySchema) {
    if (picksNonPrimaryMedia(op.requestBody?.content)) {
      ctx.registry.addWarning(
        `Operation "${coord}" request body has multiple media types and no application/json; rendering the first declared type only. The others are unaddressable until a content-type coordinate segment lands.`,
        coord,
        `${sourceBase}/requestBody`,
      );
    }
    for (const c of addBodyFields(ctx, coord, bodySchema, sourceBase, rawBodySchema)) {
      request.push(c);
    }
  }

  for (const [status, response] of Object.entries(op.responses ?? {})) {
    const respCoord = responseCoordinate(coord, status);
    const respSource = `${sourceBase}/responses/${status}`;
    ctx.registry.register(respCoord, "response", { source: respSource });
    const respEntry = primaryMediaEntry(response.content);
    const respSchema = respEntry?.media.schema;
    const rawRespSchema = ctx.resolver.rawContentSchema(
      isPlainObject(rawOp?.responses) ? (rawOp.responses as Record<string, unknown>)[status] : undefined,
    );
    if (picksNonPrimaryMedia(response.content)) {
      ctx.registry.addWarning(
        `Response "${respCoord}" has multiple media types and no application/json; rendering the first declared type only.`,
        respCoord,
        respSource,
      );
    }
    const facts: ResponseFacts = {
      kind: "response",
      status,
      description: asString(response.description),
    };
    // Derived response example — authored `example`/`examples` win, else
    // sampler synthesis with WRITE-only fields hidden (the inverse of the
    // request). A `oneOf`/`anyOf` body is best-effort: the sampler picks one
    // branch; authored examples sidestep that. Symmetric with the request side.
    const respExample = resolveExampleValue(
      mediaExample(respEntry),
      "response",
      ctx.sampleTools,
    );
    if (respEntry && respExample !== undefined) {
      facts.example = { mediaType: respEntry.mediaType, value: respExample };
    }
    const respUnion = respSchema
      ? ctx.resolver.unionPreferRaw(rawRespSchema, respSchema, itemsOf(respSchema))
      : undefined;
    if (respUnion) facts.union = respUnion;
    ctx.node(respCoord, "response", coord, facts);
    responses.push(respCoord);
    if (respSchema) {
      walkFields(ctx.resolver, respSchema, SCHEMA_FIELD_DEPTH, new Set(), (fieldPath, fieldSchema, required, _topLevelName, parentPath, rawField) => {
        const fieldCoord = responseFieldCoordinate(coord, status, fieldPath);
        // A nested response field parents to its container field; a top-level
        // one parents to the response node, not the operation.
        const parent = parentPath
          ? responseFieldCoordinate(coord, status, parentPath)
          : respCoord;
        addField(ctx, fieldCoord, parent, fieldSchema, required, "field", respSource, rawField);
      }, rawRespSchema);
    }
    // The first-class error catalogue (`errors.<code>`) is deliberately NOT
    // minted yet. Its identity is semantic (an error code from the spec's
    // error schema, e.g. `errors.card_declined`), not the HTTP status — and
    // coordinates can never be refactored, so it is designed from the error
    // schema in a later pass.
  }

  const auth = resolveAuth(op.security ?? ctx.doc.security);
  const facts: OperationFacts = {
    kind: "operation",
    summary: asString(op.summary),
    description: asString(op.description),
    deprecated: op.deprecated,
    auth,
    request,
    responses,
    samples: [],
    protocol: site.protocol,
  };
  if (bodyUnion) facts.bodyUnion = bodyUnion;
  if (site.sampleTarget && ctx.firstServer) facts.server = ctx.firstServer;

  // Resolve the request example ONCE (authored `example`/`examples` win, else
  // sampler synthesis with read-only fields hidden) so the rendered example and
  // the snippet body are the same value — an authored example is no longer
  // discarded by re-synthesizing from the schema. Authored examples resolve
  // without the sample tools; synthesis is tools-gated.
  const requestEntry = primaryMediaEntry(op.requestBody?.content);
  const requestExample = resolveExampleValue(
    mediaExample(requestEntry),
    "request",
    ctx.sampleTools,
  );
  if (requestEntry && requestExample !== undefined) {
    facts.example = { mediaType: requestEntry.mediaType, value: requestExample };
  }
  if (site.sampleTarget && ctx.sampleTools) {
    facts.samples = buildOperationSamples(ctx.sampleTools, {
      method: site.sampleTarget.method,
      path: site.sampleTarget.path,
      server: ctx.firstServer,
      params: allParams,
      body: facts.example
        ? { mediaType: facts.example.mediaType, value: facts.example.value }
        : undefined,
      securitySchemes: ctx.doc.components?.securitySchemes,
      auth,
      xCodeSamples: op["x-codeSamples"] ?? op["x-code-samples"],
    });
  }
  return facts;
}

function addParameter(
  ctx: ParseContext,
  opCoord: Coordinate,
  param: OpenApiParameter,
  sourceBase: string,
  rawOp: Record<string, unknown> | undefined,
  rawSharedParams: unknown[] | undefined,
): Coordinate {
  const location = param.in as ParameterLocation;
  const coord = parameterCoordinate(opCoord, location, param.name);
  ctx.registry.register(coord, "parameter", {
    source: `${sourceBase}/parameters/${param.name}`,
  });
  const facts: ParameterFacts = {
    kind: "parameter",
    location,
    type: typeLabel(param.schema),
    required: param.required ?? location === "path",
    description: asString(param.description) ?? asString(param.schema?.description),
    deprecated: param.deprecated,
    constraints: constraintsOf(param.schema),
    default: param.schema?.default,
    enum: param.schema?.enum,
    example: param.schema?.example,
  };
  const union = param.schema
    ? ctx.resolver.unionPreferRaw(
        ctx.resolver.rawParameterSchema(rawOp?.parameters, rawSharedParams, param.name, location),
        param.schema,
        itemsOf(param.schema),
      )
    : undefined;
  if (union) facts.union = union;
  ctx.node(coord, "parameter", opCoord, facts);
  return coord;
}

function addBodyFields(
  ctx: ParseContext,
  opCoord: Coordinate,
  schema: OpenApiSchema,
  sourceBase: string,
  rawSchema?: OpenApiSchema,
): Coordinate[] {
  const coords: Coordinate[] = [];
  walkFields(ctx.resolver, schema, SCHEMA_FIELD_DEPTH, new Set(), (fieldPath, fieldSchema, required, topLevelName, parentPath, rawField) => {
    const coord = bodyFieldCoordinate(opCoord, fieldPath);
    // A nested body field parents to its container field; a top-level one
    // parents to the operation. Nesting is minted here because coordinates are
    // opaque — the view-model can never reconstruct hierarchy after the fact.
    const parent = parentPath ? bodyFieldCoordinate(opCoord, parentPath) : opCoord;
    // Rule 1 shadowing: a top-level body property that reads like a prefix is
    // legal but warned; an actual collision is a build error via the registry.
    if (topLevelName && isShadowingBodyProperty(topLevelName)) {
      ctx.registry.warnShadowing(coord, topLevelName, sourceBase);
    }
    addField(ctx, coord, parent, fieldSchema, required, "field", `${sourceBase}/requestBody`, rawField);
    coords.push(coord);
  }, rawSchema);
  return coords;
}
