# Guia de Configuração e Homologação: Gateway de Pagamento (Stripe e Asaas)

Este documento detalha o passo a passo necessário para conectar, validar e homologar os provedores de faturamento recorrente (**Stripe** e **Asaas**) para assinaturas no **EstetiSafe / L'Appui**.

---

## 🛠️ Provedor 1: Stripe (Configuração de Checkout)

A integração com o Stripe utiliza o **Stripe Checkout Sessions** em modo de pagamento avulso ou recorrente. O backend escuta os webhooks do Stripe para ativar a assinatura do cliente de forma assíncrona.

### 1. Obter Credenciais do Stripe
1. Faça login na sua conta no painel do [Stripe](https://dashboard.stripe.com).
2. Para testes, ative o **Modo de teste (Test Mode)** no cabeçalho.
3. Vá em **Desenvolvedores (Developers) > Chaves de API (API Keys)**.
4. Copie as chaves:
   * **Chave secreta (Secret Key):** Começa com `sk_test_...` (usada no `.env` do backend).
   * **Chave publicável (Publishable Key):** Começa com `pk_test_...` (caso necessário no frontend).

### 2. Configurar o Webhook de Cobrança do Stripe
O webhook garante que, quando o cliente pagar com sucesso no checkout da Stripe, o backend seja avisado e marque a clínica correspondente como ativa.
1. Vá em **Desenvolvedores > Webhooks** e clique em **Adicionar endpoint**.
2. **URL do Endpoint:** `https://seu-backend.com/webhooks/billing`
3. **Eventos a escutar:** Adicione `checkout.session.completed`.
4. Clique em **Adicionar endpoint**.
5. Em **Segredo de assinatura (Signing Secret)**, revele a chave e copie o valor (começa com `whsec_...`).
6. Configure essa chave no `.env` do backend como `BILLING_WEBHOOK_SECRET` (ou `STRIPE_WEBHOOK_SECRET`).

---

## 🛠️ Provedor 2: Asaas (Configuração Pix/Cartão)

A integração com o Asaas utiliza a criação de cobranças com envio de Pix copia-e-cola direto ou cartão de crédito em modo sandbox.

### 1. Obter Credenciais do Asaas
1. Faça login no painel do [Asaas Sandbox](https://sandbox.asaas.com) (ou produção).
2. Vá em **Minha Conta > Integrações > Chave de API**.
3. Gere e copie o token de acesso (usado para autorizar as chamadas HTTP).

### 2. Configurar o Webhook do Asaas
1. No menu lateral do Asaas, vá em **Integrações > Webhooks**.
2. **URL de Envio:** `https://seu-backend.com/webhooks/billing`
3. **Fila de Sincronização / Eventos:** Marque `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`.
4. **Token de Autenticação:** Defina um segredo personalizado e insira-o no `.env` do backend como `BILLING_WEBHOOK_SECRET` (ou `ASAAS_WEBHOOK_TOKEN`).

---

## ⚙️ Variáveis de Ambiente no Backend

Configure as variáveis conforme o provedor escolhido:

### Caso use Stripe:
```env
# Define o provedor ativo
BILLING_GATEWAY_PROVIDER="STRIPE"

# Chave secreta da API do Stripe
STRIPE_SECRET_KEY="sk_test_..."

# Segredo do Webhook (whsec_...) obtido na configuração do webhook da Stripe
BILLING_WEBHOOK_SECRET="whsec_..."
```

### Caso use Asaas:
```env
# Define o provedor ativo
BILLING_GATEWAY_PROVIDER="ASAAS"

# Token de autenticação definido na tela de webhook do Asaas
BILLING_WEBHOOK_SECRET="seu_token_definido_no_painel_do_asaas"
```

---

## 🧪 Como Validar Localmente com PowerShell

Se você estiver em um ambiente de desenvolvimento local (Windows), pode rodar o script interativo criado para configurar e testar o fluxo comercial:

1. **Configurar as variáveis de gateway local:**
   ```powershell
   .\setup-stripe.ps1
   ```
2. **Rodar os Testes de Homologação E2E:**
   Para garantir que as assinaturas e assinaturas de webhook estão sendo validadas corretamente contra o mock do Stripe:
   ```powershell
   cd backend/backend
   npm run test:integration
   ```
   *O teste `tests/integration/stripeE2e.test.js` irá validar o fluxo completo e certificar que o backend atualiza a clínica para `ACTIVE` ao receber o webhook.*
