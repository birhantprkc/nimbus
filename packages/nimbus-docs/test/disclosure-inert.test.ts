/**
 * Tests for `client/disclosure.ts` `makeDisclosure` — `inert` on the
 * content element tracks `data-nb-state` so closed content leaves the tab
 * order, with a `manageInert:false` opt-out for focus-managing consumers.
 */

import assert from "node:assert/strict";
import { test, before } from "node:test";
import { JSDOM } from "jsdom";

import { makeDisclosure } from "../src/client/disclosure.js";

before(() => {
  const dom = new JSDOM("<!DOCTYPE html><body></body>", { pretendToBeVisual: true });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
});

function setup() {
  document.body.innerHTML = `
    <button data-nb-collapsible-trigger>Toggle</button>
    <div data-nb-collapsible-content>panel</div>`;
  const trigger = document.querySelector<HTMLElement>("[data-nb-collapsible-trigger]")!;
  const content = document.querySelector<HTMLElement>("[data-nb-collapsible-content]")!;
  return { trigger, content };
}

test("defaultOpen:false renders closed content inert", () => {
  const { trigger, content } = setup();
  makeDisclosure({ trigger, content });

  assert.equal(content.getAttribute("data-nb-state"), "closed");
  assert.equal(content.hasAttribute("inert"), true);
});

test("defaultOpen:true renders open content non-inert", () => {
  const { trigger, content } = setup();
  makeDisclosure({ trigger, content, defaultOpen: true });

  assert.equal(content.getAttribute("data-nb-state"), "open");
  assert.equal(content.hasAttribute("inert"), false);
});

test("inert tracks data-nb-state and aria-expanded across open / close / toggle", () => {
  const { trigger, content } = setup();
  const d = makeDisclosure({ trigger, content });

  d.open();
  assert.equal(content.getAttribute("data-nb-state"), "open");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(content.hasAttribute("inert"), false);

  d.close();
  assert.equal(content.getAttribute("data-nb-state"), "closed");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(content.hasAttribute("inert"), true);

  d.toggle();
  assert.equal(content.hasAttribute("inert"), false);
});

test("manageInert:false never sets inert but still reflects state and fires onOpenChange", () => {
  const { trigger, content } = setup();
  const changes: boolean[] = [];
  const d = makeDisclosure({ trigger, content, manageInert: false, onOpenChange: (o) => changes.push(o) });

  assert.equal(content.hasAttribute("inert"), false);
  d.open();
  d.close();
  assert.equal(content.getAttribute("data-nb-state"), "closed");
  assert.equal(content.hasAttribute("inert"), false);
  assert.deepEqual(changes, [true, false]);
});
