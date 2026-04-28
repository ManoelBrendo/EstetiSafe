/**
 * EstetiSafe — Webhook WhatsApp (Meta Cloud API)
 * Arquivo: src/webhooks/whatsapp.webhook.ts
 *
 * Responsabilidades:
 *   GET  /webhooks/whatsapp → Verificação do token pela Meta (handshake inicial)
 *   POST /webhooks/whatsapp → Recebe eventos de status (sent/delivered/read)
 *                             e mensagens de resposta dos clientes
 *
 * Lógica de resposta do cliente:
 *   "SIM" → atualiza appointment.status = CONFIRMED  + envia mensagem de confirmação
 *   "NÃO" → atualiza appointment.status = CANCELLED  + envia mensagem de cancelamento
 *
 * Dependências:
 *   npm install express @prisma/client crypto
 */

import { Router, Request, Response } from "express";
import { PrismaClient, AppointmentStatus } from "@prisma/client";
import crypto from "crypto";

const router = Router();
const prisma = new PrismaClient();

// ─── Variáveis de Ambiente ────────────────────────────────────────────────────
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!;
const WHATSAPP_API_TOKEN   = process.env.WHATSAPP_API_TOKEN!;
const WHATSAPP_PHONE_ID    = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const APP_SECRET           = process.env.WHATSAPP_APP_SECRET!; // para validar assinatura

// ─── Tipagens dos Payloads da Meta ────────────────────────────────────────────

interface MetaWebhookBody {
  object: string;
  entry: MetaEntry[];
}

interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

interface MetaChange {
  value: MetaChangeValue;
  field: string;
}

interface MetaChangeValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

interface MetaContact {
  profile: { name: string };
  wa_id: string;
}

interface MetaMessage {
  from: string;       // número do cliente (ex: "5585999999999")
  id: string;         // wamid único da mensagem
  timestamp: string;
  type: "text" | "image" | "audio" | "document" | "interactive";
  text?: { body: string };
}

interface MetaStatus {
  id: string;         // wamid da mensagem enviada
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string }[];
}

// ─── GET /webhooks/whatsapp ───────────────────────────────────────────────────
/**
 * Handshake de verificação exigido pela Meta ao cadastrar o webhook.
 * A Meta envia 3 query params e espera receber hub.challenge de volta.
 *
 * Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
router.get("/whatsapp", (req: Request, res: Response) => {
  const mode      = req.query["hub.mode"]        as string;
  const token     = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"]   as string;

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    console.log("[Webhook] ✔ Verificação de token aprovada pela Meta.");
    return res.status(200).send(challenge);
  }

  console.warn("[Webhook] ✗ Token de verificação inválido:", token);
  return res.sendStatus(403);
});

// ─── POST /webhooks/whatsapp ──────────────────────────────────────────────────
/**
 * Recebe todos os eventos em tempo real:
 *   - Status de entrega: sent, delivered, read, failed
 *   - Mensagens dos clientes (resposta "SIM" ou "NÃO")
 *
 * IMPORTANTE: Sempre retorne 200 imediatamente para a Meta.
 * Processe de forma assíncrona para não causar timeout.
 */
router.post("/whatsapp", validateMetaSignature, async (req: Request, res: Response) => {
  // Responde 200 ANTES de processar — exigência da Meta
  res.sendStatus(200);

  const body: MetaWebhookBody = req.body;

  if (body.object !== "whatsapp_business_account") return;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;

      // ── Processa status de entrega ─────────────────────────────────────
      for (const status of value.statuses ?? []) {
        await handleDeliveryStatus(status);
      }

      // ── Processa mensagens recebidas dos clientes ──────────────────────
      for (const message of value.messages ?? []) {
        const contact = value.contacts?.find(c => c.wa_id === message.from);
        await handleIncomingMessage(message, contact);
      }
    }
  }
});

// ─── Handler: Status de Entrega ───────────────────────────────────────────────
async function handleDeliveryStatus(status: MetaStatus): Promise<void> {
  console.log(`[Webhook] Status de entrega → wamid: ${status.id} | status: ${status.status}`);

  // Busca o log de notificação pelo wamid salvo quando a mensagem foi enviada
  const notificationLog = await prisma.whatsAppNotificationLog.findUnique({
    where: { wamid: status.id },
  });

  if (!notificationLog) {
    console.warn(`[Webhook] Log não encontrado para wamid: ${status.id}`);
    return;
  }

  // Mapeia status da Meta para o nosso enum
  const deliveryStatusMap: Record<MetaStatus["status"], string> = {
    sent:      "SENT",
    delivered: "DELIVERED",
    read:      "READ",
    failed:    "FAILED",
  };

  await prisma.whatsAppNotificationLog.update({
    where: { wamid: status.id },
    data: {
      deliveryStatus: deliveryStatusMap[status.status] ?? status.status,
      updatedAt: new Date(),
      errorDetails: status.errors ? JSON.stringify(status.errors) : undefined,
    },
  });

  console.log(`[Webhook] ✔ Log atualizado: ${status.id} → ${status.status}`);
}

// ─── Handler: Mensagens Recebidas dos Clientes ────────────────────────────────
async function handleIncomingMessage(
  message: MetaMessage,
  contact?: MetaContact
): Promise<void> {
  if (message.type !== "text" || !message.text?.body) {
    console.log(`[Webhook] Mensagem ignorada (tipo: ${message.type})`);
    return;
  }

  const rawText     = message.text.body.trim();
  const normalized  = rawText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const clientPhone = message.from; // ex: "5585999999999"
  const clientName  = contact?.profile.name ?? "Cliente";

  console.log(`[Webhook] Mensagem recebida de ${clientPhone}: "${rawText}"`);

  // Detecta confirmação ou cancelamento
  const isConfirm = /^(SIM|S|YES|Y|CONFIRMO|CONFIRMAR|1)$/.test(normalized);
  const isCancel  = /^(NAO|N|NO|CANCELO|CANCELAR|NEGAR|2)$/.test(normalized);

  if (!isConfirm && !isCancel) {
    console.log(`[Webhook] Resposta não reconhecida: "${rawText}". Nenhuma ação tomada.`);
    // Opcional: enviar mensagem explicando as opções válidas
    await sendWhatsAppMessage(clientPhone, buildUnrecognizedResponseMessage(clientName));
    return;
  }

  // Busca o agendamento mais próximo desse cliente pelo telefone
  const appointment = await findPendingAppointmentByPhone(clientPhone);

  if (!appointment) {
    console.warn(`[Webhook] Nenhum agendamento pendente encontrado para ${clientPhone}`);
    return;
  }

  if (isConfirm) {
    await confirmAppointment(appointment.id, clientPhone, clientName);
  } else {
    await cancelAppointment(appointment.id, clientPhone, clientName);
  }
}

// ─── Lógica de Confirmação ────────────────────────────────────────────────────
async function confirmAppointment(
  appointmentId: string,
  phone: string,
  name: string
): Promise<void> {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: AppointmentStatus.CONFIRMED,
      clientConfirmedAt: new Date(), // campo opcional — veja patch do schema
    },
  });

  console.log(`[Webhook] ✔ Agendamento ${appointmentId} CONFIRMADO pelo cliente.`);

  const message =
    `Perfeito, ${name}! 🎉\n\n` +
    `Seu agendamento está confirmado. Te esperamos!\n` +
    `Qualquer dúvida, é só chamar aqui. 😊`;

  await sendWhatsAppMessage(phone, message);
}

// ─── Lógica de Cancelamento ───────────────────────────────────────────────────
async function cancelAppointment(
  appointmentId: string,
  phone: string,
  name: string
): Promise<void> {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: AppointmentStatus.CANCELLED,
      clientCancelledAt: new Date(), // campo opcional — veja patch do schema
    },
  });

  console.log(`[Webhook] ✔ Agendamento ${appointmentId} CANCELADO pelo cliente.`);

  const message =
    `Entendido, ${name}. 💙\n\n` +
    `Seu agendamento foi cancelado. Se quiser remarcar, é só entrar em contato conosco.\n` +
    `Até logo! 👋`;

  await sendWhatsAppMessage(phone, message);
}

// ─── Busca o Agendamento Mais Próximo Pendente do Cliente ────────────────────
async function findPendingAppointmentByPhone(phone: string) {
  const now = new Date();

  // Normaliza o telefone: remove +, espaços e traços
  const normalized = phone.replace(/\D/g, "");

  return prisma.appointment.findFirst({
    where: {
      client: {
        phone: { contains: normalized.slice(-9) }, // últimos 9 dígitos (evita problema de DDI)
      },
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      scheduledAt: { gte: now },
    },
    orderBy: { scheduledAt: "asc" }, // o mais próximo primeiro
    include: { client: true },
  });
}

// ─── Envio de Mensagem via WhatsApp Cloud API ─────────────────────────────────
async function sendWhatsAppMessage(to: string, text: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: text },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Webhook] Erro ao enviar WhatsApp para ${to}:`, err);
      return null;
    }

    const data = await response.json() as { messages: { id: string }[] };
    const wamid = data.messages?.[0]?.id ?? null;

    console.log(`[Webhook] ✔ Mensagem enviada para ${to} | wamid: ${wamid}`);
    return wamid;
  } catch (err) {
    console.error(`[Webhook] Exceção ao enviar WhatsApp:`, err);
    return null;
  }
}

// ─── Mensagem para Respostas Não Reconhecidas ─────────────────────────────────
function buildUnrecognizedResponseMessage(name: string): string {
  return (
    `Olá, ${name}! Não consegui entender sua resposta. 😅\n\n` +
    `Para confirmar seu agendamento, responda: *SIM*\n` +
    `Para cancelar, responda: *NÃO*`
  );
}

// ─── Middleware: Validação de Assinatura da Meta (Segurança) ──────────────────
/**
 * A Meta assina cada requisição POST com HMAC-SHA256.
 * Validar essa assinatura evita que qualquer um injete payloads falsos.
 *
 * Header enviado pela Meta: x-hub-signature-256: sha256=<hash>
 * Docs: https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
 */
function validateMetaSignature(req: Request, res: Response, next: Function): void {
  const signature = req.headers["x-hub-signature-256"] as string;

  if (!signature) {
    console.warn("[Webhook] Requisição sem assinatura bloqueada.");
    res.sendStatus(401);
    return;
  }

  // req.body precisa ser o raw buffer para o HMAC funcionar
  // Use express.raw({ type: "application/json" }) nesta rota (veja server.ts)
  const rawBody = (req as any).rawBody as Buffer;

  if (!rawBody) {
    // Fallback: se rawBody não estiver disponível, avança sem validar
    // (configure corretamente em produção)
    console.warn("[Webhook] rawBody não disponível — validação de assinatura pulada.");
    next();
    return;
  }

  const expected = "sha256=" + crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expected) {
    console.warn("[Webhook] Assinatura inválida. Requisição rejeitada.");
    res.sendStatus(401);
    return;
  }

  next();
}

export default router;
