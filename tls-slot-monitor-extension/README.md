# TLS Slot Monitor

Personal local Chrome extension for conservative appointment-page change
reminders.

This project is not affiliated with, endorsed by, or connected to TLScontact,
any visa application centre, any consulate, or any government authority.

This repository is public for backup and portability only. No license is
granted. All rights reserved.

What it does:

- Runs only in the user's own browser on appointment-booking pages.
- Refreshes matching appointment-booking tabs from the extension background
  alarm at a user-selected, conservative interval.
- Lets the user manually trigger one immediate refresh, which also restarts the
  next-refresh countdown.
- Checks the already-loaded page content for visible appointment-date data
  after the page loads.
- Sends a local desktop notification when it sees a date on or before the
  user-selected cutoff.
- Shows the last refresh time and next-refresh countdown in the popup.
- Stores scan status only in local Chrome storage.

What it does not do:

- It does not submit or book appointments.
- It does not reserve, hold, purchase, or pay for appointments.
- It does not bypass CAPTCHA, Cloudflare, rate limits, login checks, or access
  controls.
- It does not scrape bulk data or collect information about other users.
- It does not ask for, store, transmit, or manage passwords, cookies, tokens, or
  account credentials.

Use this tool only in accordance with the terms and rules of the website you
access. If the website shows a CAPTCHA, block page, warning, login expiry, or
other access-control prompt, stop and handle it manually in the browser.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:
   `tls-slot-monitor-extension`
5. Open the appointment page yourself and stay logged in.
6. Click the extension icon, set the cutoff date, and turn it on.

Conservative local settings:

- Refresh interval: `5 minutes`
- Keep the computer awake and Chrome open.

If a matching date appears, Chrome should show a notification. The user must
review the page and choose whether to continue manually.
