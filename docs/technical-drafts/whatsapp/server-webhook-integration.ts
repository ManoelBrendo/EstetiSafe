/**
 * EstetiSafe — Integração do Webhook no server.ts
 * Arquivo: trecho a adicionar no seu server.ts (ou app.ts)
 *
 * ATENÇÃO: A validação de assinatura da Meta exige acesso ao body RAW
 * (Buffer), não ao JSON já parseado. Por isso a rota do webhook precisa
 * de um middleware especial ANTES do express.json() global.
 */

import express from "express";
import whatsappWebhookRouter from "./webhooks/whatsapp.webhook";

const app = express();

// ─── Middleware especial para capturar rawBody nas rotas de webhook ───────────
//
// Este bloco deve vir ANTES do express.json() global.
// Ele preserva o buffer original para o HMAC-SHA256.
app.use(
  "/webhooks",
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf; // salva o Buffer cru no request
    },
  })
);

// ─── express.json() global para as demais rotas ───────────────────────────────
app.use(express.json());

// ─── Registro das rotas de webhook ───────────────────────────────────────────
app.use("/webhooks", whatsappWebhookRouter);

// Resultado final:
//   GET  /webhooks/whatsapp  → verificação da Meta
//   POST /webhooks/whatsapp  → eventos de status e mensagens

// ─── Suas outras rotas continuam normalmente ──────────────────────────────────
// app.use("/api/appointments", appointmentsRouter);
// app.use("/api/clients", clientsRouter);
// ...

app.listen(3000, () => {
  console.log("EstetiSafe backend rodando na porta 3000");
});

// ─── Variáveis de ambiente necessárias (.env) ─────────────────────────────────
//
// WHATSAPP_WEBHOOK_VERIFY_TOKEN=um_token_secreto_que_voce_define
// WHATSAPP_API_TOKEN=EAAxxxx...  (token da Meta / Graph API)
// WHATSAPP_PHONE_NUMBER_ID=12345678901234
// WHATSAPP_APP_SECRET=abc123...  (App Secret do painel da Meta)
//
// ─── Como cadastrar o webhook na Meta ────────────────────────────────────────
//
// 1. Acesse: https://developers.facebook.com → Seu App → WhatsApp → Configuration
// 2. Em "Webhook", clique em "Edit"
// 3. Callback URL: https://seu-dominio.com/webhooks/whatsapp
// 4. Verify Token: o mesmo valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN
// 5. Clique em "Verify and Save"
// 6. Em "Webhook fields", ative: messages
//
// A Meta vai chamar GET /webhooks/whatsapp para verificar.
// Depois disso, todos os eventos chegam via POST /webhooks/whatsapp.
