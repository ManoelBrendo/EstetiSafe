# Current Backend vs Target API Map

This file documents how the current L'Appui backend maps to the future normalized Prisma schema.
It is intentionally practical: it shows what already exists, what is missing, and how `/api/v2`
bridges the current runtime without breaking the SaaS.

## Goal

- keep the production backend stable
- document the delta between current schema and target schema
- create a safe migration path for the future general API
- make the bridge explicit for auth, clients, medical records, anamnesis, protocols, payments, and PDF

## Current runtime schema summary

### Already present in the current backend

- `User`
- `Clinic`
- `ClinicSubscription`
- `AuditLog`
- `Client`
- `Service`
- `Professional`
- `Appointment`
- `Payment`
- `Anamnesis` as JSON payload in `answers`
- `ConsentRecord`
- `ServicePop`
- `ClinicDocument`
- `ProductItem`
- `EquipmentItem`
- `ClinicBill`

### Business rules already implemented in the current runtime

- support login and clinic impersonation
- clinic billing block for overdue subscriptions
- client medical record lock after payment confirmation
- read-only protection for locked records
- automatic POP generation for services
- PDF medical record export from the legacy route

## Target future schema summary

### Expected normalized modules

- `Client`
- `MedicalRecord`
- `Anamnesis`
- `AestheticHistory`
- `AestheticEvaluation`
- `Protocol`
- `ProtocolService`
- `Appointment`
- `Payment`
- `PdfDocument`
- `WhatsappMessage`
- `AuditLog`

## Main gaps

### Data model gaps

- there is no `MedicalRecord` table yet
- there is no normalized `AestheticHistory`
- there is no normalized `AestheticEvaluation`
- there is no physical `Protocol`
- there is no physical `ProtocolService`
- there is no `PdfDocument`
- there is no `WhatsappMessage`

### Behavioral gaps

- anamnesis is versioned as raw JSON, not split into relational sections
- payments are linked to `Appointment`, not directly to `MedicalRecord`
- the future API expects medical-record-first flows, while the current runtime is client-first

## Practical bridge used by `/api/v2`

### Auth

Current source:

- `User`
- `Clinic`
- `ClinicSubscription`
- support env credentials
- JWT payload already used by the runtime

Bridge decision:

- reuse the current JWT contract
- preserve support login and support impersonation
- preserve billing block behavior
- expose a modular auth layer in `/api/v2/auth`

### Clients

Current source:

- `Client`
- latest `Anamnesis`
- latest `ConsentRecord`
- `Appointment`
- `Payment`

Bridge decision:

- keep the current `Client` model as source of truth
- expose cleaner client list, detail, overview, timeline, and medical-record views
- translate `name` to `fullName` in API responses where useful

### Medical record

Current source:

- `Client.isPaid`
- `Client.isLocked`
- `Client.lockedAt`
- `Anamnesis[]`
- `Appointment[]`
- `Payment` through appointments
- `ConsentRecord[]`

Bridge decision:

- create a virtual medical record assembled from current tables
- use client lock flags as the current legal source of truth
- expose access-state and summary endpoints in `/api/v2/medical-records`

### Anamnesis

Current source:

- `Anamnesis.answers` as JSON
- client data duplicated between `Client` and `answers.identification`

Bridge decision:

- keep persistence in the current `anamneses` table
- create new versions instead of destructive overwrite
- allow `/api/v2` to update client identification fields from the payload
- preserve professional signature resolution when `professionalId` is sent

### Protocols

Current source:

- `Anamnesis.answers.treatmentPlan`
- `Service`
- `ServicePop`

Bridge decision:

- expose `Protocol` and `ProtocolService` as virtual records on top of `treatmentPlan`
- persist protocol changes by creating a new anamnesis version
- keep `treatmentPlan.services` aligned with the current front-end structure
- expose a service catalog endpoint to support future protocol builders

### Payments

Current source:

- `Payment`
- `Appointment`
- `Client.isPaid`
- `Client.isLocked`
- `Client.lockedAt`

Bridge decision:

- preserve appointment-linked payment persistence for now
- expose modular `/api/v2/payments` routes
- keep the legal lock behavior in the backend when payment becomes `PAID`

### PDF

Current source:

- legacy PDF generator helpers inside `server.js`
- `GET /clients/:clientId/prontuario/pdf`
- `GET /services/:id/pop/pdf`

Bridge decision:

- reuse the current PDF renderers
- expose modular download routes in `/api/v2/pdf`
- keep visual and legal output unchanged while the API evolves

## Route coverage map

### Current legacy runtime

- `POST /auth/login`
- `GET /auth/me`
- `GET /clients`
- `POST /clients`
- `PUT /clients/:id`
- `GET /clients/:clientId/anamnesis`
- `POST /clients/:clientId/anamnesis`
- `GET /clients/:clientId/prontuario/pdf`
- `POST /payments`
- `PUT /payments/:id`
- `GET /services/:id/pop`
- `GET /services/:id/pop/pdf`

### New modular compatibility layer

- `GET /api/v2/health`
- `POST /api/v2/auth/login`
- `GET /api/v2/auth/me`
- `GET /api/v2/clients`
- `POST /api/v2/clients`
- `GET /api/v2/clients/:id`
- `PATCH /api/v2/clients/:id`
- `GET /api/v2/clients/:id/overview`
- `GET /api/v2/clients/:id/timeline`
- `GET /api/v2/clients/:id/medical-record`
- `GET /api/v2/medical-records/by-client/:clientId`
- `GET /api/v2/medical-records/by-client/:clientId/summary`
- `GET /api/v2/medical-records/by-client/:clientId/access-state`
- `GET /api/v2/medical-records/by-client/:clientId/anamnesis`
- `PUT /api/v2/medical-records/by-client/:clientId/anamnesis`
- `GET /api/v2/protocols/service-catalog`
- `GET /api/v2/protocols/service-catalog/:serviceId/pop`
- `GET /api/v2/protocols/by-client/:clientId`
- `GET /api/v2/protocols/by-client/:clientId/current`
- `PUT /api/v2/protocols/by-client/:clientId`
- `GET /api/v2/payments/by-client/:clientId`
- `GET /api/v2/payments/:id`
- `POST /api/v2/payments`
- `PATCH /api/v2/payments/:id`
- `GET /api/v2/pdf/medical-records/by-client/:clientId`
- `GET /api/v2/pdf/service-pops/by-service/:serviceId`

## Migration guidance for the future normalized schema

### Phase 1

- keep writing to the current schema
- let `/api/v2` standardize response contracts
- use virtual medical record and virtual protocol objects

### Phase 2

- add normalized tables (`MedicalRecord`, `AestheticHistory`, `AestheticEvaluation`, `Protocol`, `ProtocolService`)
- dual-write from `/api/v2` to both legacy and normalized structures when safe
- backfill old anamnesis JSON into normalized sections

### Phase 3

- move front-end integrations from legacy endpoints to `/api/v2`
- deprecate direct monolithic handlers gradually
- keep PDF and legal lock behavior unchanged during the migration

## Notes

- the current monolithic `server.js` remains the runtime entrypoint
- `/api/v2` is intentionally additive and does not replace the legacy API yet
- this bridge is compatible with the user-provided future Prisma schema direction, but it does not require that schema to be active today
