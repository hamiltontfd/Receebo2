---
name: Google login branding
description: Why production Google sign-in and Gmail receipt imports use separate Google Cloud projects.
---

Keep production Google sign-in in a separate Google Cloud project from Gmail receipt imports. Configure sign-in credentials through Replit's production Users & Auth provider settings, not the Gmail environment secrets.

**Why:** The user wants Receebo rather than Replit on Google's login screen. Replit-managed shared Google credentials display Replit. The existing Gmail project is in Testing; coupling sign-in branding to its audience and restricted permissions risks disrupting receipt imports or public login.

**How to apply:** Preserve the Gmail project's credentials and publishing status during login changes. Read the exact origins and callback URLs from the production provider editor. Google can display the application domain instead of its configured display name until brand verification is approved; do not promise the exact name before verifying the actual Google screen.
