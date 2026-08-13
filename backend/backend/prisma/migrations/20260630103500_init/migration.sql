-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'SIGNED', 'REVOKED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'OVERDUE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketingLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ClinicDocumentCategory" AS ENUM ('LEGAL', 'SANITARY', 'CLIENTS', 'WASTE');

-- CreateEnum
CREATE TYPE "InventoryEntryMode" AS ENUM ('NEW', 'EXISTING');

-- CreateEnum
CREATE TYPE "ProfessionalContractType" AS ENUM ('CLT', 'PJ', 'AUTONOMA', 'COMISSIONADA', 'PARCERIA');

-- CreateEnum
CREATE TYPE "ProfessionalPaymentModel" AS ENUM ('FIXED', 'COMMISSION', 'HYBRID', 'DAILY');

-- CreateEnum
CREATE TYPE "ProfessionalDocumentCategory" AS ENUM ('CONTRACT', 'CERTIFICATION', 'COUNCIL', 'TRAINING', 'PERMISSION');

-- CreateEnum
CREATE TYPE "AuditCorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingGatewayIntentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingGatewayMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "WhatsappMessageDirection" AS ENUM ('OUTBOUND', 'INBOUND', 'STATUS');

-- CreateEnum
CREATE TYPE "WhatsappMessageType" AS ENUM ('TEMPLATE', 'TEXT', 'INTERACTIVE', 'STATUS', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "WhatsappMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED', 'CONFIRMED', 'DECLINED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "clinicName" TEXT NOT NULL,
    "clinicLogoDataUrl" TEXT,
    "clinicOperationalScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
    "billingAmount" DECIMAL(10,2),
    "billingGraceEndsAt" TIMESTAMP(3),
    "billingLastPaidAt" TIMESTAMP(3),
    "billingNextDueAt" TIMESTAMP(3),
    "billingReference" TEXT,
    "billingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_leads" (
    "id" SERIAL NOT NULL,
    "clinicName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "teamSize" TEXT,
    "mainGoal" TEXT,
    "message" TEXT,
    "requestedDemo" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "status" "MarketingLeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "logoDataUrl" TEXT,
    "status" "ClinicStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_subscriptions" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
    "amount" DECIMAL(10,2),
    "graceEndsAt" TIMESTAMP(3),
    "lastPaidAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "actorUserId" INTEGER,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_corrective_actions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "taskKey" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "domainTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueLabel" TEXT,
    "dueAt" TIMESTAMP(3),
    "evidence" TEXT,
    "actionUrl" TEXT,
    "riskLevel" TEXT NOT NULL,
    "status" "AuditCorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_corrective_action_attachments" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "actionId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "fileDataUrl" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_corrective_action_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "cpf" TEXT,
    "photoDataUrl" TEXT,
    "sex" TEXT,
    "maritalStatus" TEXT,
    "profession" TEXT,
    "addressFull" TEXT,
    "notes" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facial_points" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "pointId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facial_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "photoDataUrl" TEXT,
    "availability" JSONB,
    "contractType" "ProfessionalContractType",
    "paymentModel" "ProfessionalPaymentModel",
    "salaryAmount" DECIMAL(10,2),
    "commissionRate" DECIMAL(5,2),
    "payrollBonusAmount" DECIMAL(10,2),
    "payrollDiscountAmount" DECIMAL(10,2),
    "paymentDay" INTEGER,
    "payrollNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_documents" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "professionalId" INTEGER NOT NULL,
    "category" "ProfessionalDocumentCategory" NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "fileDataUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "professionalId" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anamneses" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anamneses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "professionalId" INTEGER,
    "title" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL DEFAULT 'v1',
    "termText" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "signerName" TEXT,
    "signerDocument" TEXT,
    "professionalName" TEXT,
    "signatureDataUrl" TEXT,
    "signatureHash" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT,
    "signedUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_intercurrences" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "serviceId" INTEGER,
    "professionalId" INTEGER,
    "procedureName" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "conduct" TEXT NOT NULL,
    "notes" TEXT,
    "professionalName" TEXT NOT NULL,
    "createdByUserId" INTEGER,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_intercurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_intercurrence_edits" (
    "id" SERIAL NOT NULL,
    "intercurrenceId" INTEGER NOT NULL,
    "editedByUserId" INTEGER,
    "editedByEmail" TEXT,
    "editReason" TEXT,
    "changes" JSONB NOT NULL,
    "snapshotBefore" JSONB,
    "snapshotAfter" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_intercurrence_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_pops" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_pops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_documents" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "category" "ClinicDocumentCategory" NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT,
    "fileDataUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_items" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "batch" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "entryMode" "InventoryEntryMode" NOT NULL DEFAULT 'NEW',
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_items" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "anvisaRegistration" TEXT,
    "notificationNumber" TEXT,
    "processNumber" TEXT,
    "entryMode" "InventoryEntryMode" NOT NULL DEFAULT 'NEW',
    "acquiredAt" TIMESTAMP(3),
    "maintenanceDueAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_bills" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_gateway_intents" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "method" "BillingGatewayMethod" NOT NULL,
    "status" "BillingGatewayIntentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "dueAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "checkoutUrl" TEXT,
    "pixCopyPaste" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_gateway_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_gateway_events" (
    "id" SERIAL NOT NULL,
    "intentId" INTEGER,
    "clinicId" INTEGER,
    "reference" TEXT,
    "provider" TEXT,
    "eventType" TEXT NOT NULL,
    "status" "BillingGatewayIntentStatus",
    "payload" JSONB,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_gateway_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_clinic_configs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'pt_BR',
    "appointmentTemplateName" TEXT NOT NULL DEFAULT 'appointment_confirmation',
    "consentTemplateName" TEXT NOT NULL DEFAULT 'consent_link',
    "graphApiVersion" TEXT NOT NULL DEFAULT 'v21.0',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_clinic_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "configId" INTEGER,
    "appointmentId" INTEGER,
    "consentRecordId" INTEGER,
    "direction" "WhatsappMessageDirection" NOT NULL,
    "messageType" "WhatsappMessageType" NOT NULL,
    "providerMessageId" TEXT,
    "recipientPhone" TEXT,
    "senderPhone" TEXT,
    "templateName" TEXT,
    "status" "WhatsappMessageStatus",
    "payload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "receivedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "marketing_leads_status_createdAt_idx" ON "marketing_leads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_leads_email_createdAt_idx" ON "marketing_leads"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_ownerUserId_key" ON "clinics"("ownerUserId");

-- CreateIndex
CREATE INDEX "clinics_status_createdAt_idx" ON "clinics"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_subscriptions_clinicId_key" ON "clinic_subscriptions"("clinicId");

-- CreateIndex
CREATE INDEX "clinic_subscriptions_status_nextDueAt_idx" ON "clinic_subscriptions"("status", "nextDueAt");

-- CreateIndex
CREATE INDEX "audit_logs_clinicId_createdAt_idx" ON "audit_logs"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_corrective_actions_userId_status_idx" ON "audit_corrective_actions"("userId", "status");

-- CreateIndex
CREATE INDEX "audit_corrective_actions_userId_domainId_idx" ON "audit_corrective_actions"("userId", "domainId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_corrective_actions_userId_taskKey_key" ON "audit_corrective_actions"("userId", "taskKey");

-- CreateIndex
CREATE INDEX "audit_corrective_action_attachments_userId_actionId_created_idx" ON "audit_corrective_action_attachments"("userId", "actionId", "createdAt");

-- CreateIndex
CREATE INDEX "clients_userId_idx" ON "clients"("userId");

-- CreateIndex
CREATE INDEX "facial_points_clientId_idx" ON "facial_points"("clientId");

-- CreateIndex
CREATE INDEX "professionals_userId_idx" ON "professionals"("userId");

-- CreateIndex
CREATE INDEX "professional_documents_userId_professionalId_category_idx" ON "professional_documents"("userId", "professionalId", "category");

-- CreateIndex
CREATE INDEX "professional_documents_userId_expiresAt_idx" ON "professional_documents"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "services_userId_idx" ON "services"("userId");

-- CreateIndex
CREATE INDEX "appointments_userId_startAt_endAt_idx" ON "appointments"("userId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "appointments_userId_professionalId_startAt_idx" ON "appointments"("userId", "professionalId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_clientId_idx" ON "appointments"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_appointmentId_key" ON "payments"("appointmentId");

-- CreateIndex
CREATE INDEX "anamneses_clientId_idx" ON "anamneses"("clientId");

-- CreateIndex
CREATE INDEX "consent_records_userId_clientId_idx" ON "consent_records"("userId", "clientId");

-- CreateIndex
CREATE INDEX "consent_records_clientId_createdAt_idx" ON "consent_records"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "consent_records_professionalId_idx" ON "consent_records"("professionalId");

-- CreateIndex
CREATE INDEX "clinical_intercurrences_userId_occurredAt_idx" ON "clinical_intercurrences"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "clinical_intercurrences_userId_clientId_occurredAt_idx" ON "clinical_intercurrences"("userId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "clinical_intercurrences_userId_professionalId_occurredAt_idx" ON "clinical_intercurrences"("userId", "professionalId", "occurredAt");

-- CreateIndex
CREATE INDEX "clinical_intercurrences_userId_serviceId_occurredAt_idx" ON "clinical_intercurrences"("userId", "serviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "clinical_intercurrence_edits_intercurrenceId_createdAt_idx" ON "clinical_intercurrence_edits"("intercurrenceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_pops_serviceId_key" ON "service_pops"("serviceId");

-- CreateIndex
CREATE INDEX "service_pops_userId_createdAt_idx" ON "service_pops"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "clinic_documents_userId_category_createdAt_idx" ON "clinic_documents"("userId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "clinic_documents_userId_expiresAt_idx" ON "clinic_documents"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "product_items_userId_expiresAt_idx" ON "product_items"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "product_items_userId_createdAt_idx" ON "product_items"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "equipment_items_userId_maintenanceDueAt_idx" ON "equipment_items"("userId", "maintenanceDueAt");

-- CreateIndex
CREATE INDEX "equipment_items_userId_createdAt_idx" ON "equipment_items"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "clinic_bills_userId_dueAt_idx" ON "clinic_bills"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "clinic_bills_userId_paidAt_idx" ON "clinic_bills"("userId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_gateway_intents_reference_key" ON "billing_gateway_intents"("reference");

-- CreateIndex
CREATE INDEX "billing_gateway_intents_clinicId_createdAt_idx" ON "billing_gateway_intents"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "billing_gateway_intents_userId_status_idx" ON "billing_gateway_intents"("userId", "status");

-- CreateIndex
CREATE INDEX "billing_gateway_intents_status_dueAt_idx" ON "billing_gateway_intents"("status", "dueAt");

-- CreateIndex
CREATE INDEX "billing_gateway_events_intentId_processedAt_idx" ON "billing_gateway_events"("intentId", "processedAt");

-- CreateIndex
CREATE INDEX "billing_gateway_events_clinicId_processedAt_idx" ON "billing_gateway_events"("clinicId", "processedAt");

-- CreateIndex
CREATE INDEX "billing_gateway_events_reference_idx" ON "billing_gateway_events"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_clinic_configs_userId_key" ON "whatsapp_clinic_configs"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_clinic_configs_phoneNumberId_idx" ON "whatsapp_clinic_configs"("phoneNumberId");

-- CreateIndex
CREATE INDEX "whatsapp_clinic_configs_active_createdAt_idx" ON "whatsapp_clinic_configs"("active", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_logs_userId_createdAt_idx" ON "whatsapp_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_logs_configId_createdAt_idx" ON "whatsapp_logs"("configId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_logs_appointmentId_idx" ON "whatsapp_logs"("appointmentId");

-- CreateIndex
CREATE INDEX "whatsapp_logs_consentRecordId_idx" ON "whatsapp_logs"("consentRecordId");

-- CreateIndex
CREATE INDEX "whatsapp_logs_providerMessageId_idx" ON "whatsapp_logs"("providerMessageId");

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_subscriptions" ADD CONSTRAINT "clinic_subscriptions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_corrective_actions" ADD CONSTRAINT "audit_corrective_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_corrective_action_attachments" ADD CONSTRAINT "audit_corrective_action_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_corrective_action_attachments" ADD CONSTRAINT "audit_corrective_action_attachments_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "audit_corrective_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facial_points" ADD CONSTRAINT "facial_points_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_documents" ADD CONSTRAINT "professional_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_documents" ADD CONSTRAINT "professional_documents_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_intercurrences" ADD CONSTRAINT "clinical_intercurrences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_intercurrences" ADD CONSTRAINT "clinical_intercurrences_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_intercurrences" ADD CONSTRAINT "clinical_intercurrences_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_intercurrences" ADD CONSTRAINT "clinical_intercurrences_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_intercurrence_edits" ADD CONSTRAINT "clinical_intercurrence_edits_intercurrenceId_fkey" FOREIGN KEY ("intercurrenceId") REFERENCES "clinical_intercurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pops" ADD CONSTRAINT "service_pops_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pops" ADD CONSTRAINT "service_pops_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_documents" ADD CONSTRAINT "clinic_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_items" ADD CONSTRAINT "product_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_bills" ADD CONSTRAINT "clinic_bills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_gateway_intents" ADD CONSTRAINT "billing_gateway_intents_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_gateway_intents" ADD CONSTRAINT "billing_gateway_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_gateway_events" ADD CONSTRAINT "billing_gateway_events_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "billing_gateway_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_gateway_events" ADD CONSTRAINT "billing_gateway_events_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_clinic_configs" ADD CONSTRAINT "whatsapp_clinic_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_configId_fkey" FOREIGN KEY ("configId") REFERENCES "whatsapp_clinic_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "consent_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;