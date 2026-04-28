# WhatsApp notifications module

This module contains the TypeScript structure for the official WhatsApp Business API integration.

Main pieces:
- `WhatsAppProvider.ts`: sends Meta Message Templates using Bearer Token authentication.
- `webhooks.ts`: verifies Meta webhooks and processes delivery statuses or client replies.
- `jobs.ts`: provides the appointment confirmation job and a `node-cron` compatible registration helper.

Runtime note:
- The current backend still runs from `server.js` in CommonJS.
- `src/legacy/whatsapp.js` exposes the same behavior for the existing runtime while the backend TypeScript migration continues.

Production checklist:
- Store `accessTokenEncrypted` with real encryption, not plain text.
- Run Prisma migration/generate after updating `schema.prisma`.
- Configure approved Meta templates for appointment confirmation and consent links.
- Set `WHATSAPP_VERIFY_TOKEN` in the environment before validating the webhook in Meta Business.
