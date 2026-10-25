(() => {
  let enabled = false;
  let selector = "";
  let safeAreaSelector = "";
  let objectSelector = "";
  let dragging = false;
  let guides = [];
  let safeContacts = new Set();
  let safePair;
  let frame = 0;
  let lastScan = 0;
  let lastError = "";
  let recordingUntil = 0;
  let recordingTimer;
  let records = new Map();
  let diagnosticsTruncated = false;
  const geometry = globalThis.CanvaHapticsGeometry;
  const settingKeys = ["enabled", "selector", "safeAreaSelector", "objectSelector"];
  const configured = () => selector || (safeAreaSelector && objectSelector);

  const visible = (element) => {
    if (!element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) return false;
    return element.checkVisibility
      ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : getComputedStyle(element).visibility !== "hidden" && getComputedStyle(element).display !== "none";
  };

  function matching(css) {
    if (!css) return [];
    try {
      const matches = document.querySelectorAll(css);
      if (matches.length > 100) {
        lastError = "Selector terlalu luas (>100 elemen). Gunakan selector khusus indikator snap.";
        return [];
      }
      return Array.from(matches).filter(visible);
    } catch {
      lastError = "Selector CSS tidak valid.";
      return [];
    }
  }

  function readGuides() {
    return matching(selector).map((element) => geometry.guide(element.getBoundingClientRect())).filter(Boolean);
  }

  function readSafePair() {
    if (!safeAreaSelector || !objectSelector) return undefined;
    const areas = matching(safeAreaSelector);
    const objects = matching(objectSelector);
    if (areas.length !== 1 || objects.length !== 1 || areas[0] === objects[0]) {
      lastError = `Safe area perlu tepat 1 kotak dan 1 objek berbeda yang terlihat (ditemukan ${areas.length}/${objects.length}).`;
      return undefined;
    }
    return { area: areas[0], object: objects[0] };
  }

  function readContacts(pair, previous) {
    if (!pair) return new Set();
    return geometry.edgeContacts(pair.object.getBoundingClientRect(), pair.area.getBoundingClientRect(), previous);
  }

  function updateSafeContacts() {
    const nextPair = readSafePair();
    const same = nextPair && safePair && nextPair.area === safePair.area && nextPair.object === safePair.object;
    const next = readContacts(nextPair, same ? safeContacts : new Set());
    // Selection outlines can appear after pointerdown. Seed their first state silently.
    const entered = same && Array.from(next).some((side) => !safeContacts.has(side));
    safePair = nextPair;
    safeContacts = next;
    return entered;
  }

  function tick(now) {
    if (!dragging || !enabled || !configured()) { frame = 0; return; }
    if (now - lastScan >= 32) {
      lastScan = now;
      const next = readGuides();
      const newGuide = geometry.hasNewGuide(next, guides);
      const newContact = updateSafeContacts();
      if (newGuide || newContact) {
        chrome.runtime.sendMessage({ type: "snap" }).then((response) => {
          if (!response?.ok) lastError = response?.error || "Helper tidak merespons.";
        }).catch((error) => { lastError = error.message; });
      }
      guides = next;
    }
    frame = requestAnimationFrame(tick);
  }

  function stopDrag() {
    dragging = false;
    guides = [];
    safeContacts = new Set();
    safePair = undefined;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  document.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted || event.button !== 0) return;
    dragging = true;
    guides = readGuides();
    safePair = readSafePair();
    safeContacts = readContacts(safePair, new Set());
    if (Date.now() < recordingUntil) {
      let element = event.target;
      for (let i = 0; i < 10 && element instanceof Element; i++, element = element.parentElement) {
        inspect(element, "pointerdown", true);
      }
    }
    if (!frame && enabled && configured()) frame = requestAnimationFrame(tick);
  }, true);
  document.addEventListener("pointerup", stopDrag, true);
  document.addEventListener("pointercancel", stopDrag, true);
  window.addEventListener("blur", stopDrag);

  function configure(settings) {
    stopDrag();
    enabled = settings.enabled === true;
    selector = typeof settings.selector === "string" ? settings.selector.trim() : "";
    safeAreaSelector = typeof settings.safeAreaSelector === "string" ? settings.safeAreaSelector.trim() : "";
    objectSelector = typeof settings.objectSelector === "string" ? settings.objectSelector.trim() : "";
    lastError = "";
  }
  chrome.storage.local.get(settingKeys).then(configure);
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") chrome.storage.local.get(settingKeys).then(configure);
  });

  function inspect(element, mutationType, pointerAncestor = false) {
    if (!(element instanceof Element) || !visible(element)) return;
    const rect = element.getBoundingClientRect();
    const thin = (rect.width >= 60 && rect.height <= 6) || (rect.height >= 60 && rect.width <= 6);
    const style = getComputedStyle(element);
    const paintedBorder = ["Top", "Right", "Bottom", "Left"].some((side) =>
      parseFloat(style[`border${side}Width`]) > 0 &&
      !["none", "hidden"].includes(style[`border${side}Style`]) &&
      !["transparent", "rgba(0, 0, 0, 0)"].includes(style[`border${side}Color`]));
    const box = rect.width >= 30 && rect.height >= 30 && (
      paintedBorder || (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none") ||
      (style.boxShadow && style.boxShadow !== "none") ||
      (style.backgroundImage && style.backgroundImage !== "none") ||
      element.localName === "rect");
    if (!thin && !box && !pointerAncestor) return;
    const kind = thin ? "line" : box ? "box" : "pointer-ancestor";
    const classes = Array.from(element.classList).slice(0, 8);
    const candidate = element.id
      ? `#${CSS.escape(element.id)}`
      : element.localName + classes.map((name) => `.${CSS.escape(name)}`).join("");
    // Deduplicate dimensions: resized objects previously consumed the entire report.
    const key = `${kind}:${candidate}`;
    const kindCount = Array.from(records.values()).filter((record) => record.kind === kind).length;
    if (!records.has(key) && kindCount >= 60) { diagnosticsTruncated = true; return; }
    const old = records.get(key);
    const bounds = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    const changedBounds = old && JSON.stringify(old.bounds) !== JSON.stringify(bounds);
    records.set(key, {
      kind,
      candidateSelector: candidate,
      bounds,
      firstBounds: old?.firstBounds || bounds,
      boundsChanges: (old?.boundsChanges || 0) + (changedBounds ? 1 : 0),
      matchingElements: old?.matchingElements ?? document.querySelectorAll(candidate).length,
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      mutationType,
      seenDuringDrag: dragging || old?.seenDuringDrag || false,
      onPointerPath: pointerAncestor || old?.onPointerPath || false,
      observations: (old?.observations || 0) + 1,
    });
  }

  function scanStaticBoxes(session) {
    // Snapshot static margin boxes too: they need not mutate when an object touches them.
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    let visited = 0;
    function chunk() {
      if (session !== recordingUntil || Date.now() >= recordingUntil) return;
      for (let i = 0; i < 100; i++) {
        const element = walker.nextNode();
        if (!element) return;
        inspect(element, "snapshot");
        if (++visited >= 6000) { diagnosticsTruncated = true; return; }
      }
      setTimeout(chunk, 25);
    }
    chunk();
  }

  const observer = new MutationObserver((mutations) => {
    if (Date.now() >= recordingUntil) return;
    let budget = 160;
    for (const mutation of mutations) {
      if (--budget < 0) { diagnosticsTruncated = true; break; }
      inspect(mutation.target, mutation.type);
      const roots = mutation.type === "childList" ? mutation.addedNodes : [mutation.target];
      for (const node of roots) {
        if (!(node instanceof Element)) continue;
        inspect(node, mutation.type);
        // Bound traversal even on Canva's large DOM.
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
        let child;
        for (let n = 0; n < 30 && (child = walker.nextNode()); n++) {
          if (--budget < 0) break;
          inspect(child, mutation.type);
        }
        if (budget < 0) break;
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "diagnose") {
      clearTimeout(recordingTimer);
      records = new Map();
      diagnosticsTruncated = false;
      recordingUntil = Date.now() + 15000;
      observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ["style", "class", "hidden", "x", "y", "width", "height", "x1", "x2", "y1", "y2", "d", "transform"],
      });
      recordingTimer = setTimeout(() => observer.disconnect(), 15100);
      scanStaticBoxes(recordingUntil);
      respond({ ok: true });
    } else if (message.type === "diagnostic-report") {
      respond({
        ok: true,
        recording: Date.now() < recordingUntil,
        version: 2,
        selector, safeAreaSelector, objectSelector, enabled, lastError,
        note: "Kandidat garis, kotak, dan ancestor pointer; bukan event snap Canva. Snapshot kotak statis dibatasi 6000 elemen. Tidak merekam teks/desain. Canvas/WebGL tidak terdeteksi. Selector kotak dan objek harus diverifikasi.",
        truncated: diagnosticsTruncated,
        candidates: Array.from(records.values()),
      });
    }
  });
})();
