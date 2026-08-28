// The citation-index producer — the coordinate → URL contract the resolver reads.
// Pins URL formation (mount path per D18), the default/versioned key pair, the
// published manifest shape, and remote-manifest ingest with path-only value
// validation + trusted origin. If this goes red, the citation contract moved.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { buildCitationIndex, ingestRemoteManifest, type CoordinatesManifest } from "../src/_internal/api/citation-index.ts";
import type { ApiSpec } from "../src/types.ts";

function fixturePath(rel: string): string {
  return fileURLToPath(new URL(`./fixtures/api/${rel}`, import.meta.url));
}

const root = fileURLToPath(new URL(".", import.meta.url));

describe("buildCitationIndex: unversioned collection", () => {
  const api: ApiSpec[] = [{ collection: "smallco", spec: fixturePath("smallco.yaml") }];

  test("keys pages under collection:coordinate with site-absolute /collection URLs", async () => {
    const { index } = await buildCitationIndex(api, root);
    assert.ok(index.size > 0);
    // the root page maps to the bare mount path
    assert.equal(index.get("smallco:smallco"), "/smallco");
    // every value is a site-absolute path under the mount
    for (const [, url] of index) assert.match(url, /^\/smallco(\/.*)?$/);
  });

  test("manifest carries the collection with a null defaultVersion", async () => {
    const { manifest } = await buildCitationIndex(api, root);
    assert.equal(manifest.version, 1);
    assert.equal(manifest.collections.smallco?.defaultVersion, null);
    const entries = manifest.collections.smallco!.entries;
    assert.ok(Object.keys(entries).length > 0);
    // entries are keyed by the opaque coordinate; each is a structured record
    // with a default `url` (unversioned collection → no per-version map).
    for (const entry of Object.values(entries)) {
      assert.equal(typeof entry.url, "string");
      assert.equal(entry.versions, undefined);
    }
  });

  test("manifest maps are null-prototype (a '__proto__'/'constructor' key can never pollute)", async () => {
    const { manifest } = await buildCitationIndex(api, root);
    assert.equal(Object.getPrototypeOf(manifest.collections), null);
    assert.equal(Object.getPrototypeOf(manifest.collections.smallco!.entries), null);
  });
});

describe("buildCitationIndex: versioned family (v2 default + v1)", () => {
  const spec = fixturePath("smallco.yaml");
  const api: ApiSpec[] = [
    {
      collection: "svc",
      versions: [
        { version: "v2", default: true, spec },
        { version: "v1", spec },
      ],
    },
  ];

  test("default version is addressable both bare and @-qualified; v1 lives under /svc/v1", async () => {
    const { index, manifest } = await buildCitationIndex(api, root);
    // default (v2): bare key → /svc, and @v2 key → /svc
    assert.equal(index.get("svc:svc"), "/svc");
    assert.equal(index.get("svc@v2:svc"), "/svc");
    // non-default (v1): only the @v1 key exists, under /svc/v1 — no bare alias
    assert.equal(index.get("svc@v1:svc"), "/svc/v1");
    assert.equal(manifest.collections.svc?.defaultVersion, "v2");
  });
});

describe("buildCitationIndex: field coordinates resolve to <page>#<anchor>", () => {
  const api: ApiSpec[] = [{ collection: "smallco", spec: fixturePath("smallco.yaml") }];

  test("a body field, a parameter, and a schema field each cite their owning page plus a lossless anchor", async () => {
    const { index } = await buildCitationIndex(api, root);
    // The anchor is the coordinate itself when it is already fragment-safe, so
    // the field URL is exactly the owning page's URL plus that fragment.
    assert.equal(index.get("smallco:create.amount"), `${index.get("smallco:create")}#create.amount`);
    assert.equal(index.get("smallco:list.query.limit"), `${index.get("smallco:list")}#list.query.limit`);
    assert.equal(index.get("smallco:Charge.amount"), `${index.get("smallco:Charge")}#Charge.amount`);
  });

  test("a colon-bearing field name yields a fragment-safe (sanitized + disambiguated) anchor", async () => {
    const { index } = await buildCitationIndex(api, root);
    const url = index.get("smallco:search.static:wan");
    assert.ok(url, "the hostile body property is citeable");
    const [pageUrl, fragment] = url!.split("#");
    assert.equal(pageUrl, index.get("smallco:search"));
    // ':' is not fragment-safe, so it is rewritten and a lossless base32 suffix
    // appended for injectivity.
    assert.match(fragment, /^search\.static-wan--[a-z2-7]+$/);
    assert.ok(!fragment.includes(":"));
  });

  test("field coordinates are published in the manifest alongside pages", async () => {
    const { manifest } = await buildCitationIndex(api, root);
    const entries = manifest.collections.smallco!.entries;
    assert.equal(typeof entries["create.amount"]?.url, "string");
    assert.match(entries["create.amount"]!.url!, /#create\.amount$/);
  });
});

describe("ingestRemoteManifest", () => {
  const manifest: CoordinatesManifest = {
    version: 1,
    collections: {
      zones: {
        defaultVersion: "v2",
        entries: { createZone: { url: "/zones/create", versions: { v1: "/zones/v1/create" } } },
      },
    },
  };

  test("folds remote entries under the consumer collection name + trusted origin", () => {
    const index = new Map<string, string>();
    const diags = ingestRemoteManifest(index, "zones", manifest, "https://api.example.com");
    assert.equal(diags.length, 0);
    assert.equal(index.get("zones:createZone"), "https://api.example.com/zones/create");
    assert.equal(index.get("zones@v1:createZone"), "https://api.example.com/zones/v1/create");
  });

  test("no origin → site-absolute path preserved", () => {
    const index = new Map<string, string>();
    ingestRemoteManifest(index, "zones", manifest);
    assert.equal(index.get("zones:createZone"), "/zones/create");
  });

  test("coordinates containing '@' round-trip losslessly (no key ambiguity)", () => {
    // A structured entry keys by the opaque coordinate, so a coordinate that
    // itself contains '@' can never collide with the version separator.
    const withAt: CoordinatesManifest = {
      version: 1,
      collections: {
        zones: {
          defaultVersion: "v2",
          entries: { "getUser@v2": { url: "/zones/get-user", versions: { v1: "/zones/v1/get-user" } } },
        },
      },
    };
    const index = new Map<string, string>();
    const diags = ingestRemoteManifest(index, "zones", withAt);
    assert.equal(diags.length, 0);
    assert.equal(index.get("zones:getUser@v2"), "/zones/get-user");
    assert.equal(index.get("zones@v1:getUser@v2"), "/zones/v1/get-user");
  });

  test("an unsafe manifest value is dropped, never baked", () => {
    const hostile: CoordinatesManifest = {
      version: 1,
      collections: {
        zones: {
          defaultVersion: null,
          entries: { evil: { url: "javascript:alert(1)" }, ok: { url: "/zones/ok" } },
        },
      },
    };
    const index = new Map<string, string>();
    const diags = ingestRemoteManifest(index, "zones", hostile, "https://api.example.com");
    assert.equal(index.has("zones:evil"), false);
    assert.equal(index.get("zones:ok"), "https://api.example.com/zones/ok");
    assert.equal(diags.length, 1);
  });

  test("arrays are rejected at every level (never iterated by numeric index)", () => {
    // An array is `typeof "object"`, so a naive guard would let `Object.entries`
    // fold `["/zones/v0"]` in as version "0". Reject arrays outright.
    const arrayVersions = {
      version: 1,
      collections: {
        zones: { defaultVersion: null, entries: { badV: { versions: ["/zones/v0"] } } },
      },
    } as unknown as CoordinatesManifest;
    const index = new Map<string, string>();
    const diags = ingestRemoteManifest(index, "zones", arrayVersions);
    assert.equal(index.has("zones@0:badV"), false);
    assert.equal(index.size, 0);
    assert.ok(diags.some((d) => /versions/.test(d)));

    // entries-as-array, and collection-record-as-array, both fold nothing.
    const arrayEntries = {
      version: 1,
      collections: { zones: { defaultVersion: null, entries: [{ url: "/x" }] } },
    } as unknown as CoordinatesManifest;
    const index2 = new Map<string, string>();
    const diags2 = ingestRemoteManifest(index2, "zones", arrayEntries);
    assert.equal(index2.size, 0);
    assert.equal(diags2.length, 1);

    const arrayCollection = {
      version: 1,
      collections: { zones: [{ url: "/x" }] },
    } as unknown as CoordinatesManifest;
    const index3 = new Map<string, string>();
    const diags3 = ingestRemoteManifest(index3, "zones", arrayCollection);
    assert.equal(index3.size, 0);
    assert.equal(diags3.length, 1);
  });

  test("malformed entries are dropped defensively, valid siblings survive", () => {
    const malformed = {
      version: 1,
      collections: {
        zones: {
          defaultVersion: null,
          entries: {
            bad: "not-an-object",
            badVersions: { versions: "nope" },
            good: { url: "/zones/good" },
          },
        },
      },
    } as unknown as CoordinatesManifest;
    const index = new Map<string, string>();
    const diags = ingestRemoteManifest(index, "zones", malformed);
    assert.equal(index.get("zones:good"), "/zones/good");
    assert.equal(index.has("zones:bad"), false);
    assert.equal(index.has("zones:badVersions"), false);
    assert.ok(diags.length >= 2);
  });

  test("a missing collection warns and folds nothing", () => {
    const index = new Map<string, string>();
    const diags = ingestRemoteManifest(index, "nope", manifest);
    assert.equal(index.size, 0);
    assert.equal(diags.length, 1);
  });
});
