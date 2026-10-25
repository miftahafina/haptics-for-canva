// Pure screen-coordinate helpers, shared by the content script and unit tests.
globalThis.CanvaHapticsGeometry = Object.freeze({
  guide(rect) {
    if (rect.height >= 20 && rect.width <= 6) return { axis: "x", position: rect.left };
    if (rect.width >= 20 && rect.height <= 6) return { axis: "y", position: rect.top };
    return null;
  },
  hasNewGuide(current, previous) {
    // Ignore guide length changes, DOM replacement, and subpixel jitter.
    return current.some((guide) => !previous.some((old) =>
      old.axis === guide.axis && Math.abs(old.position - guide.position) <= 1.5));
  },
  edgeContacts(object, safe, previous = new Set()) {
    const result = new Set();
    if (!object || !safe || object.width <= 0 || object.height <= 0 || safe.width <= 0 || safe.height <= 0) return result;
    const overlapY = Math.min(object.bottom, safe.bottom) - Math.max(object.top, safe.top) > 0;
    const overlapX = Math.min(object.right, safe.right) - Math.max(object.left, safe.left) > 0;
    for (const side of ["left", "right", "top", "bottom"]) {
      const overlap = side === "left" || side === "right" ? overlapY : overlapX;
      // Enter within 1 CSS px; release beyond 3 px to avoid chatter.
      const tolerance = previous.has(side) ? 3 : 1;
      if (overlap && Math.abs(object[side] - safe[side]) <= tolerance) result.add(side);
    }
    return result;
  },
});
