(function () {
  const DEFAULTS = {
    enabled: false,
    cutoffDate: "2026-06-20",
    refreshSeconds: 300,
    weekdays: [],
    startTime: "",
    endTime: "",
    sound: true,
    lastAlertKey: ""
  };

  let state = { ...DEFAULTS };

  function isoToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeSettings(raw) {
    const refreshSeconds = Number(raw.refreshSeconds || DEFAULTS.refreshSeconds);
    return {
      enabled: Boolean(raw.enabled),
      cutoffDate: String(raw.cutoffDate || DEFAULTS.cutoffDate),
      refreshSeconds: Math.max(180, Math.min(1800, refreshSeconds)),
      weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.map(Number).filter((day) => day >= 0 && day <= 6) : [],
      startTime: /^\d{2}:\d{2}$/.test(raw.startTime || "") ? raw.startTime : "",
      endTime: /^\d{2}:\d{2}$/.test(raw.endTime || "") ? raw.endTime : "",
      sound: raw.sound !== false,
      lastAlertKey: String(raw.lastAlertKey || "")
    };
  }

  function appointmentText() {
    const appointmentScripts = [...document.scripts]
      .map((script) => script.textContent || "")
      .filter((content) => /availableAppointments|appointmentSlots|available_slots/i.test(content));
    return appointmentScripts.length > 0
      ? appointmentScripts.join("\n")
      : (document.documentElement ? document.documentElement.innerHTML : "");
  }

  function extractAvailableDates() {
    const combined = appointmentText();

    const isoDates = new Set();
    const matches = combined.match(/20\d{2}-(0[1-9]|1[0-2])-[0-3]\d/g) || [];
    for (const date of matches) {
      isoDates.add(date);
    }

    return [...isoDates].sort();
  }

  function dateWeekday(date) {
    return new Date(`${date}T12:00:00`).getDay();
  }

  function hasWeekdayFilter() {
    return state.weekdays.length > 0;
  }

  function hasTimeFilter() {
    return Boolean(state.startTime || state.endTime);
  }

  function dateMatchesFilters(date) {
    const today = isoToday();
    if (date < today || date > state.cutoffDate) return false;
    return !hasWeekdayFilter() || state.weekdays.includes(dateWeekday(date));
  }

  function timeMatchesFilters(time) {
    if (!hasTimeFilter()) return true;
    if (!time) return false;
    if (state.startTime && time < state.startTime) return false;
    if (state.endTime && time > state.endTime) return false;
    return true;
  }

  function findMatchingDates() {
    return extractAvailableDates().filter(dateMatchesFilters);
  }

  function hasVisibleNoSlotsMessage() {
    const text = document.body ? document.body.innerText : "";
    return /No slots are currently available|don.t have any appointment slots available/i.test(text);
  }

  function enabledSlotButtons() {
    return [...document.querySelectorAll("button:not([disabled])")]
      .map((button) => (button.innerText || button.getAttribute("aria-label") || "").trim())
      .filter((label) => /\b\d{2}:\d{2}\b/.test(label) && !/slot unavailable/i.test(label));
  }

  function timeFromLabel(label) {
    const match = String(label || "").match(/\b([0-2]\d:[0-5]\d)\b/);
    if (!match) return "";
    const [hour] = match[1].split(":").map(Number);
    return hour <= 23 ? match[1] : "";
  }

  function extractStructuredSlots() {
    const combined = appointmentText();
    const dateMatches = [...combined.matchAll(/20\d{2}-(0[1-9]|1[0-2])-[0-3]\d/g)];
    const slots = [];

    dateMatches.forEach((match, index) => {
      const date = match[0];
      const sectionStart = match.index || 0;
      const sectionEnd = dateMatches[index + 1] ? dateMatches[index + 1].index : sectionStart + 800;
      const section = combined.slice(sectionStart, Math.min(sectionEnd, sectionStart + 800));
      const times = [...new Set((section.match(/\b[0-2]\d:[0-5]\d\b/g) || [])
        .filter((time) => Number(time.slice(0, 2)) <= 23))];

      if (times.length === 0) {
        slots.push({ date, time: "", label: date });
      } else {
        times.forEach((time) => slots.push({ date, time, label: `${date} ${time}` }));
      }
    });

    const unique = new Map();
    for (const slot of slots) {
      unique.set(`${slot.date}|${slot.time}`, slot);
    }
    return [...unique.values()].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }

  function findMatchingSlots() {
    const structuredSlots = extractStructuredSlots()
      .filter((slot) => dateMatchesFilters(slot.date) && timeMatchesFilters(slot.time));
    if (structuredSlots.length > 0) return structuredSlots;

    const dates = findMatchingDates();
    const slotLabels = enabledSlotButtons();
    const matchingLabels = slotLabels.filter((label) => timeMatchesFilters(timeFromLabel(label)));

    if (hasTimeFilter()) {
      if (dates.length === 0 || matchingLabels.length === 0) return [];
      return dates.flatMap((date) => matchingLabels.map((label) => ({
        date,
        time: timeFromLabel(label),
        label: `${date} ${label}`
      })));
    }

    return dates.map((date) => ({ date, time: "", label: date }));
  }

  function currentPageLoadIso() {
    const loadedAt = Number(window.performance && window.performance.timeOrigin);
    return new Date(Number.isFinite(loadedAt) ? loadedAt : Date.now()).toISOString();
  }

  async function recordPageLoad() {
    const pageLoadedAt = currentPageLoadIso();
    const stored = await chrome.storage.local.get({ lastRefreshAt: "" });
    if (!stored.lastRefreshAt || new Date(stored.lastRefreshAt).getTime() < new Date(pageLoadedAt).getTime()) {
      await chrome.storage.local.set({ lastRefreshAt: pageLoadedAt });
    }
  }

  function playBeep() {
    if (!state.sound) return;
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audio.close();
      }, 450);
    } catch (_) {
      // Browser may block audio until the user has interacted with the page.
    }
  }

  async function alertFound(dates, slotLabels) {
    const key = `${dates.join(",")}|${slotLabels.slice(0, 5).join(",")}`;
    if (key && key === state.lastAlertKey) return;

    state.lastAlertKey = key;
    await chrome.storage.local.set({
      lastAlertKey: key,
      lastHitAt: new Date().toISOString(),
      lastHitDates: dates,
      lastHitSlots: slotLabels.slice(0, 20),
      lastHitUrl: location.href
    });

    playBeep();
    chrome.runtime.sendMessage({
      type: "tls-slot-found",
      dates,
      slots: slotLabels.slice(0, 20),
      url: location.href
    });
  }

  async function checkPage() {
    if (!state.enabled) return;

    const matchingSlots = findMatchingSlots();
    const matchingDates = [...new Set(matchingSlots.map((slot) => slot.date))];
    const matchingSlotLabels = matchingSlots
      .map((slot) => slot.label)
      .filter(Boolean);
    const slotLabels = enabledSlotButtons();
    const noSlots = hasVisibleNoSlotsMessage();

    await chrome.storage.local.set({
      lastPageCheckAt: new Date().toISOString(),
      lastSeenDates: extractAvailableDates().slice(0, 80),
      lastSeenSlotLabels: slotLabels.slice(0, 20),
      lastNoSlotsMessage: noSlots
    });

    if (matchingSlots.length > 0) {
      await alertFound(matchingDates, matchingSlotLabels);
    } else if (
      extractAvailableDates().length === 0 &&
      !noSlots &&
      !hasWeekdayFilter() &&
      slotLabels.some((label) => timeMatchesFilters(timeFromLabel(label)))
    ) {
      await alertFound(["visible-slot"], slotLabels.filter((label) => timeMatchesFilters(timeFromLabel(label))));
    }
  }

  function schedule() {
    if (!state.enabled) {
      chrome.storage.local.set({ nextRefreshAt: "" });
      chrome.runtime.sendMessage({ type: "tls-monitor-sync", force: true });
      return;
    }

    chrome.runtime.sendMessage({ type: "tls-monitor-sync" });
    recordPageLoad();
    checkPage();
  }

  chrome.storage.local.get(DEFAULTS, (raw) => {
    state = normalizeSettings(raw);
    schedule();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const settingsChanged = ["enabled", "cutoffDate", "refreshSeconds", "weekdays", "startTime", "endTime", "sound", "lastAlertKey"]
      .some((key) => key in changes);
    if (!settingsChanged) return;

    const next = { ...state };
    for (const [key, change] of Object.entries(changes)) {
      next[key] = change.newValue;
    }
    state = normalizeSettings(next);
    if ("enabled" in changes || "refreshSeconds" in changes) {
      schedule();
    } else if ("cutoffDate" in changes || "weekdays" in changes || "startTime" in changes || "endTime" in changes) {
      checkPage();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "tls-monitor-status") return;
    Promise.all([
      checkPage(),
      chrome.storage.local.get({ lastRefreshAt: "", nextRefreshAt: "" })
    ]).then(([, data]) => {
      sendResponse({
        enabled: state.enabled,
        cutoffDate: state.cutoffDate,
        refreshSeconds: state.refreshSeconds,
        weekdays: state.weekdays,
        startTime: state.startTime,
        endTime: state.endTime,
        lastRefreshAt: data.lastRefreshAt,
        nextRefreshAt: data.nextRefreshAt,
        matchingDates: findMatchingDates(),
        slotLabels: enabledSlotButtons(),
        noSlots: hasVisibleNoSlotsMessage()
      });
    });
    return true;
  });
})();
