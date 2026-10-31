---
name: Market GeoIP proxy trust
description: Why market suggestion must fail closed on internal-only proxy paths.
---
Trust forwarding headers only after verifying the actual network path, not
because the app runs behind a managed proxy. Workspace probes exposed only
internal addresses even when public forwarding headers were fabricated.

**Why:** An internal proxy address cannot establish a visitor's country, and
trusting a client-prepended address would turn an IP hint into attacker input.

**How to apply:** Recheck production topology independently before configuring
trusted proxy networks. Preserve the manual-choice fallback when no verified
public visitor address is available; never replace unknown with Portugal.

The user requires the market inferred by IP to appear preselected and the
site language to follow the browser, independently of that market.

**Why:** The user reiterated this separation when the unlocalized, oversized
market selector appeared on the public homepage.

**How to apply:** Display a valid IP suggestion immediately without silently
confirming it. Use browser language for localized copy, never for market
inference. If the proxy makes IP location unavailable, explain that limitation
instead of displaying an invented country.

The user authorized an external IP lookup to resolve location in the preview.

**Why:** The user explicitly chose “Autorizar consulta externa de IP” after being
informed that an external service receives the visitor's IP.

**How to apply:** A country-only lookup must run in the visitor's browser, not
on the server (which would locate the server). Preserve preference priority,
discard the returned IP, disclose the service and fail back to manual choice.
This is a market suggestion, not permission for precise location or tracking.
