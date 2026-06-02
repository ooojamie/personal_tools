const REFRESH_ALARM = "tls-slot-monitor-refresh";
const DEFAULTS = {
  enabled: false,
  refreshSeconds: 300,
  refreshPaused: false
};

function normalizedRefreshSeconds(value) {
  return Math.max(180, Math.min(1800, Number(value || DEFAULTS.refreshSeconds)));
}

function nextRefreshIso(refreshSeconds) {
  return new Date(Date.now() + refreshSeconds * 1000).toISOString();
}

async function createRefreshAlarm(refreshSeconds) {
  await chrome.alarms.clear(REFRESH_ALARM);
  await chrome.alarms.create(REFRESH_ALARM, {
    delayInMinutes: refreshSeconds / 60,
    periodInMinutes: refreshSeconds / 60
  });
  const nextRefreshAt = nextRefreshIso(refreshSeconds);
  await chrome.storage.local.set({ nextRefreshAt });
  return nextRefreshAt;
}

async function configureRefreshAlarm(options = {}) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  const refreshSeconds = normalizedRefreshSeconds(settings.refreshSeconds);
  const existingAlarm = await chrome.alarms.get(REFRESH_ALARM);

  if (!settings.enabled || settings.refreshPaused) {
    await chrome.alarms.clear(REFRESH_ALARM);
    await chrome.storage.local.set({ nextRefreshAt: "" });
    return { enabled: Boolean(settings.enabled), paused: Boolean(settings.refreshPaused), nextRefreshAt: "" };
  }

  if (existingAlarm && !options.force) {
    const nextRefreshAt = new Date(existingAlarm.scheduledTime).toISOString();
    await chrome.storage.local.set({ nextRefreshAt });
    return { enabled: true, nextRefreshAt };
  }

  const nextRefreshAt = await createRefreshAlarm(refreshSeconds);
  return { enabled: true, nextRefreshAt };
}

async function refreshAppointmentTabs(options = {}) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  if (!settings.enabled) {
    return { refreshed: false, tabCount: 0, reason: "disabled", nextRefreshAt: "" };
  }
  if (settings.refreshPaused) {
    return { refreshed: false, tabCount: 0, reason: "paused", nextRefreshAt: "" };
  }

  const refreshSeconds = normalizedRefreshSeconds(settings.refreshSeconds);
  const tabs = await chrome.tabs.query({
    url: [
      "https://visas-fr.tlscontact.com/workflow/appointment-booking/*",
      "https://visas-fr.tlscontact.com/*/workflow/appointment-booking*",
      "https://visas-fr.tlscontact.com/*workflow/appointment-booking*"
    ]
  });

  const now = new Date().toISOString();
  const nextRefreshAt = options.resetAlarm
    ? await createRefreshAlarm(refreshSeconds)
    : nextRefreshIso(refreshSeconds);
  let refreshedCount = 0;

  for (const tab of tabs) {
    if (tab.id !== undefined) {
      try {
        await chrome.tabs.reload(tab.id);
        refreshedCount += 1;
      } catch (_) {
        // The tab may have closed between query and reload.
      }
    }
  }

  const refreshState = {
    nextRefreshAt,
    refreshTabCount: refreshedCount
  };
  if (refreshedCount > 0) {
    refreshState.lastRefreshAt = now;
  }
  await chrome.storage.local.set(refreshState);
  return {
    refreshed: refreshedCount > 0,
    tabCount: refreshedCount,
    lastRefreshAt: refreshedCount > 0 ? now : "",
    nextRefreshAt
  };
}

async function pauseRefresh(reason) {
  await chrome.alarms.clear(REFRESH_ALARM);
  const now = new Date().toISOString();
  await chrome.storage.local.set({
    nextRefreshAt: "",
    refreshPaused: true,
    refreshPauseReason: reason,
    authStatus: reason,
    authStatusAt: now
  });
  return { paused: true, reason, authStatusAt: now };
}

async function resumeRefresh() {
  await chrome.storage.local.set({
    refreshPaused: false,
    refreshPauseReason: "",
    authStatus: "monitoring",
    authStatusAt: new Date().toISOString()
  });
  return configureRefreshAlarm({ force: true });
}

function notifyAuth(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title,
    message,
    priority: 2
  });
}

chrome.runtime.onInstalled.addListener(configureRefreshAlarm);
chrome.runtime.onStartup.addListener(configureRefreshAlarm);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled || changes.refreshSeconds || changes.refreshPaused) {
    configureRefreshAlarm({ force: true });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshAppointmentTabs();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "tls-monitor-sync") {
    configureRefreshAlarm({ force: Boolean(message.force) }).then(sendResponse);
    return true;
  }

  if (message.type === "tls-refresh-now") {
    refreshAppointmentTabs({ resetAlarm: true }).then(sendResponse);
    return true;
  }

  if (message.type === "tls-auth-state") {
    const status = String(message.status || "");
    if (status === "monitoring") {
      resumeRefresh().then(sendResponse);
      return true;
    }
    if (["login-needed", "login-assisting", "manual-login-needed", "verification-needed"].includes(status)) {
      pauseRefresh(status).then((response) => {
        if (status === "verification-needed") {
          notifyAuth("TLS verification needed", "Manual verification is required before monitoring can continue.");
        } else if (status === "manual-login-needed") {
          notifyAuth("TLS login needed", "Automatic login assist did not complete. Please log in manually.");
        }
        sendResponse(response);
      });
      return true;
    }
  }

  if (message.type !== "tls-slot-found") return;

  const dates = Array.isArray(message.dates) ? message.dates.join(", ") : "matching dates";
  const slots = Array.isArray(message.slots) && message.slots.length
    ? message.slots.slice(0, 3).join(", ")
    : dates;
  const tabId = sender && sender.tab ? sender.tab.id : undefined;

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: "TLS appointment slot found",
    message: `Possible match: ${slots}`,
    priority: 2
  });

  if (tabId !== undefined) {
    chrome.storage.local.set({ lastHitTabId: tabId });
  }
});
