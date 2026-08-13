# Guia de Configuração e Homologação: Meta WhatsApp Business API

Este documento detalha o passo a passo necessário para registrar, configurar e aprovar a integração oficial do WhatsApp Business API no **Meta Developer Hub** para o **EstetiSafe / L'Appui**.

---

## 📋 Pré-requisitos
1. **Conta Comercial da Meta (Meta Business Suite):** Necessária para gerenciar as permissões e números de telefone da empresa.
2. **Número de Telefone Disponível:** Um número de telefone que possa receber chamadas ou SMS para verificação e que **não esteja ativo** em um aplicativo do WhatsApp convencional (caso contrário, ele precisará ser desconectado do app pessoal antes).
3. **Conta no Meta Developers:** Acesse [developers.facebook.com](https://developers.facebook.com) e faça login.

---

## 🛠️ Passo 1: Criar o Aplicativo na Meta
1. Acesse o painel de desenvolvedor da Meta e clique em **Criar aplicativo**.
2. Selecione o tipo de aplicativo **Negócios (Business)** ou **Outro > Negócios**.
3. Dê um nome amigável ao aplicativo (ex: `L'Appui Integrations`) e associe-o à sua conta comercial do Meta Business Suite.
4. No painel do aplicativo criado, procure pelo produto **WhatsApp** e clique em **Configurar**.

---

## 📩 Passo 2: Cadastrar e Aprovar os Templates de Mensagem
A Meta exige que o primeiro contato ativo com o cliente (notificação outbound) seja feito via **Message Templates (Modelos de Mensagem)** pré-aprovados.

### 1. Template de Confirmação de Agendamento (`appointment_confirmation`)
Crie um modelo de mensagem do tipo **Utilitário (Utility)** com as seguintes especificações:
* **Nome do Modelo:** `appointment_confirmation` (ou o configurado em `appointmentTemplateName`).
* **Idioma:** `Português (Brasil)` (código `pt_BR`).
* **Corpo da Mensagem (Exemplo Recomendado):**
  > Olá, **{{1}}**! Confirmamos o seu agendamento de **{{2}}** com o(a) profissional **{{3}}** no dia **{{4}}**.
  > 
  > Para confirmar sua presença, responda **SIM**. Caso precise desmarcar ou reagendar, responda **NÃO**.
* **Variáveis de Entrada Mapeadas no Backend:**
  1. `{{1}}` -> Nome do Cliente (ex: `Manoel Brendo`)
  2. `{{2}}` -> Nome do Serviço (ex: `Preenchimento Labial`)
  3. `{{3}}` -> Nome do Profissional (ex: `Dr. Lucas`)
  4. `{{4}}` -> Data e Hora Formatada (ex: `15/06/2026 14:00`)

---

## 🔗 Passo 3: Configurar os Webhooks no Meta Developers
O webhook é o canal por onde a Meta avisa o backend sobre alterações de entrega (mensagens lidas, entregues) e quando o cliente responde "SIM" ou "NÃO".

1. No painel do seu aplicativo na Meta, vá em **WhatsApp > Configuração**.
2. Na seção **Webhook**, clique em **Editar**.
3. Insira as credenciais do seu backend de produção:
   * **URL de Retorno (Callback URL):** `https://seu-backend.com/webhooks/whatsapp`
   * **Token de Verificação (Verify Token):** Defina uma chave segura (a mesma que você colocará no `.env` como `WHATSAPP_VERIFY_TOKEN`).
4. Clique em **Verificar e salvar**. A Meta fará uma chamada GET ao backend para validar o token.
5. Em **Campos do Webhook**, clique em **Subscrever** para o evento `messages`. Isso garante que o backend receberá as respostas dos clientes.

---

## 🔑 Passo 4: Obter Tokens de Acesso Permanentes
Por padrão, a Meta gera tokens de teste que expiram em 24 horas. Para uso comercial, siga as etapas abaixo para gerar o token permanente:

1. Acesse as **Configurações do Negócio** no painel da Meta Business Suite.
2. Vá em **Usuários do sistema** e crie um novo usuário administrativo (ex: `SaaS Integrator`).
3. Adicione o aplicativo do WhatsApp como ativo para esse usuário e conceda a permissão **Gerenciar aplicativo**.
4. Clique em **Gerar novo token**, selecione o aplicativo e marque os escopos:
   * `whatsapp_business_messaging`
   * `whatsapp_business_management`
5. Guarde o token gerado. Ele não expira e deve ser configurado na área de notificações do painel de administração do L'Appui para a clínica correspondente.

---

## 🚀 Passo 5: Configurar e Ativar o Serviço no Servidor
Com todas as informações em mãos, configure o arquivo `.env` de produção do seu backend:

```env
# Ativa o agendador de lembretes automáticos
WHATSAPP_CONFIRMATION_JOB_ENABLED="true"

# Token global para verificar a autenticidade do webhook vindo da Meta
WHATSAPP_VERIFY_TOKEN="seu_token_de_verificacao_aqui"

# Segredo do Aplicativo Meta (usado para verificar assinaturas HMAC das mensagens recebidas)
WHATSAPP_APP_SECRET="seu_app_secret_da_meta_aqui"

# Chave simétrica AES-256 de 32 bytes para criptografar tokens salvos das clínicas no banco
WHATSAPP_TOKEN_ENCRYPTION_KEY="uma_chave_segura_de_64_caracteres_hexadecimais"
```

O backend já está programado para verificar a assinatura de cada webhook usando `WHATSAPP_APP_SECRET`, garantindo que nenhuma mensagem falsa seja processada como confirmação legítima.
