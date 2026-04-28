/**
 * EstetiSafe — Scheduler de Jobs (node-cron)
 * Arquivo: src/jobs/cron.scheduler.ts
 *
 * Responsabilidade:
 *   - Inicializar os crons na subida do servidor
 *   - Acionar o scheduleUpcomingAppointments() de hora em hora
 *
 * Dependências:
 *   npm install node-cron
 *   npm install --save-dev @types/node-cron
 *
 * Como usar:
 *   Importe e chame startSchedulers() no seu server.ts / app entry point.
 *
 *   import { startSchedulers } from "./jobs/cron.scheduler";
 *   startSchedulers();
 */

import cron from "node-cron";
import { scheduleUpcomingAppointments, appointmentWorker } from "./appointments.job";

export function startSchedulers(): void {
  console.log("[Scheduler] Iniciando agendadores de jobs...");

  // ── Cron 1: A cada hora, no minuto 0 ────────────────────────────────────
  // Expressão: "0 * * * *"
  //   ┌──── minuto (0)
  //   │ ┌── hora (qualquer)
  //   │ │ ┌─ dia do mês (qualquer)
  //   │ │ │ ┌── mês (qualquer)
  //   │ │ │ │ ┌─ dia da semana (qualquer)
  //   0 * * * *
  cron.schedule(
    "0 * * * *",
    async () => {
      console.log("[Cron] Executando: busca de agendamentos para confirmação...");
      try {
        await scheduleUpcomingAppointments();
      } catch (err) {
        console.error("[Cron] Erro ao enfileirar agendamentos:", err);
      }
    },
    {
      timezone: "America/Fortaleza", // Ajuste para o fuso da clínica
    }
  );

  // ── Cron 2 (opcional): Roda uma vez ao iniciar o servidor ───────────────
  // Útil para pegar agendamentos que seriam perdidos se o servidor reiniciou
  // no meio de uma hora.
  (async () => {
    console.log("[Scheduler] Rodada inicial ao subir o servidor...");
    try {
      await scheduleUpcomingAppointments();
    } catch (err) {
      console.error("[Scheduler] Erro na rodada inicial:", err);
    }
  })();

  // ── Garante que o Worker está escutando a fila ───────────────────────────
  appointmentWorker.on("ready", () => {
    console.log("[Worker] ✔ Worker de confirmações está ativo e aguardando jobs.");
  });

  appointmentWorker.on("error", (err) => {
    console.error("[Worker] Erro no worker:", err);
  });

  console.log("[Scheduler] ✔ Agendadores iniciados com sucesso.");
}

// ─── Exemplo de integração no server.ts ──────────────────────────────────────
//
//  import express from "express";
//  import { startSchedulers } from "./jobs/cron.scheduler";
//
//  const app = express();
//
//  // ... suas rotas e middlewares ...
//
//  app.listen(3000, () => {
//    console.log("Servidor rodando na porta 3000");
//    startSchedulers(); // ← aqui
//  });
//
// ─────────────────────────────────────────────────────────────────────────────
