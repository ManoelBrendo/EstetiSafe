# Documentos Jurídicos do SaaS: Termos de Uso e Política de Privacidade

Este documento apresenta os modelos padrão para os **Termos de Uso** e a **Política de Privacidade** do **EstetiSafe / L'Appui**, estruturados em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) e a legislação de saúde vigente no Brasil.

---

## 📄 1. Termos de Uso (Modelo de Adesão da Clínica)

### 1. Objeto e Adesão
Este contrato rege o uso da plataforma EstetiSafe / L'Appui pela Clínica Contratante. Ao acessar a plataforma, a clínica e seus profissionais de saúde declaram estar cientes e concordar com estes termos.

### 2. Responsabilidade Profissional e Prontuários
* **Autonomia Médica/Clínica:** O EstetiSafe é uma ferramenta de suporte à gestão e armazenamento de prontuários. Toda e qualquer decisão diagnóstica, prescrição de tratamentos ou preenchimento de anamnese é de inteira responsabilidade do profissional de saúde habilitado.
* **Integridade dos Registros:** A clínica é responsável por garantir a veracidade dos dados inseridos. Conforme as validações de segurança da plataforma, uma vez que um prontuário é assinado digitalmente ou marcado como pago, ele é **bloqueado para edições retroativas** a fim de garantir a segurança jurídica (imutabilidade do histórico do paciente).

### 3. Credenciais e Segurança
* As credenciais de acesso (usuários e senhas) são pessoais e intransferíveis.
* A clínica compromete-se a não divulgar suas senhas e a notificar imediatamente a plataforma caso suspeite de qualquer acesso não autorizado.

---

## 🔒 2. Política de Privacidade e Proteção de Dados (LGPD)

### 1. Papel dos Agentes de Tratamento
* **Controlador dos Dados:** A Clínica Contratante (que coleta os dados de saúde diretamente do paciente).
* **Operador dos Dados:** O EstetiSafe (que fornece a infraestrutura de software, banco de dados e criptografia para o armazenamento seguro dos dados).

### 2. Coleta e Finalidade dos Dados Sensíveis
O sistema armazena dados de saúde (dados pessoais sensíveis) fornecidos voluntariamente pelos pacientes e profissionais da clínica, incluindo:
* Fichas de Anamnese (alergias, patologias, histórico gestacional).
* Termos de consentimento livre e esclarecido assinados digitalmente.
* Fotos de acompanhamento clínico (armazenadas mediante consentimento explícito de imagem).

Estes dados são tratados unicamente para a finalidade de **tutela da saúde** e cumprimento de obrigações legais (guarda de prontuário por 20 anos).

### 3. Segurança e Criptografia
* Todos os dados sensíveis trafegam via conexões criptografadas (HTTPS).
* A chave do WhatsApp e demais integrações são criptografadas em repouso com algoritmo AES-256 no banco de dados.

### 4. Direitos do Titular (Paciente)
O paciente da clínica, como titular dos dados, pode requerer à clínica a qualquer momento:
* A confirmação da existência de tratamento de seus dados.
* O acesso aos dados de seu prontuário.
* A correção de dados incompletos, inexatos ou desatualizados.
* *Nota:* A exclusão definitiva de dados de prontuário ativo é limitada pela obrigatoriedade legal de guarda de 20 anos estabelecida pelo CFM/CFO.

---

## 🤝 3. Matriz de Responsabilidade Compartilhada

| Responsabilidade | Plataforma EstetiSafe | Clínica Contratante |
| :--- | :---: | :---: |
| Segurança lógica dos servidores e banco de dados | **Sim** | Não |
| Criptografia de dados sensíveis em trânsito e repouso | **Sim** | Não |
| Coleta e assinatura do Termo de Consentimento | Não | **Sim** |
| Cadastro e controle de senhas de profissionais | Não | **Sim** |
| Validade clínica das anamneses e tratamentos | Não | **Sim** |
| Configuração de chaves Meta/Stripe de produção | Não | **Sim** |
