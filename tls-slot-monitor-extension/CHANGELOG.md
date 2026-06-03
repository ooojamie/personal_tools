# Updates

## 2026-06-02

- Fixed login pause handling so the popup shows `paused` while login or
  verification handling is active, even if an old refresh time exists.
- Added login assist: refresh pauses on login or verification pages, ordinary
  login buttons are tried once, and monitoring resumes after returning to the
  appointment page.
- Replaced the extension icon with a blue ring and green slot center mark, plus
  standard Chrome icon sizes.
- Refined the popup header so the product name, local badge, and monitor
  context feel closer to the rest of the interface.
- Kept status values compact while showing both the last-hit detection time and
  appointment dates, using the same seconds-level time format as last refresh.
- Restored the clearer `Sound alert` label.
- Compact popup layout: smaller next-refresh display, last-refresh summary near
  the countdown, and tighter status rows.
- Combined the sound toggle and manual scan action into one row.
- Added weekday and time-window filters for local appointment alerts.
- Switched time-window controls to half-hour options.
