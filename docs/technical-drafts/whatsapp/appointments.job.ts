/**
 * EstetiSafe — Job de Confirmação de Agendamentos
 * Arquivo: src/jobs/appointments.job.ts
 *
 * Responsabilidade:
 *   - Rodar periodicamente (ex: a cada hora)
 *   - Buscar agendamentos nas próximas 24h com status CONFIRMADO
 *   - Enfileirar um job por agendamento para disparar o template de confirmação
 *   - Um Worker separado processa cada job e envia a notificação (WhatsApp/e-mail/SMS)
 *
 * Dependências:
 *   npm install bullmq ioredis @prisma/client
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { PrismaClient, AppointmentStatus } from "@prisma/client";
import IORedis from "ioredis";

// ─── Conexão Redis ────────────────────────────────────────────────────────────
// O BullMQ exige Redis como broker. Ajuste a URL via variável de ambiente.
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null, // obrigatório para BullMQ
});

const prisma = new PrismaClient();

// ─── Tipagem do Payload do Job ────────────────────────────────────────────────
interface AppointmentJobData {
  appointmentId: string;
  clinicId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  professionalName: string;
  serviceName: string;
  scheduledAt: string; // ISO string
}

// ─── Fila Principal ───────────────────────────────────────────────────────────
export const appointmentConfirmationQueue = new Queue<AppointmentJobData>(
  "appointment-confirmation",
  {
    connection,
    defaultJobOptions: {
      attempts: 3,              // tenta até 3 vezes em caso de falha
      backoff: {
        type: "exponential",
        delay: 5_000,           // 5s → 10s → 20s
      },
      removeOnComplete: { count: 100 },  // mantém os 100 últimos jobs concluídos
      removeOnFail: { count: 50 },
    },
  }
);

// ─── Scheduler: Enfileira agendamentos das próximas 24h ──────────────────────
/**
 * Esta função é chamada pelo cron (veja o arquivo cron.scheduler.ts).
 * Ela NÃO envia notificações diretamente — apenas popula a fila.
 */
export async function scheduleUpcomingAppointments(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1_000);

  console.log(`[AppointmentJob] Buscando agendamentos entre ${now.toISOString()} e ${in24h.toISOString()}`);

  // Busca agendamentos confirmados nas próximas 24h que ainda NÃO receberam
  // notificação de confirmação (campo confirmationSentAt null).
  // Adapte os nomes dos campos ao seu schema.prisma real.
  const appointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: now, lte: in24h },
      status: AppointmentStatus.CONFIRMED,
      confirmationSentAt: null, // evita reenvio
    },
    include: {
      client: true,
      professional: true,
      service: true,
      clinic: true,
    },
  });

  console.log(`[AppointmentJob] ${appointments.length} agendamento(s) encontrado(s).`);

  for (const appt of appointments) {
    const payload: AppointmentJobData = {
      appointmentId: appt.id,
      clinicId: appt.clinicId,
      clientName: appt.client.name,
      clientPhone: appt.client.phone ?? "",
      clientEmail: appt.client.email ?? "",
      professionalName: appt.professional.name,
      serviceName: appt.service.name,
      scheduledAt: appt.scheduledAt.toISOString(),
    };

    // Adiciona o job à fila com ID único para evitar duplicatas
    await appointmentConfirmationQueue.add("send-confirmation", payload, {
      jobId: `confirm-${appt.id}`, // idempotência: mesmo job não entra duas vezes
    });

    console.log(`[AppointmentJob] Job enfileirado → Agendamento ${appt.id} (${appt.client.name})`);
  }
}

// ─── Worker: Processa cada job da fila ───────────────────────────────────────
/**
 * O Worker roda em paralelo com o scheduler.
 * Cada vez que um job entra na fila, o Worker o processa.
 *
 * Aqui você conecta com o serviço real de envio:
 *   - WhatsApp Business API (Twilio, Z-API, Evolution API...)
 *   - E-mail (Resend, SendGrid, Nodemailer...)
 *   - SMS (Twilio, AWS SNS...)
 */
export const appointmentWorker = new Worker<AppointmentJobData>(
  "appointment-confirmation",
  async (job: Job<AppointmentJobData>) => {
    const data = job.data;

    console.log(`[Worker] Processando job ${job.id} — Cliente: ${data.clientName}`);

    const message = buildConfirmationMessage(data);

    // ── Exemplo: envio via WhatsApp (substitua pelo seu provider) ──────────
    await sendWhatsApp(data.clientPhone, message);

    // ── Opcional: envio por e-mail também ──────────────────────────────────
    if (data.clientEmail) {
      await sendEmail(data.clientEmail, "Confirmação de Agendamento — EstetiSafe", message);
    }

    // ── Marca o agendamento como notificado no banco ───────────────────────
    await prisma.appointment.update({
      where: { id: data.appointmentId },
      data: { confirmationSentAt: new Date() },
    });

    console.log(`[Worker] ✔ Confirmação enviada para ${data.clientName} (${data.clientPhone})`);
  },
  {
    connection,
    concurrency: 5, // processa até 5 jobs simultaneamente
  }
);

// ─── Monitoramento de Eventos da Fila ────────────────────────────────────────
const queueEvents = new QueueEvents("appointment-confirmation", { connection });

queueEvents.on("completed", ({ jobId }) => {
  console.log(`[Queue] ✔ Job ${jobId} concluído com sucesso.`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`[Queue] ✗ Job ${jobId} falhou: ${failedReason}`);
  // Aqui você pode integrar com Sentry, Slack, etc.
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildConfirmationMessage(data: AppointmentJobData): string {
  const date = new Date(data.scheduledAt);
  const formatted = date.toLocaleString("pt-BR", {
    timeZone: "America/Fortaleza",
    dateStyle: "full",
    timeStyle: "short",
  });

  return (
    `Olá, ${data.clientName}! 👋\n\n` +
    `Confirmamos seu agendamento na nossa clínica:\n\n` +
    `📋 Serviço: *${data.serviceName}*\n` +
    `👩‍⚕️ Profissional: ${data.professionalName}\n` +
    `📅 Data e hora: ${formatted}\n\n` +
    `Caso precise reagendar, entre em contato conosco.\n` +
    `Aguardamos você! ✨`
  );
}

/**
 * Substitua pela integração real com seu provider de WhatsApp.
 * Exemplos: Z-API, Evolution API, Twilio, Meta Cloud API.
 */
async function sendWhatsApp(phone: string, message: string): Promise<void> {
  if (!phone) return;

  // Exemplo com fetch para uma API genérica de WhatsApp:
  const response = await fetch(process.env.WHATSAPP_API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${response.status} ${await response.text()}`);
  }
}

/**
 * Substitua pelo seu provider de e-mail (Resend, SendGrid, Nodemailer...).
 */
async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // Exemplo genérico — adapte ao seu provider
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "noreply@estetisafe.com.br",
      to,
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email API error: ${response.status} ${await response.text()}`);
  }
}
