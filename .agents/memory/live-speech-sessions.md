---
name: Live speech sessions
description: Browser speech recognition lifecycle rules for the live ChatDanis experience.
---

Treat “the user wants the mic on” and “a recognition session is currently running” as separate states. Mobile browsers can end a session after silence, so restart only after the old session has ended and never allow a second active session.

**Why:** Starting recognition from both the initial effect and the mic button can produce duplicated words or multiple simultaneous recognition sessions.

**How to apply:** Keep an explicit active-session ref, guard start calls, clear it in `onend`, and use a ref to invoke the latest restart/send callback without creating recursive hook dependencies.