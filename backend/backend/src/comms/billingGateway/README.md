# Billing gateway module

This module contains the TypeScript contracts for the financial gateway layer.

Main pieces:
- `types.ts`: shared response, webhook and intent shapes used by billing gateway flows.
- `state.ts`: normalized statuses, payment methods and display labels for safer UI/API integration.

Runtime note:
- The current backend still runs from `server.js` in CommonJS.
- `src/legacy/billingGateway.js` exposes the active runtime behavior while the backend TypeScript migration continues.

Production checklist:
- Connect a real provider adapter for Pix, card and recurring billing.
- Persist provider ids and webhook payloads for reconciliation.
- Keep webhook secrets outside source control.
- Add provider-specific signature validation before accepting payment events.
