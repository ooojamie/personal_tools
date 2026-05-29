const REFRESH_ALARM = "tls-slot-monitor-refresh";
const DEFAULTS = {
  enabled: false,
  refreshSeconds: 300
};

function normalizedRefreshSeconds(value) {
  return Math.max(180, Math.min(1800, Number(value || DEFAULTS.refreshSeconds)));
}

function nextRefreshIso(refreshSeconds) {
  return new Date(Date.now() + refreshSeconds * 1000).toISOString();
}

async function configureRefreshAlarm(options = {}) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  const refreshSeconds = normalizedRefreshSeconds(settings.refreshSeconds);
  const existingAlarm = await chrome.alarms.get(REFRESH_ALARM);

  if (!settings.enabled) {
    await chrome.alarms.clear(REFRESH_ALARM);
    await chrome.storage.local.set({ nextRefreshAt: "" });
    return { enabled: false, nextRefreshAt: "" };
  }

  if (existingAlarm && !options.force) {
    const nextRefreshAt = new Date(existingAlarm.scheduledTime).toISOString();
    await chrome.storage.local.set({ nextRefreshAt });
    return { enabled: true, nextRefreshAt };
  }

  await chrome.alarms.clear(REFRESH_ALARM);
  await chrome.alarms.create(REFRESH_ALARM, {
    delayInMinutes: refreshSeconds / 60,
    periodInMinutes: refreshSeconds / 60
  });
  const nextRefreshAt = nextRefreshIso(refreshSeconds);
  await chrome.storage.local.set({ nextRefreshAt });
  return { enabled: true, nextRefreshAt };
}

async function refreshAppointmentTabs() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  if (!settings.enabled) return;

  const refreshSeconds = normalizedRefreshSeconds(settings.refreshSeconds);
  const tabs = await chrome.tabs.query({
    url: [
      "https://visas-fr.tlscontact.com/workflow/appointment-booking/*",
      "https://visas-fr.tlscontact.com/*/workflow/appointment-booking*",
      "https://visas-fr.tlscontact.com/*workflow/appointment-booking*"
    ]
  });

  const now = new Date().toISOString();
  const nextRefreshAt = nextRefreshIso(refreshSeconds);

  for (const tab of tabs) {
    if (tab.id !== undefined) {
      try {
        await chrome.tabs.reload(tab.id);
      } catch (_) {
        // The tab may have closed between query and reload.
      }
    }
  }

  const refreshState = {
    nextRefreshAt,
    refreshTabCount: tabs.length
  };
  if (tabs.length > 0) {
    refreshState.lastRefreshAt = now;
  }
  await chrome.storage.local.set(refreshState);
}

chrome.runtime.onInstalled.addListener(configureRefreshAlarm);
chrome.runtime.onStartup.addListener(configureRefreshAlarm);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled || changes.refreshSeconds) {
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

  if (message.type !== "tls-slot-found") return;

  const dates = Array.isArray(message.dates) ? message.dates.join(", ") : "matching dates";
  const tabId = sender && sender.tab ? sender.tab.id : undefined;

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: "TLS appointment slot found",
    message: `Possible appointment before cutoff: ${dates}`,
    priority: 2
  });

  if (tabId !== undefined) {
    chrome.storage.local.set({ lastHitTabId: tabId });
  }
});
