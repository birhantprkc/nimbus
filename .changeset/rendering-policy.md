---
"@cloudflare/nimbus-docs": minor
---

Add collection-level build and request rendering policy.

Configure a default rendering mode and per-collection overrides. Nimbus validates collection names and production server compatibility, applies the policy only to canonical collection catch-all routes, and explains intentional request routes in build diagnostics. Request-rendered prose and API routes use response-aware page helpers, with API page models prepared during content sync so Workers never read or parse the source OpenAPI spec.
