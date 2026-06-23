---
name: integration-health-prod
description: Live status of prod integrations (verified 2026-06-22) and the FedEx Track API gap
metadata:
  type: project
---

Prod integrations verified live 2026-06-22 (hitting each provider's auth endpoint with the `.env` creds):

- **FedEx OAuth** ✅ (apis.fedex.com, token scope `CXS-TP`) — Ship/Rate work.
- **DHL** ✅ reachable/auth ok.
- **Tap** ✅ secret key accepted (POST /charges → 400 "values empty", not 401). NOTE: Tap has no `GET /charges` list endpoint — the old `testTap` used it and always 404'd; fixed to probe `GET /charges/{sentinel}`.
- **Zoho OAuth** ✅ refresh token valid (token-ok). Invoice create/update now send `ignore_auto_number_generation=true`.
- **Gemini** ✅ (model listing 200).
- **SMTP** ✅ smtp.hostinger.com:465 verify ok.

**Open gap — FedEx Track API not entitled:** `POST /track/v1/trackingnumbers` returns `403 FORBIDDEN.ERROR "We could not authorize your credentials"` even though OAuth succeeds. The prod FedEx project's token scope (`CXS-TP`) lacks Track. Effect: the express tracking-refresh scheduler fails every run and spams `tracking_refresh_failed` attention flags; express carrier statuses don't auto-update. Fix is EXTERNAL — enable the Track API on the FedEx project at developer.fedex.com (not a code bug). See [[prod-deploy-topology]].
