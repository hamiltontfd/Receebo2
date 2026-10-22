# Gmail OAuth setup

Google sign-in and Gmail receipt access are separate authorizations.
For the Google OAuth web client used by the Gmail integration, register this
exact **Authorized redirect URI** in Google Cloud Console → Google Auth Platform
→ Clients:

```
https://receebo.net/api/gmail/callback
```

This belongs in redirect URIs, not JavaScript origins. Scheme, host, path and
trailing slash must match exactly. Keep any development callback registered as
a separate entry if development Gmail testing is needed.

The server deliberately uses the canonical published domain in production,
including when visited through a secondary deployment domain. If the canonical
domain changes, update the Gmail origin configuration and Google's allowed
redirect URIs together.

An `Error 400: redirect_uri_mismatch` happens before Gmail authorization:
it does not mean the account lacks owner access or needs a subscription.
After updating Google settings and publishing code changes, start a fresh
connection from Receebo Settings rather than retrying an old Google error URL.
