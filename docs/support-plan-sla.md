# Plano de Suporte Técnico e Acordo de Nível de Serviço (SLA)

Este documento define os canais de atendimento, o horário de funcionamento, os níveis de severidade dos incidentes e os tempos de resposta garantidos (SLA) para suporte técnico às clínicas parceiras do **EstetiSafe / L'Appui**.

---

## 📞 1. Canais e Horário de Atendimento

* **Canais de Suporte Disponíveis:**
  * **E-mail de Suporte:** `suporte@estetisafe.com.br` (ou o configurado em `SUPPORT_CONTACT_EMAIL`).
  * **WhatsApp Central:** `+55 (XX) XXXX-XXXX` (ou o configurado em `SUPPORT_CONTACT_PHONE`).
  * **Hub de Suporte Integrado:** Área interna no painel do administrador para abertura de chamados diretos.
* **Horário de Funcionamento:**
  * Dias úteis, de **segunda a sexta-feira, das 08:00 às 18:00** (Horário de Brasília).
  * Atendimento emergencial para incidentes Críticos (Severidade 1) aos finais de semana e feriados em regime de plantão.

---

## 🚨 2. Classificação de Severidade de Incidentes

Para fins de cumprimento do SLA, as solicitações de suporte são categorizadas da seguinte forma:

### 🔴 Severidade 1: Crítico (Bloqueio Total)
* **Definição:** Plataforma totalmente indisponível (fora do ar), impossibilidade de realizar login, ou falha de banco de dados que impeça a leitura de prontuários em andamento.
* **Exemplo:** Erro geral de servidor `500 Internal Server Error` ou banco PostgreSQL travado.

### 🟡 Severidade 2: Alto (Bloqueio Parcial)
* **Definição:** Funcionalidade principal inoperante, mas o restante do sistema permanece funcionando normalmente. Não há contorno simples imediato.
* **Exemplo:** Falha no processamento de pagamentos ou impossibilidade de assinar termos de consentimento.

### 🔵 Severidade 3: Médio (Problema Menor)
* **Definição:** Erros no sistema que causam transtornos ou lentidão, mas não impedem o uso das funções críticas da clínica. Existe uma alternativa temporária.
* **Exemplo:** Lentidão no carregamento de gráficos do dashboard ou problemas estéticos na geração do PDF de prontuário.

### 🟢 Severidade 4: Baixo (Dúvidas e Melhorias)
* **Definição:** Dúvidas sobre o funcionamento das telas, solicitações de novas funcionalidades ou alterações cosméticas simples.
* **Exemplo:** Solicitação de um novo campo na ficha de cadastro ou dúvida sobre configuração do webhook da Meta.

---

## ⏱️ 3. Tabela de Metas de Atendimento (SLA)

| Severidade | Tempo Máximo de Resposta | Tempo Máximo de Solução (Workaround) |
| :--- | :---: | :---: |
| **🔴 S1: Crítico** | 1 hora | 4 horas |
| **🟡 S2: Alto** | 4 horas | 12 horas |
| **🔵 S3: Médio** | 8 horas | 24 horas |
| **🟢 S4: Baixo** | 24 horas | 5 dias úteis |

* **Tempo de Resposta:** O intervalo entre o recebimento do chamado nos canais e o primeiro contato humano qualificando o problema.
* **Tempo de Solução:** O prazo final para disponibilização de um hotfix, contorno funcional ou correção definitiva do erro.

---

## 🔒 4. Procedimentos de Segurança para Acesso do Suporte (Impersonação)

Para garantir a conformidade com a LGPD e a segurança dos dados médicos dos pacientes da clínica:
1. **Autorização Prévia:** O suporte técnico do EstetiSafe só poderá assumir uma sessão de clínica (impersonation) mediante autorização prévia por e-mail ou WhatsApp do proprietário da clínica.
2. **Log de Auditoria Rastreável:** Toda ação realizada pelo suporte administrativo estará associada ao papel `'SUPPORT'` e registrará o e-mail do agente de suporte executor na tabela de auditoria (`AuditLog`), assegurando rastreabilidade total caso haja incidentes de segurança.
