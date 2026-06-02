const DEFAULTS = {
  enabled: false,
  cutoffDate: "2026-06-20",
  refreshSeconds: 300,
  weekdays: [],
  startTime: "",
  endTime: "",
  sound: true
};
const REFRESH_ALARM = "tls-slot-monitor-refresh";

const fields = {
  enabled: document.getElementById("enabled"),
  cutoffDate: document.getElementById("cutoffDate"),
  refreshSeconds: document.getElementById("refreshSeconds"),
  weekdayChips: [...document.querySelectorAll(".weekday-chip")],
  startTime: document.getElementById("startTime"),
  endTime: document.getElementById("endTime"),
  sound: document.getElementById("sound"),
  scanNow: document.getElementById("scanNow"),
  countdownValue: document.getElementById("countdownValue"),
  countdownLabel: document.getElementById("countdownLabel"),
  enabledLabel: document.getElementById("enabledLabel"),
  lastRefresh: document.getElementById("lastRefresh"),
  noSlots: document.getElementById("noSlots"),
  seenDates: document.getElementById("seenDates"),
  lastHit: document.getElementById("lastHit"),
  status: document.getElementById("status")
};

let latestStatus = {};
let countdownTimer = null;

function formatLocalTime(value) {
  if (!value) return "not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatCountdown(value) {
  if (!value) return "paused";
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return "unknown";
  if (ms <= 0) return "now";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderStatus(data) {
  latestStatus = data;
  fields.countdownValue.textContent = formatCountdown(data.nextRefreshAt);
  fields.countdownLabel.textContent = "Next refresh";
  fields.enabledLabel.textContent = fields.enabled.checked ? "On" : "Off";
  fields.lastRefresh.textContent = formatLocalTime(data.lastRefreshAt);
  fields.noSlots.textContent = data.lastNoSlotsMessage === null
    ? "unknown"
    : (data.lastNoSlotsMessage === false ? "not visible" : "visible");

  if (Array.isArray(data.lastHitDates) && data.lastHitDates.length) {
    fields.lastHit.textContent = `${data.lastHitDates.join(", ")} at ${formatLocalTime(data.lastHitAt)}`;
  } else {
    fields.lastHit.textContent = "none";
  }

  if (Array.isArray(data.lastSeenDates) && data.lastSeenDates.length) {
    fields.seenDates.textContent = data.lastSeenDates.slice(0, 3).join(", ");
  } else {
    fields.seenDates.textContent = "none";
  }
  fields.status.textContent = "";
  fields.status.style.display = "none";
}

function selectedWeekdays() {
  return fields.weekdayChips
    .filter((button) => button.classList.contains("is-selected"))
    .map((button) => Number(button.dataset.day));
}

function renderWeekdays(days) {
  const selected = new Set(Array.isArray(days) ? days.map(Number) : []);
  fields.weekdayChips.forEach((button) => {
    button.classList.toggle("is-selected", selected.has(Number(button.dataset.day)));
  });
}

async function saveSettings() {
  await chrome.storage.local.set({
    enabled: fields.enabled.checked,
    cutoffDate: fields.cutoffDate.value || DEFAULTS.cutoffDate,
    refreshSeconds: Number(fields.refreshSeconds.value),
    weekdays: selectedWeekdays(),
    startTime: fields.startTime.value || "",
    endTime: fields.endTime.value || "",
    sound: fields.sound.checked
  });
  updateStatus();
}

async function updateStatus() {
  const data = await chrome.storage.local.get({
    ...DEFAULTS,
    lastRefreshAt: "",
    lastHitAt: "",
    nextRefreshAt: "",
    lastHitDates: [],
    lastSeenDates: [],
    lastNoSlotsMessage: null
  });
  renderStatus(data);
}

function readRefreshAlarm() {
  chrome.alarms.get(REFRESH_ALARM, (alarm) => {
    if (chrome.runtime.lastError) return;
    if (!alarm) {
      chrome.storage.local.set({ nextRefreshAt: "" }, updateStatus);
      return;
    }
    const nextRefreshAt = new Date(alarm.scheduledTime).toISOString();
    chrome.storage.local.set({ nextRefreshAt }, updateStatus);
  });
}

async function scanNow() {
  fields.status.style.display = "block";
  fields.status.textContent = "Refreshing appointment page...";
  fields.scanNow.disabled = true;

  chrome.runtime.sendMessage({ type: "tls-refresh-now" }, (response) => {
    fields.scanNow.disabled = false;

    if (chrome.runtime.lastError) {
      fields.status.textContent = "Refresh failed. Reload the extension and try again.";
      return;
    }

    if (!response || response.reason === "disabled") {
      fields.status.textContent = "Turn the monitor on first.";
      return;
    }

    if (!response.refreshed) {
      fields.status.textContent = "Open the TLS appointment page first.";
      latestStatus = { ...latestStatus, nextRefreshAt: response.nextRefreshAt };
      fields.countdownValue.textContent = formatCountdown(response.nextRefreshAt);
      return;
    }

    latestStatus = {
      ...latestStatus,
      lastRefreshAt: response.lastRefreshAt,
      nextRefreshAt: response.nextRefreshAt
    };
    renderStatus(latestStatus);
    fields.status.style.display = "block";
    fields.status.textContent = `Refreshed ${response.tabCount} appointment page.`;
  });
}

chrome.storage.local.get(DEFAULTS, (data) => {
  fields.enabled.checked = Boolean(data.enabled);
  fields.cutoffDate.value = data.cutoffDate || DEFAULTS.cutoffDate;
  fields.refreshSeconds.value = String(data.refreshSeconds || DEFAULTS.refreshSeconds);
  renderWeekdays(data.weekdays || []);
  fields.startTime.value = data.startTime || "";
  fields.endTime.value = data.endTime || "";
  fields.sound.checked = data.sound !== false;
  readRefreshAlarm();
  updateStatus();
});

for (const key of ["enabled", "cutoffDate", "refreshSeconds", "startTime", "endTime", "sound"]) {
  fields[key].addEventListener("change", saveSettings);
}

fields.weekdayChips.forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("is-selected");
    saveSettings();
  });
});

fields.scanNow.addEventListener("click", scanNow);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const displayKeys = [
    "lastRefreshAt",
    "lastHitAt",
    "nextRefreshAt",
    "lastHitDates",
    "lastSeenDates",
    "lastNoSlotsMessage"
  ];
  if (!displayKeys.some((key) => key in changes)) return;
  updateStatus();
});

countdownTimer = setInterval(() => {
  if (Object.keys(latestStatus).length > 0) {
    renderStatus(latestStatus);
  }
}, 1000);
