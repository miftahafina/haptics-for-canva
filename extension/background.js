const HOST = "com.local.canva_snap_haptics";
let port;
let sequence = 0;
let lastSnap = 0;
const pending = new Map();

function connect() {
  if (port) return port;
  const connection = chrome.runtime.connectNative(HOST);
  port = connection;
  connection.onMessage.addListener((message) => {
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    request.resolve(message);
  });
  connection.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || "Helper macOS terputus.";
    if (port === connection) port = undefined;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(error));
    }
    pending.clear();
  });
  return connection;
}

function native(command) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Helper tidak merespons dalam 5 detik."));
    }, 5000);
    pending.set(id, { resolve, reject, timer });
    try {
      connect().postMessage({ id, command });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!["test-haptic", "snap", "ping"].includes(message.type)) return;
  (async () => {
    if (message.type === "snap") {
      if (!sender.tab || !/^https:\/\/(www\.)?canva\.com\//.test(sender.url || "")) {
        throw new Error("Snap hanya diizinkan dari Canva.");
      }
      const { enabled = false } = await chrome.storage.local.get("enabled");
      if (!enabled || Date.now() - lastSnap < 120) return { ok: true, skipped: true };
      lastSnap = Date.now();
    }
    return native(message.type === "ping" ? "ping" : "alignment");
  })().then(respond, (error) => respond({ ok: false, error: error.message }));
  return true;
});
