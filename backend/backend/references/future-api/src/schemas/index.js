const { z } = require('zod')

const clientStatuses = ['active', 'inactive', 'archived']
const protocolStatuses = ['draft', 'active', 'completed', 'cancelled']
const appointmentStatuses = ['scheduled', 'arrived', 'in_service', 'completed', 'cancelled']
const paymentStatuses = ['pending', 'paid', 'failed', 'refunded']
const documentTypes = ['protocol_summary', 'full_medical_record', 'treatment_report']
const messageTypes = ['appointment_confirmation', 'protocol_summary', 'post_care', 'reminder', 'manual_message']
const deliveryStatuses = ['pending', 'sent', 'delivered', 'failed', 'read']
const evaluationTypes = ['acne', 'melasma', 'flacidez', 'oleosidade', 'manchas', 'textura', 'poros', 'sensibilidade', 'outro']
const actionTypes = ['create', 'update', 'delete', 'lock', 'unlock', 'generate_pdf', 'send_whatsapp', 'check_in', 'check_out']

const uuidSchema = z.string().uuid()
const optionalString = z.string().trim().min(1).optional().nullable()
const optionalDateString = z.string().trim().min(8).max(40).optional().nullable()
const optionalBoolean = z.boolean().optional().nullable()
const optionalInt = z.coerce.number().int().optional().nullable()
const optionalDecimal = z.coerce.number().optional().nullable()

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
})

const clientsListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z.enum(clientStatuses).optional(),
})

const idParamSchema = z.object({ id: uuidSchema })
const clientIdParamSchema = z.object({ clientId: uuidSchema })

const clientCreateSchema = z.object({
  fullName: z.string().trim().min(3),
  cpf: optionalString,
  birthDate: optionalDateString,
  phone: optionalString,
  email: z.string().email().optional().nullable(),
  emergencyContactName: optionalString,
  emergencyContactPhone: optionalString,
  status: z.enum(clientStatuses).optional(),
})

const clientUpdateSchema = clientCreateSchema.partial()
const clientStatusPatchSchema = z.object({
  status: z.enum(clientStatuses),
})

const anamnesisHistoryItemSchema = z.object({
  procedureName: z.string().trim().min(2),
  procedureDate: optionalDateString,
  notes: optionalString,
  complications: optionalString,
})

const anamnesisUpsertSchema = z.object({
  chiefComplaint: optionalString,
  expectations: optionalString,
  treatmentObjective: optionalString,
  workoutsPerWeek: optionalInt,
  smoking: optionalBoolean,
  alcoholUse: optionalBoolean,
  waterIntakeLiters: optionalDecimal,
  sleepQuality: optionalString,
  allergies: optionalString,
  medications: optionalString,
  diseases: optionalString,
  surgeries: optionalString,
  pregnancyStatus: optionalString,
  aestheticHistory: z.array(anamnesisHistoryItemSchema).default([]),
})

const aestheticEvaluationItemSchema = z.object({
  evaluationType: z.enum(evaluationTypes),
  classification: optionalString,
  intensity: optionalString,
  level: optionalString,
  notes: optionalString,
})

const aestheticEvaluationReplaceSchema = z.object({
  items: z.array(aestheticEvaluationItemSchema).default([]),
})

const medicalRecordLockSchema = z.object({
  lockedAt: optionalDateString,
})

const serviceCreateSchema = z.object({
  name: z.string().trim().min(2),
  description: optionalString,
  defaultSessions: z.coerce.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
})

const serviceUpdateSchema = serviceCreateSchema.partial()

const protocolServiceItemSchema = z.object({
  serviceId: uuidSchema,
  customServiceName: optionalString,
  sessions: z.coerce.number().int().min(1).max(100),
  description: optionalString,
  adverseEffects: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().min(0).optional(),
})

const protocolCreateSchema = z.object({
  clientId: uuidSchema,
  medicalRecordId: uuidSchema.optional(),
  protocolNumber: z.string().trim().min(3),
  protocolName: z.string().trim().min(3),
  recommendations: optionalString,
  guidelines: optionalString,
  notes: optionalString,
  treatmentObjective: optionalString,
  status: z.enum(protocolStatuses).optional(),
  services: z.array(protocolServiceItemSchema).default([]),
})

const protocolUpdateSchema = protocolCreateSchema.omit({ clientId: true, medicalRecordId: true, services: true }).partial()
const protocolStatusPatchSchema = z.object({
  status: z.enum(protocolStatuses),
})
const protocolServicesReplaceSchema = z.object({
  services: z.array(protocolServiceItemSchema).default([]),
})

const appointmentCreateSchema = z.object({
  clientId: uuidSchema,
  protocolId: uuidSchema.optional().nullable(),
  scheduledAt: z.string().trim().min(8),
  status: z.enum(appointmentStatuses).optional(),
  hasArrived: z.boolean().optional(),
  arrivedAt: optionalDateString,
  notes: optionalString,
})

const appointmentUpdateSchema = appointmentCreateSchema.partial().omit({ clientId: true })
const appointmentStatusPatchSchema = z.object({
  status: z.enum(appointmentStatuses),
  notes: optionalString,
})

const paymentCreateSchema = z.object({
  clientId: uuidSchema,
  medicalRecordId: uuidSchema.optional(),
  protocolId: uuidSchema.optional().nullable(),
  amount: z.coerce.number().positive(),
  paymentMethod: optionalString,
  paymentStatus: z.enum(paymentStatuses).optional(),
  paidAt: optionalDateString,
  externalReference: optionalString,
})

const paymentUpdateSchema = paymentCreateSchema.partial().omit({ clientId: true, medicalRecordId: true })
const paymentConfirmSchema = z.object({
  paidAt: optionalDateString,
  paymentMethod: optionalString,
  externalReference: optionalString,
})

const pdfDocumentCreateSchema = z.object({
  clientId: uuidSchema,
  medicalRecordId: uuidSchema,
  protocolId: uuidSchema.optional().nullable(),
  fileName: z.string().trim().min(2),
  fileUrl: z.string().trim().min(4),
  documentType: z.enum(documentTypes),
})

const whatsappMessageCreateSchema = z.object({
  clientId: uuidSchema,
  protocolId: uuidSchema.optional().nullable(),
  clinicPhone: z.string().trim().min(8),
  clientPhone: z.string().trim().min(8),
  messageType: z.enum(messageTypes),
  messageBody: z.string().trim().min(1),
  deliveryStatus: z.enum(deliveryStatuses).optional(),
  sentAt: optionalDateString,
})

const whatsappDeliveryPatchSchema = z.object({
  deliveryStatus: z.enum(deliveryStatuses),
  sentAt: optionalDateString,
})

const auditLogQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().trim().min(1).optional(),
  entityId: uuidSchema.optional(),
  actionType: z.enum(actionTypes).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

module.exports = {
  aestheticEvaluationReplaceSchema,
  appointmentCreateSchema,
  appointmentStatusPatchSchema,
  appointmentUpdateSchema,
  auditLogQuerySchema,
  clientCreateSchema,
  clientIdParamSchema,
  clientStatusPatchSchema,
  clientUpdateSchema,
  clientsListQuerySchema,
  idParamSchema,
  loginSchema,
  medicalRecordLockSchema,
  anamnesisUpsertSchema,
  paginationQuerySchema,
  paymentConfirmSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  pdfDocumentCreateSchema,
  protocolCreateSchema,
  protocolServicesReplaceSchema,
  protocolStatusPatchSchema,
  protocolUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
  whatsappDeliveryPatchSchema,
  whatsappMessageCreateSchema,
}
