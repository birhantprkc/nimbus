import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildApiModel,
  getApiNav,
  getApiPageProps,
  getApiPageSlugs,
  renderApiPageMarkdown,
  type ApiFieldView,
  type ApiPageProps,
} from "../src/api/index.js";

const enabled = process.env.NIMBUS_API_GAUNTLET === "1";

const MAX_MEAN_PROJECT_MS = 4;
const MAX_MEAN_RENDER_MS = 4;

const SPECS = [
  { collection: "cloudflare", file: "cloudflare.json" },
  { collection: "stripe", file: "stripe.json" },
  { collection: "github", file: "github.json" },
  { collection: "openai", file: "openai.yaml" },
];

const fixture = (rel: string) =>
  fileURLToPath(new URL(`./fixtures/api/production/${rel}`, import.meta.url));
const now = () => Number(process.hrtime.bigint()) / 1e6;
const mb = (bytes: number) => bytes / 1024 / 1024;
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

function countFields(fields: ApiFieldView[]): number {
  let n = 0;
  const stack = [...fields];
  while (stack.length) {
    const f = stack.pop()!;
    n += 1;
    for (const c of f.children) stack.push(c);
  }
  return n;
}

function pageFieldCount(props: ApiPageProps): number {
  const p = props as Record<string, unknown>;
  let n = 0;
  if (Array.isArray(p.body)) n += countFields(p.body as ApiFieldView[]);
  if (Array.isArray(p.fields)) n += countFields(p.fields as ApiFieldView[]);
  if (Array.isArray(p.parameters))
    for (const g of p.parameters as { fields: ApiFieldView[] }[]) n += countFields(g.fields);
  if (Array.isArray(p.responses))
    for (const r of p.responses as { fields?: ApiFieldView[] }[])
      if (r.fields) n += countFields(r.fields);
  return n;
}

describe("api budget sweep", { skip: enabled ? false : "set NIMBUS_API_GAUNTLET=1" }, () => {
  for (const { collection, file } of SPECS) {
    test(`${collection}: per-page projection stays O(1) as the model scales`, async () => {
      const specPath = fixture(file);
      assert.ok(existsSync(specPath), `missing fixture ${file}`);
      const specBytes = statSync(specPath).size;

      const heapBefore = process.memoryUsage().heapUsed;
      const t0 = now();
      const model = await buildApiModel({ collection, spec: readFileSync(specPath, "utf8"), label: file });
      const buildMs = now() - t0;

      const tNav = now();
      getApiNav(model);
      const navMs = now() - tNav;

      const slugs = getApiPageSlugs(model);
      assert.ok(slugs.length > 0, "spec produced pages");
      const heapAfter = process.memoryUsage().heapUsed;

      let projSum = 0;
      let renderSum = 0;
      let totalMdBytes = 0;
      let maxMdBytes = 0;
      let maxFields = 0;
      let maxFieldsCoord = "";
      for (const { coordinate } of slugs) {
        const tp = now();
        const props = getApiPageProps(model, coordinate);
        projSum += now() - tp;

        const fc = pageFieldCount(props);
        if (fc > maxFields) {
          maxFields = fc;
          maxFieldsCoord = coordinate;
        }

        const tr = now();
        const md = renderApiPageMarkdown(props);
        renderSum += now() - tr;
        assert.ok(md.trim().length > 0, `empty markdown for ${coordinate}`);
        const bytes = Buffer.byteLength(md, "utf8");
        totalMdBytes += bytes;
        if (bytes > maxMdBytes) maxMdBytes = bytes;
      }

      const meanProject = projSum / slugs.length;
      const meanRender = renderSum / slugs.length;

      console.log(
        `\n  ${collection} (${fmt(mb(specBytes), 1)} MB, ${fmt(slugs.length)} pages)\n` +
          `    parse+build ${fmt(buildMs)} ms · nav ${fmt(navMs)} ms · build heap +${fmt(mb(heapAfter - heapBefore), 1)} MB\n` +
          `    project ${fmt(meanProject, 3)} ms/page (total ${fmt(projSum)} ms) · render ${fmt(meanRender, 3)} ms/page (total ${fmt(renderSum)} ms)\n` +
          `    markdown ${fmt(mb(totalMdBytes), 1)} MB (max page ${fmt(maxMdBytes / 1024, 1)} KB) · widest ${fmt(maxFields)} fields (${maxFieldsCoord})\n` +
          `    end-to-end (build + project + render all): ${fmt(buildMs + projSum + renderSum)} ms`,
      );

      assert.ok(
        meanProject < MAX_MEAN_PROJECT_MS,
        `mean projection ${meanProject.toFixed(3)} ms/page exceeds ${MAX_MEAN_PROJECT_MS} ms — the ModelView is likely rebuilt per page (O(pages × nodes))`,
      );
      assert.ok(
        meanRender < MAX_MEAN_RENDER_MS,
        `mean markdown render ${meanRender.toFixed(3)} ms/page exceeds ${MAX_MEAN_RENDER_MS} ms`,
      );
    });
  }
});
