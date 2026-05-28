chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "tls-slot-found") return;

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
