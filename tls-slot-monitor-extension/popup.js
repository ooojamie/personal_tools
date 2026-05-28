const DEFAULTS = {
  enabled: false,
  cutoffDate: "2026-06-20",
  refreshSeconds: 300,
  sound: true
};

const fields = {
  enabled: document.getElementById("enabled"),
  cutoffDate: document.getElementById("cutoffDate"),
  refreshSeconds: document.getElementById("refreshSeconds"),
  sound: document.getElementById("sound"),
  scanNow: document.getElementById("scanNow"),
  status: document.getElementById("status")
};

function renderStatus(data) {
  const lines = [];
  lines.push(`Last scan: ${data.lastScanAt || "not yet"}`);
  lines.push(`No-slots message: ${data.lastNoSlotsMessage === false ? "not visible" : "visible/unknown"}`);
  if (Array.isArray(data.lastHitDates) && data.lastHitDates.length) {
    lines.push(`Last hit: ${data.lastHitDates.join(", ")}`);
    lines.push(`Hit time: ${data.lastHitAt || "unknown"}`);
  }
  if (Array.isArray(data.lastSeenDates) && data.lastSeenDates.length) {
    lines.push(`Seen dates: ${data.lastSeenDates.slice(0, 8).join(", ")}`);
  }
  fields.status.textContent = lines.join("\n");
}

async function saveSettings() {
  await chrome.storage.local.set({
    enabled: fields.enabled.checked,
    cutoffDate: fields.cutoffDate.value || DEFAULTS.cutoffDate,
    refreshSeconds: Number(fields.refreshSeconds.value),
    sound: fields.sound.checked
  });
  updateStatus();
}

async function updateStatus() {
  const data = await chrome.storage.local.get({
    ...DEFAULTS,
    lastScanAt: "",
    lastHitAt: "",
    lastHitDates: [],
    lastSeenDates: [],
    lastNoSlotsMessage: null
  });
  renderStatus(data);
}

async function scanActiveTab() {
  fields.status.textContent = "Scanning current tab...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !/visas-fr\.tlscontact\.com/.test(tab.url || "")) {
    fields.status.textContent = "Open the TLS appointment page first.";
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "tls-monitor-status" }, (response) => {
    if (chrome.runtime.lastError) {
      fields.status.textContent = "Refresh the TLS appointment page, then try again.";
      return;
    }
    fields.status.textContent =
      `Enabled: ${response.enabled}\n` +
      `Cutoff: ${response.cutoffDate}\n` +
      `Matching dates: ${(response.matchingDates || []).join(", ") || "none"}\n` +
      `Visible slots: ${(response.slotLabels || []).slice(0, 5).join(", ") || "none"}\n` +
      `No-slots message: ${response.noSlots}`;
  });
}

chrome.storage.local.get(DEFAULTS, (data) => {
  fields.enabled.checked = Boolean(data.enabled);
  fields.cutoffDate.value = data.cutoffDate || DEFAULTS.cutoffDate;
  fields.refreshSeconds.value = String(data.refreshSeconds || DEFAULTS.refreshSeconds);
  fields.sound.checked = data.sound !== false;
  updateStatus();
});

for (const key of ["enabled", "cutoffDate", "refreshSeconds", "sound"]) {
  fields[key].addEventListener("change", saveSettings);
}

fields.scanNow.addEventListener("click", scanActiveTab);
