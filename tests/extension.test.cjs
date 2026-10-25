const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = (name) => fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");
const flush = () => new Promise(setImmediate);

function contentHarness(settings = { enabled: true, selector: ".guide" }) {
  const events = new Map();
  const sent = [];
  let listener, tick, visible = false, mutationCallback;
  let staticElements = [];
  const timers = new Map();
  let timerId = 0;
  class MockElement {
    constructor(className, rect) {
      this.classList = [className];
      this.localName = "div";
      this.rect = rect;
      this.isConnected = true;
      this.shown = true;
      this.style = {
        borderStyle: "none", borderWidth: "0px", borderColor: "transparent",
        outlineWidth: "0px", outlineStyle: "none", boxShadow: "none", backgroundImage: "none",
        ...Object.fromEntries(["Top", "Right", "Bottom", "Left"].flatMap((side) => [
          [`border${side}Width`, "0px"], [`border${side}Style`, "none"], [`border${side}Color`, "transparent"],
        ])),
      };
    }
    getBoundingClientRect() { return this.rect; }
    checkVisibility() { return this.shown; }
  }
  const guide = new MockElement("guide", bounds(100, 100, 1, 200));
  guide.checkVisibility = () => visible;
  const matches = new Map([[".guide", [guide]]]);
  const context = {
    chrome: {
      storage: { local: { get: async () => settings }, onChanged: { addListener() {} } },
      runtime: {
        sendMessage: async (message) => { sent.push(message); return { ok: true }; },
        onMessage: { addListener(fn) { listener = fn; } },
      },
    },
    document: {
      querySelectorAll: (css) => matches.get(css) || [],
      addEventListener(name, fn) { events.set(name, fn); },
      documentElement: {},
      createTreeWalker(root) {
        const elements = root instanceof MockElement ? [] : staticElements;
        let index = 0;
        return { nextNode: () => elements[index++] };
      },
    },
    window: { addEventListener() {} },
    MutationObserver: class {
      constructor(fn) { mutationCallback = fn; }
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame(fn) { tick = fn; return 1; },
    cancelAnimationFrame() { tick = undefined; },
    innerWidth: 1000, innerHeight: 800,
    Element: MockElement,
    NodeFilter: { SHOW_ELEMENT: 1 },
    CSS: { escape: (name) => name },
    getComputedStyle: (element) => element.style,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source("geometry.js"), context);
  vm.runInNewContext(source("content.js"), context);
  function message(type) {
    let response;
    listener({ type }, {}, (value) => { response = value; });
    return response;
  }
  return {
    sent,
    visible(value) { visible = value; },
    async ready() { await flush(); },
    down(target) { events.get("pointerdown")({ isTrusted: true, button: 0, target }); },
    up() { events.get("pointerup")(); },
    tick(time) { tick?.(time); },
    report() { return message("diagnostic-report"); },
    diagnose() { return message("diagnose"); },
    element(className, rect) { return new MockElement(className, rect); },
    matches(css, elements) { matches.set(css, elements); },
    snapshot(elements) { staticElements = elements; },
    mutate(element) { mutationCallback([{ type: "attributes", target: element }]); },
    guide,
  };
}

function bounds(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
}

test("snap fires only on entering an indicator, not while staying snapped", async () => {
  const h = contentHarness();
  await h.ready();
  h.down();
  h.tick(40);
  h.visible(true);
  h.tick(80);
  h.tick(120);
  assert.equal(h.sent.length, 1);
  h.visible(false);
  h.tick(160);
  h.visible(true);
  h.tick(200);
  assert.equal(h.sent.length, 2);
  h.up();
  h.tick(240);
  assert.equal(h.sent.length, 2);
});

test("a guide already visible on pointerdown does not cause a false snap", async () => {
  const h = contentHarness();
  await h.ready();
  h.visible(true);
  h.down();
  h.tick(40);
  assert.equal(h.sent.length, 0);
});

test("disabled detection never sends haptics", async () => {
  const h = contentHarness({ enabled: false, selector: ".guide" });
  await h.ready();
  h.down();
  h.visible(true);
  h.tick(40);
  assert.equal(h.sent.length, 0);
  assert.equal(h.report().enabled, false);
});

test("empty selector never sends haptics", async () => {
  const h = contentHarness({ enabled: true, selector: "" });
  await h.ready();
  h.down();
  h.visible(true);
  h.tick(40);
  assert.equal(h.sent.length, 0);
});

test("a center guide triggers even while another alignment guide stays visible", async () => {
  const h = contentHarness();
  await h.ready();
  h.visible(true);
  h.down();
  const center = h.element("center", bounds(0, 300, 500, 1));
  h.matches(".guide", [h.guide, center]);
  h.tick(40);
  h.tick(80);
  assert.equal(h.sent.length, 1);
});

test("guide replacement, length changes and subpixel jitter do not retrigger", async () => {
  const h = contentHarness();
  await h.ready();
  h.visible(true);
  h.down();
  h.matches(".guide", [h.element("replacement", bounds(100.5, 50, 1, 400))]);
  h.tick(40);
  assert.equal(h.sent.length, 0);
});

function safeHarness() {
  const h = contentHarness({ enabled: true, selector: "", safeAreaSelector: ".safe", objectSelector: ".selected" });
  h.safe = h.element("safe", bounds(100, 100, 500, 400));
  h.object = h.element("selected", bounds(200, 200, 100, 100));
  h.matches(".safe", [h.safe]);
  h.matches(".selected", [h.object]);
  return h;
}

test("safe area touches trigger once, release and re-enter with hysteresis", async () => {
  const h = safeHarness();
  await h.ready();
  h.down();
  h.object.rect = bounds(100.5, 200, 100, 100);
  h.tick(40);
  assert.equal(h.sent.length, 1);
  h.object.rect = bounds(102, 200, 100, 100);
  h.tick(80);
  h.object.rect = bounds(100, 200, 100, 100);
  h.tick(120);
  assert.equal(h.sent.length, 1);
  h.object.rect = bounds(105, 200, 100, 100);
  h.tick(160);
  h.object.rect = bounds(100, 200, 100, 100);
  h.tick(200);
  assert.equal(h.sent.length, 2);
});

test("safe area detects another side while the first side stays touching", async () => {
  const h = safeHarness();
  await h.ready();
  h.object.rect = bounds(100, 200, 100, 100);
  h.down();
  h.object.rect = bounds(100, 100, 100, 100);
  h.tick(40);
  assert.equal(h.sent.length, 1);
  h.tick(80);
  assert.equal(h.sent.length, 1);
});

test("resizing to the right and bottom safe boundaries is detected", async () => {
  const h = safeHarness();
  await h.ready();
  h.down();
  h.object.rect = bounds(200, 200, 400, 100);
  h.tick(40);
  h.object.rect = bounds(200, 200, 400, 300);
  h.tick(80);
  assert.equal(h.sent.length, 2);
});

test("safe boundaries do not extend infinitely outside the rectangle", async () => {
  const h = safeHarness();
  await h.ready();
  h.down();
  h.object.rect = bounds(100, 600, 100, 100);
  h.tick(40);
  assert.equal(h.sent.length, 0);
});

test("an outline appearing after pointerdown seeds contacts without false haptics", async () => {
  const h = safeHarness();
  await h.ready();
  h.matches(".selected", []);
  h.down();
  h.object.rect = bounds(100, 100, 100, 100);
  h.matches(".selected", [h.object]);
  h.tick(40);
  assert.equal(h.sent.length, 0);
});

test("ambiguous safe-area selectors fail closed without choosing arbitrary objects", async () => {
  const h = safeHarness();
  await h.ready();
  h.matches(".selected", [h.object, h.element("other", bounds(200, 200, 50, 50))]);
  h.down();
  h.object.rect = bounds(100, 100, 100, 100);
  h.tick(40);
  assert.equal(h.sent.length, 0);
  assert.match(h.report().lastError, /tepat 1 kotak dan 1 objek/);
});

test("static safe-area boxes and pointer ancestors appear in new diagnostics", async () => {
  const h = contentHarness();
  await h.ready();
  const safe = h.element("margin", bounds(100, 100, 500, 400));
  Object.assign(safe.style, { borderTopWidth: "1px", borderTopStyle: "dashed", borderTopColor: "rgb(0, 0, 0)" });
  const object = h.element("selection", bounds(200, 200, 100, 100));
  h.matches("div.margin", [safe]);
  h.matches("div.selection", [object]);
  h.snapshot([safe]);
  h.diagnose();
  h.down(object);
  const report = h.report();
  assert.equal(report.version, 2);
  assert.equal(report.candidates.find((entry) => entry.candidateSelector === "div.margin").kind, "box");
  assert.equal(report.candidates.find((entry) => entry.candidateSelector === "div.selection").onPointerPath, true);
});

test("diagnosis deduplicates resized boxes rather than filling the report", async () => {
  const h = contentHarness();
  await h.ready();
  const selected = h.element("selected", bounds(200, 200, 100, 100));
  selected.style.outlineWidth = "1px";
  selected.style.outlineStyle = "solid";
  h.matches("div.selected", [selected]);
  h.diagnose();
  for (let i = 0; i < 80; i++) {
    selected.rect = bounds(200, 200, 100 + i, 100);
    h.mutate(selected);
  }
  const report = h.report();
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].boundsChanges, 79);
  assert.equal(report.truncated, false);
});

function backgroundHarness(enabled = true) {
  let listener;
  const nativeCommands = [];
  let receive;
  const context = {
    setTimeout, clearTimeout,
    chrome: {
      storage: { local: { get: async () => ({ enabled }) } },
      runtime: {
        connectNative: () => ({
          onMessage: { addListener(fn) { receive = fn; } },
          onDisconnect: { addListener() {} },
          postMessage(message) {
            nativeCommands.push(message);
            queueMicrotask(() => receive({ id: message.id, ok: true }));
          },
        }),
        onMessage: { addListener(fn) { listener = fn; } },
      },
    },
  };
  vm.runInNewContext(source("background.js"), context);
  return {
    nativeCommands,
    send(message, sender = {}) { return new Promise((resolve) => listener(message, sender, resolve)); },
  };
}

test("manual test and ping route to the native helper", async () => {
  const h = backgroundHarness();
  assert.equal((await h.send({ type: "ping" })).ok, true);
  assert.equal((await h.send({ type: "test-haptic" })).ok, true);
  assert.deepEqual(h.nativeCommands.map((item) => item.command), ["ping", "alignment"]);
});

test("snap rejects non-Canva senders", async () => {
  const h = backgroundHarness();
  const result = await h.send({ type: "snap" }, { tab: { id: 1 }, url: "https://example.com/" });
  assert.equal(result.ok, false);
  assert.equal(h.nativeCommands.length, 0);
});

test("snap is throttled and honors disabled storage", async () => {
  const sender = { tab: { id: 1 }, url: "https://www.canva.com/design/test/edit" };
  const h = backgroundHarness();
  await h.send({ type: "snap" }, sender);
  await h.send({ type: "snap" }, sender);
  assert.equal(h.nativeCommands.length, 1);
  const disabled = backgroundHarness(false);
  await disabled.send({ type: "snap" }, sender);
  assert.equal(disabled.nativeCommands.length, 0);
});
