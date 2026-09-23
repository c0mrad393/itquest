# Security Policy

## Scope, honestly

ITQuest runs entirely in the browser. There is no server, no database, no
authentication and no network traffic to anything the project controls. Progress
is stored in your own browser's `localStorage`.

The sign-in screen is **part of the simulation**, not a security boundary — the
app says so on the screen itself. The demo credentials are printed under the
form. Please do not report it as a vulnerability.

Likewise, the admin panel at `/admin` and the instructor console at `/org` are
unauthenticated by design: they display generated sample data and have nothing
behind them. They are marked `noindex`.

## What is worth reporting

- A dependency advisory that affects a real build
- XSS or similar through content the app renders (ticket text, saved state, a
  crafted save file)
- Anything that lets a page escape the simulation and touch the host

## How

Open a [security advisory](https://github.com/c0mrad393/itquest/security/advisories/new)
rather than a public issue, and allow a reasonable window before disclosure.

This project is not actively developed, so please set your expectations for
response time accordingly. Critical issues will be looked at.
