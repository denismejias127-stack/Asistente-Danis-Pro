---
name: Live chat provider responses
description: Response-format behavior from the external provider used by the live chat.
---

The live chat provider can return a plain-text body even when the request asks for a non-streaming JSON response. The client route must accept both a JSON envelope and raw text.

**Why:** Assuming every successful response is JSON caused valid AI replies to become a visible send error.

**How to apply:** Parse the response body as text first, try JSON as an optional envelope, and use the raw body as the assistant reply when JSON parsing fails.