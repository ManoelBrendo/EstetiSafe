const { z } = require('zod')

const imageDataUrlSchema = z.union([z.string().trim().startsWith('data:image/').max(8_000_000), z.null()])

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
})

const clientShape = {
  fullName: z.string().trim().min(2).max(160).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(8).max(30),
  birthDate: z.string().trim().optional().or(z.literal('')),
  cpf: z.string().trim().optional(),
  photoDataUrl: imageDataUrlSchema.optional(),
  sex: z.string().trim().max(30).optional(),
  maritalStatus: z.string().trim().max(60).optional(),
  profession: z.string().trim().max(120).optional(),
  addressFull: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(4000).optional(),
}

const clientCreateSchema = z.object(clientShape).superRefine((value, context) => {
  if (!(value.fullName?.trim() || value.name?.trim())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fullName'],
      message: 'Informe o nome completo.',
    })
  }
})

const clientUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(8).max(30).optional(),
  birthDate: z.string().trim().optional().or(z.literal('')),
  cpf: z.string().trim().optional(),
  photoDataUrl: imageDataUrlSchema.optional(),
  sex: z.string().trim().max(30).optional(),
  maritalStatus: z.string().trim().max(60).optional(),
  profession: z.string().trim().max(120).optional(),
  addressFull: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(4000).optional(),
})

const anamnesisUpsertSchema = z.object({
  client: z.object({
    fullName: z.string().trim().min(2).max(160).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: z.string().trim().min(8).max(30).optional(),
    birthDate: z.string().trim().optional().or(z.literal('')),
    cpf: z.string().trim().optional(),
    photoDataUrl: imageDataUrlSchema.optional(),
    sex: z.string().trim().max(30).optional(),
    maritalStatus: z.string().trim().max(60).optional(),
    profession: z.string().trim().max(120).optional(),
    addressFull: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(4000).optional(),
  }).optional(),
  answers: z.record(z.any()),
})

const protocolStatusSchema = z.enum(['draft', 'active', 'completed', 'cancelled'])

const protocolServiceSchema = z.object({
  id: z.string().trim().min(2).max(120).optional(),
  serviceId: z.number().int().positive().optional(),
  customServiceName: z.string().trim().min(2).max(200).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  sessions: z.number().int().min(1).max(99),
  description: z.string().trim().max(4000).optional(),
  adverseEffects: z.string().trim().max(4000).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
}).superRefine((value, context) => {
  if (!(value.serviceId || value.customServiceName?.trim() || value.name?.trim())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'Cada item do protocolo precisa ter um servico ou nome informado.',
    })
  }
})

const protocolUpsertSchema = z.object({
  protocolName: z.string().trim().min(2).max(200).optional(),
  treatmentObjective: z.string().trim().max(2000).optional(),
  recommendations: z.string().trim().max(4000).optional(),
  guidelines: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: protocolStatusSchema.optional(),
  sessionCount: z.number().int().min(1).max(99).optional(),
  sessionInterval: z.string().trim().max(300).optional(),
  productsUsed: z.string().trim().max(2000).optional(),
  equipmentsUsed: z.string().trim().max(2000).optional(),
  services: z.array(protocolServiceSchema).max(50).optional(),
}).superRefine((value, context) => {
  if (!(value.protocolName?.trim() || value.services?.length)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['protocolName'],
      message: 'Informe o nome do protocolo ou ao menos um servico.',
    })
  }
})

const paymentMethodSchema = z.enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BANK_TRANSFER'])
const paymentStatusSchema = z.enum(['PENDING', 'PAID', 'REFUNDED', 'CANCELLED'])

const paymentCreateSchema = z.object({
  appointmentId: z.number().int().positive(),
  amount: z.number().min(0),
  method: paymentMethodSchema,
  status: paymentStatusSchema.optional(),
  paidAt: z.string().trim().optional(),
})

const paymentUpdateSchema = z.object({
  amount: z.number().min(0).optional(),
  method: paymentMethodSchema.optional(),
  status: paymentStatusSchema.optional(),
  paidAt: z.string().trim().optional().or(z.literal('')),
}).refine(
  value => Object.values(value).some(item => item !== undefined),
  {
    message: 'Informe ao menos um campo para atualizar o pagamento.',
    path: ['status'],
  }
)

module.exports = {
  loginSchema,
  clientCreateSchema,
  clientUpdateSchema,
  anamnesisUpsertSchema,
  protocolStatusSchema,
  protocolServiceSchema,
  protocolUpsertSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
}
