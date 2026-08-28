/**
 * Tests for `client/url-param.ts` — reading a query param (including one
 * stranded in the fragment) and writing one back canonically without
 * disturbing the anchor, other params, or history state.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

import { readUrlParam, writeUrlParam } from "../src/client/url-param.js";

function withUrl(url: string, fn: () => void): void {
  const dom = new JSDOM("<!DOCTYPE html><body></body>", { url });
  const g = globalThis as any;
  const prev = { location: g.location, history: g.history };
  g.location = dom.window.location;
  g.history = dom.window.history;
  try {
    fn();
  } finally {
    g.location = prev.location;
    g.history = prev.history;
  }
}

test("readUrlParam reads from the query string", () => {
  withUrl("https://x.dev/create?lang=python", () => {
    assert.equal(readUrlParam("lang"), "python");
  });
});

test("readUrlParam recovers a param stranded in the fragment", () => {
  withUrl("https://x.dev/create#create.amount?lang=python", () => {
    assert.equal(readUrlParam("lang"), "python");
  });
});

test("readUrlParam returns null when absent or empty", () => {
  withUrl("https://x.dev/create", () => assert.equal(readUrlParam("lang"), null));
  withUrl("https://x.dev/create?lang=", () => assert.equal(readUrlParam("lang"), null));
});

test("readUrlParam prefers the query string over the fragment", () => {
  withUrl("https://x.dev/create?lang=curl#a?lang=python", () => {
    assert.equal(readUrlParam("lang"), "curl");
  });
});

test("writeUrlParam sets the param and preserves the anchor", () => {
  withUrl("https://x.dev/create#create.amount", () => {
    writeUrlParam("lang", "curl");
    assert.equal(location.search, "?lang=curl");
    assert.equal(location.hash, "#create.amount");
  });
});

test("writeUrlParam preserves other query params", () => {
  withUrl("https://x.dev/create?foo=1#a", () => {
    writeUrlParam("lang", "go");
    assert.equal(location.search, "?foo=1&lang=go");
    assert.equal(location.hash, "#a");
  });
});

test("writeUrlParam moves a fragment-stranded param into the query", () => {
  withUrl("https://x.dev/create#create.amount?lang=python", () => {
    writeUrlParam("lang", "curl");
    assert.equal(location.search, "?lang=curl");
    assert.equal(location.hash, "#create.amount");
  });
});

test("readUrlParam treats an empty query value as absent and falls through", () => {
  withUrl("https://x.dev/create?lang=#a?lang=python", () => {
    assert.equal(readUrlParam("lang"), "python");
  });
});

test("writeUrlParam clears a fragment left empty after stripping the param", () => {
  withUrl("https://x.dev/create#?lang=python", () => {
    writeUrlParam("lang", "curl");
    assert.equal(location.href, "https://x.dev/create?lang=curl");
    assert.equal(location.hash, "");
  });
});

test("writeUrlParam no-ops when the URL would not change", () => {
  withUrl("https://x.dev/create?lang=curl", () => {
    const before = location.href;
    writeUrlParam("lang", "curl");
    assert.equal(location.href, before);
  });
});
