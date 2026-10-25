const $ = (id) => document.getElementById(id);
function status(text, error = false) {
  $("status").textContent = text;
  $("status").dataset.error = String(error);
}
async function canva(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Buka tab editor Canva terlebih dahulu.");
  try { return await chrome.tabs.sendMessage(tab.id, message); }
  catch { throw new Error("Buka editor Canva lalu reload tab setelah memasang extension."); }
}
function action(id, handler) {
  $(id).addEventListener("click", async () => {
    $(id).disabled = true;
    try { await handler(); }
    catch (error) { status(error.message, true); }
    finally { $(id).disabled = false; }
  });
}

$("extension-id").textContent = chrome.runtime.id;
chrome.storage.local.get(["enabled", "selector", "safeAreaSelector", "objectSelector"]).then((settings) => {
  $("enabled").checked = settings.enabled === true;
  $("selector").value = settings.selector || "";
  $("safe-area-selector").value = settings.safeAreaSelector || "";
  $("object-selector").value = settings.objectSelector || "";
});
for (const [id, type] of [["test", "test-haptic"], ["ping", "ping"]]) {
  action(id, async () => {
    status("Menghubungi helper…");
    const response = await chrome.runtime.sendMessage({ type });
    if (!response?.ok) throw new Error(response?.error || "Helper tidak merespons.");
    status(type === "ping" ? `Helper terhubung (${response.version}).` : "Perintah ketukan dikirim. Apakah terasa di trackpad?");
  });
}
action("diagnose", async () => {
  await canva({ type: "diagnose" });
  status("Rekaman dimulai. Tutup popup, lalu drag objek di Canva selama 15 detik.");
});
action("report", async () => {
  const report = await canva({ type: "diagnostic-report" });
  $("report-output").hidden = false;
  $("report-output").value = JSON.stringify(report, null, 2);
  status(report.recording ? "Masih merekam. Ambil laporan lagi setelah 15 detik." : `${report.candidates.length} kandidat. Salin laporan untuk diperiksa.${report.lastError ? `\n${report.lastError}` : ""}`);
});
action("save", async () => {
  const selector = $("selector").value.trim();
  const safeAreaSelector = $("safe-area-selector").value.trim();
  const objectSelector = $("object-selector").value.trim();
  const enabled = $("enabled").checked;
  if (Boolean(safeAreaSelector) !== Boolean(objectSelector)) throw new Error("Isi kedua selector safe area, atau kosongkan keduanya.");
  if (enabled && !selector && !safeAreaSelector) throw new Error("Isi selector snap atau pasangan selector safe area terverifikasi terlebih dahulu.");
  for (const css of [selector, safeAreaSelector, objectSelector].filter(Boolean)) {
    try { document.querySelector(css); }
    catch { throw new Error("Ada selector CSS yang tidak valid."); }
  }
  await chrome.storage.local.set({ enabled, selector, safeAreaSelector, objectSelector });
  status(enabled ? "Aktif. Ketukan saat garis snap baru atau sentuhan tepi safe area terdeteksi." : "Tersimpan. Haptic otomatis nonaktif.");
});
