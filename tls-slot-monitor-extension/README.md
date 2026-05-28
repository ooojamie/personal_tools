# TLS Slot Monitor

Local Chrome extension for conservative TLScontact appointment monitoring.

What it does:

- Runs only on `https://visas-fr.tlscontact.com/workflow/appointment-booking/*`.
- Refreshes the appointment page at a user-selected interval.
- Scans page data for ISO dates such as `2026-06-10`.
- Sends a desktop notification when it sees any date on or before the cutoff.
- Logs the last scan, seen dates, and last hit in local Chrome storage.

What it does not do:

- It does not submit or book appointments.
- It does not bypass CAPTCHA, Cloudflare, or TLScontact limits.
- It does not ask for or store your TLScontact password.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:
   `C:\Users\aba56\Documents\Codex\2026-05-28\6-15-5-10-5-18\tls-slot-monitor-extension`
5. Open your TLScontact appointment page and stay logged in.
6. Click the extension icon, set the cutoff date, and turn it on.

Recommended settings for TLScontact:

- Cutoff date: `2026-06-20`
- Refresh interval: `5 minutes`
- Keep the computer awake and Chrome open.

If a slot appears, Chrome should show a notification. You still need to choose and submit the appointment yourself.
