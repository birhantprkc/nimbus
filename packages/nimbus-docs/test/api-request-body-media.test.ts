// R2.7: every request-body media type renders (no silent drop), the primary is
// selected order-independently and keeps the short-form coordinate, additional
// media namespace under a token segment and stay fully citable, and the media
// label is honest (never a hardcoded "JSON").

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildApiModel,
  getApiFieldCitations,
  getApiPageProps,
  renderApiPageMarkdown,
  type ApiModel,
  type ApiOperationPage,
} from "../src/api/index.js";

function specWith(requestBody: string): string {
  return `
openapi: 3.1.0
info: { title: T, version: "1" }
paths:
  /messages:
    post:
      operationId: sendMessage
${requestBody}
      responses:
        "200": { description: ok }
`;
}

async function build(collection: string, spec: string): Promise<ApiModel> {
  return buildApiModel({ collection, label: collection, spec });
}

describe("request body: JSON + multipart both render, multipart stays citable", () => {
  let model: ApiModel;
  let page: ApiOperationPage;

  test("build", async () => {
    model = await build(
      "msgjson",
      specWith(`      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [text]
              properties:
                text: { type: string }
                url: { type: string }
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file: { type: string, format: binary }
                caption: { type: string }`),
    );
    page = getApiPageProps(model, "sendMessage") as ApiOperationPage;
  });

  test("primary is JSON and owns the short-form coordinate", () => {
    assert.equal(page.bodyMediaType, "application/json");
    assert.deepEqual(page.body.map((f) => f.name).sort(), ["text", "url"]);
    assert.equal(page.body.find((f) => f.name === "text")?.coordinate, "sendMessage.text");
    assert.ok(!page.body.some((f) => f.name === "file"), "multipart field not folded into JSON body");
  });

  test("multipart renders as an additional body under a token segment", () => {
    assert.equal(page.additionalBodies?.length, 1);
    const mp = page.additionalBodies![0];
    assert.equal(mp.mediaType, "multipart/form-data");
    assert.deepEqual(mp.fields.map((f) => f.name).sort(), ["caption", "file"]);
    assert.equal(
      mp.fields.find((f) => f.name === "file")?.coordinate,
      "sendMessage.multipart-form-data.file",
    );
  });

  test("the multipart file field is a live citation target (not a dead fragment)", () => {
    const citations = getApiFieldCitations(model);
    const fileCite = citations.find((c) => c.coordinate === "sendMessage.multipart-form-data.file");
    assert.ok(fileCite, "multipart file field is citable");
    assert.ok(fileCite!.anchor.length > 0, "citation resolves to a real anchor");
    assert.ok(
      citations.some((c) => c.coordinate === "sendMessage.text"),
      "primary JSON field stays citable",
    );
  });

  test("both media types appear in the markdown twin", () => {
    const md = renderApiPageMarkdown(page);
    assert.match(md, /## Request body \(application\/json\)/);
    assert.match(md, /## Request body \(multipart\/form-data\)/);
    assert.match(md, /\bfile\b/);
  });

  test("page with additional bodies stays JSON round-trippable", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(page)), page);
  });
});

describe("primary selection is declaration-order independent", () => {
  const formFirst = `      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties: { a: { type: string } }
          multipart/form-data:
            schema:
              type: object
              properties: { file: { type: string, format: binary } }`;

  const multipartFirst = `      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties: { file: { type: string, format: binary } }
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties: { a: { type: string } }`;

  test("form-urlencoded wins the short form regardless of spec order", async () => {
    const a = getApiPageProps(await build("order-a", specWith(formFirst)), "sendMessage") as ApiOperationPage;
    const b = getApiPageProps(await build("order-b", specWith(multipartFirst)), "sendMessage") as ApiOperationPage;

    for (const page of [a, b]) {
      assert.equal(page.bodyMediaType, "application/x-www-form-urlencoded");
      assert.equal(page.body.find((f) => f.name === "a")?.coordinate, "sendMessage.a");
      assert.equal(page.additionalBodies?.length, 1);
      assert.equal(page.additionalBodies![0].mediaType, "multipart/form-data");
    }
  });
});

describe("a scalar secondary body (no fields) is never dropped", () => {
  let model: ApiModel;
  let page: ApiOperationPage;

  test("build", async () => {
    model = await build(
      "octet",
      specWith(`      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties: { text: { type: string } }
          application/octet-stream:
            schema: { type: string, format: binary }`),
    );
    page = getApiPageProps(model, "sendMessage") as ApiOperationPage;
  });

  test("octet-stream survives as an additional body even with no object fields", () => {
    assert.equal(page.bodyMediaType, "application/json");
    const bin = page.additionalBodies?.find((b) => b.mediaType === "application/octet-stream");
    assert.ok(bin, "octet-stream body is not silently dropped");
    assert.equal(bin!.fields.length, 0, "a binary scalar has no top-level fields");
  });

  test("the twin still announces the octet-stream affordance", () => {
    const md = renderApiPageMarkdown(page);
    assert.match(md, /## Request body \(application\/octet-stream\)/);
  });
});

describe("media label is honest for a non-JSON primary", () => {
  test("an XML-only body reports application/xml, not JSON", async () => {
    const model = await build(
      "xmlonly",
      specWith(`      requestBody:
        content:
          application/xml:
            schema:
              type: object
              properties: { data: { type: string } }`),
    );
    const page = getApiPageProps(model, "sendMessage") as ApiOperationPage;
    assert.equal(page.bodyMediaType, "application/xml");
    assert.deepEqual(page.body.map((f) => f.name), ["data"]);
    assert.ok(!page.additionalBodies, "single media type has no additional bodies");
  });
});
