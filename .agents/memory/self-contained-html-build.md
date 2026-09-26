---
name: Self-contained HTML builds
description: Constraints for shipping this app as one HTML file while retaining backend API calls.
---

Inline the generated client assets into the HTML, but keep the hashed files available as compatibility fallbacks for cached pages. When using String.replace with generated JavaScript or CSS, use a function replacement so `$` sequences in the generated content are not interpreted as replacement tokens. Place the inline client script after the root element; an inline `defer` attribute is not reliable for delaying execution.

**Why:** Generated bundle text contains `$` sequences, and executing a classic inline script in the head can run before `#root` exists. Either issue produces a blank app even though the server returns HTTP 200.

**How to apply:** Keep API requests relative so credentials stay server-side, replace the Vite asset tags with inline contents using callback replacements, and verify the app through the running workflow rather than only checking the build output.