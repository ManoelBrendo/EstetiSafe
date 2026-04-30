# Roadmap implementado: pontos 10, 11 e 12

## 10. WhatsApp e notificacoes

Status atual: camada tecnica pronta para integracao oficial com Meta WhatsApp Business API.

O que existe agora:
- Provider de envio de template via API da Meta.
- Webhook GET para verificacao do token da Meta.
- Webhook POST para status de entrega e respostas de clientes.
- Leitura de respostas SIM/NAO para confirmar ou cancelar agendamentos.
- Job de confirmacao de agenda nas proximas 24 horas.
- Logs de envio, recebimento, falha e status.
- Endpoint autenticado `/notifications/status` para ver prontidao operacional sem expor tokens.

Pendente para producao real:
- Criar/configurar app Meta Business.
- Aprovar templates na Meta.
- Salvar configuracao real por clinica em `whatsappClinicConfig`.
- Definir `WHATSAPP_APP_SECRET` e habilitar `WHATSAPP_CONFIRMATION_JOB_ENABLED=true`.

## 11. Gateway de pagamento

Status atual: camada provider-agnostic pronta para plugar provedor real.

O que existe agora:
- Criacao de intencao de cobranca para assinatura.
- Suporte de estrutura para Pix, cartao e transferencia bancaria.
- Webhook financeiro protegido por segredo.
- Persistencia dedicada em `billing_gateway_intents` e `billing_gateway_events`, com fallback por auditoria.
- Status operacional de readiness no endpoint `/billing/gateway/status`.
- Correcao de auditoria da criacao de cobranca para usar a referencia real da intencao.

Pendente para producao real:
- Escolher provedor: Stripe, Pagar.me, Mercado Pago, Asaas ou outro.
- Implementar criacao real de checkout/Pix dinamico no provider escolhido.
- Validar assinatura nativa do webhook do provedor.
- Homologar recorrencia, falha, cancelamento e estorno.

## 12. PWA, mobile e IA

Status atual: foco em web/PWA, sem app nativo por enquanto.

O que existe agora:
- Manifest PWA com atalhos para Agenda, Clientes, Auditoria e Assinatura.
- Service worker com cache de shell, assets e fallback offline.
- Pagina offline premium para orientar a usuaria quando estiver sem conexao.
- Registro de service worker com atualizacao automatica segura.
- Insights operacionais no dashboard com regras auditaveis para estoque, equipamentos e anamnese.
- Readiness de IA clinica, mantendo regras locais por padrao e exigindo chave antes de IA externa.

Pendente para evolucao forte:
- Modo cabine/tablet com fluxo ultra-simplificado.
- Offline parcial de leitura para agenda/prontuario com fila de sincronizacao.
- IA externa com consentimento, anonimizacao/minimizacao de dados e revisao humana obrigatoria.