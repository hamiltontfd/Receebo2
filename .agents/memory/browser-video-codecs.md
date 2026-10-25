---
name: Browser video codec availability
description: Replit's installed Chromium may not decode H.264 even when ffmpeg can.
---

Do not treat successful H.264 export or ffmpeg decoding as proof that the installed
browser can play an MP4.

**Why:** The workspace Chromium build was observed to report an empty
`canPlayType('video/mp4; codecs="avc1.42E01E"')` despite valid H.264 files. VP9 was
supported. A playback promise can stall rather than produce an immediate error.

**How to apply:** Check codec support in the actual browser used for verification,
provide a compatible alternative, and bound playback checks with a timeout.
Keep MP4 for browsers that need it; don't infer a corrupt export from a
codec-limited test browser alone.
