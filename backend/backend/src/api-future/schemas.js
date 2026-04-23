const { z } = require('zod')

const uuidSchema = z.string().uuid()
const optionalShortText = max => z.string().trim().max(max).optional().or(z.literal(''))
const optionalLongText = max => z.string().trim().max(max).optional().or(z.literal(''))
const optionalEmail = z.string().trim().email().optional().or(z.literal(''))
const optionalDateString = z.string().trim().max(80).optional().or(z.literal(''))

const clientStatusSchema = z.enum(['active', 'inactive', 'archived'])
const protocolStatusSchema = z.enum(['draft', 'active', 'completed', 'cancelled'])
const appointmentStatusSchema = z.enum(['scheduled', 'arrived', 'in_service', 'completed', 'cancelled'])
const paymentStatusSchema = z.enum(['pending', 'paid', 'failed', 'refunded'])
const documentTypeSchema = z.enum(['protocol_summary', 'full_medical_record', 'treatment_report'])
const messageTypeSchema = z.enum(['appointment_confirmation', 'protocol_summary', 'post_care', 'reminder', 'manual_message'])
const deliveryStatusSchema = z.enum(['pending', 'sent', 'delivered', 'failed', 'read'])
const evaluationTypeSchema = z.enum(['acne', 'melasma', 'flacidez', 'oleosidade', 'manchas', 'textura', 'poros', 'sensibilidade', 'outro'])

const clientCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  cpf: optionalShortText(14),
  birthDate: optionalDateString,
  phone: optionalShortText(20),
  email: optionalEmail,
  emergencyContactName: optionalShortText(160),
  emergencyContactPhone: optionalShortText(20),
  status: clientStatusSchema.optional(),
})

const clientUpdateSchema = clientCreateSchema.partial().refine(
  value => Object.values(value).some(item => item !== undefined),
  {
    message: 'Informe ao menos um campo para atualizar o cliente.',
    path: ['fullName'],
  }
)

const aestheticHistoryEntrySchema = z.object({
  procedureName: z.string().trim().min(2).max(200),
  procedureDate: optionalDateString,
  notes: optionalLongText(4000),
  complications: optionalLongText(4000),
})

const aestheticEvaluationSchema = z.object({
  evaluationType: evaluationTypeSchema,
  classification: optionalShortText(120),
  intensity: optionalShortText(120),
  level: optionalShortText(120),
  notes: optionalLongText(4000),
})

const anamnesisUpsertSchema = z.object({
  chiefComplaint: optionalLongText(4000),
  expectations: optionalLongText(4000),
  treatmentObjective: optionalLongText(4000),
  workoutsPerWeek: z.coerce.number().int().min(0).max(21).optional(),
  smoking: z.boolean().optional(),
  alcoholUse: z.boolean().optional(),
  waterIntakeLiters: z.union([z.coerce.number().min(0).max(20), z.literal('')]).optional(),
  sleepQuality: optionalShortText(120),
  allergies: optionalLongText(4000),
  medications: optionalLongText(4000),
  diseases: optionalLongText(4000),
  surgeries: optionalLongText(4000),
  pregnancyStatus: optionalShortText(120),
  aestheticHistory: z.array(aestheticHistoryEntrySchema).max(50).optional(),
  aestheticEvaluations: z.array(aestheticEvaluationSchema).max(50).optional(),
})

const protocolServiceSchema = z.object({
  serviceId: uuidSchema,
  customServiceName: optionalShortText(200),
  sessions: z.coerce.number().int().min(1).max(99),
  description: optionalLongText(4000),
  adverseEffects: optionalLongText(4000),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
})

const protocolCreateSchema = z.object({
  clientId: uuidSchema,
  protocolName: z.string().trim().min(2).max(200),
  recommendations: optionalLongText(4000),
  guidelines: optionalLongText(4000),
  notes: optionalLongText(4000),
  treatmentObjective: optionalLongText(4000),
  status: protocolStatusSchema.optional(),
  services: z.array(protocolServiceSchema).max(50).optional(),
})

const protocolUpdateSchema = protocolCreateSchema.omit({ clientId: true }).partial().refine(
  value => Object.values(value).some(item => item !== undefined),
  {
    message: 'Informe ao menos um campo para atualizar o protocolo.',
    path: ['protocolName'],
  }
)

const appointmentCreateSchema = z.object({
  clientId: uuidSchema,
  protocolId: uuidSchema.optional().or(z.literal('')),
  scheduledAt: z.string().trim().min(4).max(80),
  status: appointmentStatusSchema.optional(),
  hasArrived: z.boolean().optional(),
  arrivedAt: optionalDateString,
  notes: optionalLongText(4000),
})

const appointmentStatusUpdateSchema = z.object({
  status: appointmentStatusSchema,
  hasArrived: z.boolean().optional(),
  arrivedAt: optionalDateString,
  notes: optionalLongText(4000),
})

const paymentCreateSchema = z.object({
  clientId: uuidSchema,
  medicalRecordId: uuidSchema.optional().or(z.literal('')),
  protocolId: uuidSchema.optional().or(z.literal('')),
  amount: z.coerce.number().min(0),
  paymentMethod: optionalShortText(60),
  paymentStatus: paymentStatusSchema.optional(),
  paidAt: optionalDateString,
  externalReference: optionalShortText(160),
})

const paymentUpdateSchema = z.object({
  amount: z.coerce.number().min(0).optional(),
  paymentMethod: optionalShortText(60),
  paymentStatus: paymentStatusSchema.optional(),
  paidAt: optionalDateString,
  externalReference: optionalShortText(160),
}).refine(
  value => Object.values(value).some(item => item !== undefined),
  {
    message: 'Informe ao menos um campo para atualizar o pagamento.',
    path: ['paymentStatus'],
  }
)

const documentCreateSchema = z.object({
  clientId: uuidSchema,
  medicalRecordId: uuidSchema.optional().or(z.literal('')),
  protocolId: uuidSchema.optional().or(z.literal('')),
  fileName: z.string().trim().min(2).max(200),
  fileUrl: z.string().trim().url(),
  documentType: documentTypeSchema,
})

const messageCreateSchema = z.object({
  clientId: uuidSchema,
  protocolId: uuidSchema.optional().or(z.literal('')),
  clinicPhone: z.string().trim().min(8).max(40),
  clientPhone: z.string().trim().min(8).max(40),
  messageType: messageTypeSchema,
  messageBody: z.string().trim().min(2).max(10000),
  sentAt: optionalDateString,
  deliveryStatus: deliveryStatusSchema.optional(),
})

module.exports = {
  clientCreateSchema,
  clientUpdateSchema,
  anamnesisUpsertSchema,
  aestheticEvaluationSchema,
  protocolCreateSchema,
  protocolUpdateSchema,
  appointmentCreateSchema,
  appointmentStatusUpdateSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  documentCreateSchema,
  messageCreateSchema,
}
