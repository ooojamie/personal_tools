(function () {
  const DEFAULTS = {
    enabled: false,
    cutoffDate: "2026-06-20",
    refreshSeconds: 300,
    sound: true,
    lastAlertKey: ""
  };

  let state = { ...DEFAULTS };
  let timerId = null;
  let scanId = null;

  function isoToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeSettings(raw) {
    const refreshSeconds = Number(raw.refreshSeconds || DEFAULTS.refreshSeconds);
    return {
      enabled: Boolean(raw.enabled),
      cutoffDate: String(raw.cutoffDate || DEFAULTS.cutoffDate),
      refreshSeconds: Math.max(180, Math.min(1800, refreshSeconds)),
      sound: raw.sound !== false,
      lastAlertKey: String(raw.lastAlertKey || "")
    };
  }

  function extractAvailableDates() {
    const appointmentScripts = [...document.scripts]
      .map((script) => script.textContent || "")
      .filter((content) => /availableAppointments|appointmentSlots|available_slots/i.test(content));
    const combined = appointmentScripts.length > 0
      ? appointmentScripts.join("\n")
      : (document.documentElement ? document.documentElement.innerHTML : "");

    const isoDates = new Set();
    const matches = combined.match(/20\d{2}-(0[1-9]|1[0-2])-[0-3]\d/g) || [];
    for (const date of matches) {
      isoDates.add(date);
    }

    return [...isoDates].sort();
  }

  function findMatchingDates() {
    const today = isoToday();
    return extractAvailableDates().filter((date) => date >= today && date <= state.cutoffDate);
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

  async function scan() {
    if (!state.enabled) return;

    const matchingDates = findMatchingDates();
    const slotLabels = enabledSlotButtons();
    const noSlots = hasVisibleNoSlotsMessage();

    await chrome.storage.local.set({
      lastScanAt: new Date().toISOString(),
      lastSeenDates: extractAvailableDates().slice(0, 80),
      lastSeenSlotLabels: slotLabels.slice(0, 20),
      lastNoSlotsMessage: noSlots
    });

    if (matchingDates.length > 0) {
      await alertFound(matchingDates, slotLabels);
    } else if (extractAvailableDates().length === 0 && !noSlots && slotLabels.length > 0) {
      await alertFound(["visible-slot"], slotLabels);
    }
  }

  function schedule() {
    clearTimeout(timerId);
    clearInterval(scanId);

    if (!state.enabled) return;

    scan();
    scanId = setInterval(scan, 15000);
    timerId = setTimeout(() => {
      location.reload();
    }, state.refreshSeconds * 1000);
  }

  chrome.storage.local.get(DEFAULTS, (raw) => {
    state = normalizeSettings(raw);
    schedule();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = { ...state };
    for (const [key, change] of Object.entries(changes)) {
      next[key] = change.newValue;
    }
    state = normalizeSettings(next);
    schedule();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "tls-monitor-status") return;
    scan().then(() => {
      sendResponse({
        enabled: state.enabled,
        cutoffDate: state.cutoffDate,
        refreshSeconds: state.refreshSeconds,
        matchingDates: findMatchingDates(),
        slotLabels: enabledSlotButtons(),
        noSlots: hasVisibleNoSlotsMessage()
      });
    });
    return true;
  });
})();
