# Política de Retenção de Dados e Estratégia de Backups: EstetiSafe / L'Appui

Este documento estabelece as diretrizes de conformidade jurídica (LGPD e CFM/CFO) para a retenção de prontuários de pacientes e define a política de segurança para a realização de backups automáticos do banco de dados PostgreSQL.

---

## ⚖️ 1. Política de Retenção de Prontuários (Legislação Brasileira)

No Brasil, os prontuários médicos e odontológicos de procedimentos estéticos possuem prazos mínimos de guarda obrigatórios por lei:
* **Prazo Mínimo de Retenção (Lei nº 13.787/2018):** Os prontuários físicos ou digitais devem ser guardados por um período mínimo de **20 anos** a partir do último registro de atendimento do paciente.
* **Após o prazo de 20 anos:** Os prontuários podem ser destruídos ou devolvidos ao paciente, caso haja interesse. No entanto, em formato digital, manter os dados arquivados de forma segura e fria (cold storage) é a prática recomendada.
* **LGPD e Dados Pessoais Sensíveis:** Por se tratarem de dados de saúde (sensíveis), toda a guarda deve contar com criptografia no banco de dados e controle de acesso estrito (efetuado pelas permissões de profissionais e auditoria interna do L'Appui).

---

## 💾 2. Estratégia de Backup do Banco de Dados PostgreSQL

Para evitar qualquer perda de dados que possa comprometer a clínica legalmente, a infraestrutura PostgreSQL em produção deve seguir uma política de backup em três camadas:

### 1. Backups Diários Automatizados (Automated Snapshots)
* **Periodicidade:** A cada 24 horas (preferencialmente durante a madrugada, ex: às 02:00 UTC-3).
* **Retenção:** Guardar os últimos 30 backups diários.
* **Ferramenta:** PostgreSQL `pg_dump` ou ferramentas nativas do provedor de nuvem (ex: Render PostgreSQL Backups, AWS RDS automated snapshots, Supabase Backups).

### 2. Backups Mensais de Longo Prazo (Archived Backups)
* **Periodicidade:** No primeiro dia de cada mês.
* **Retenção:** Guardar o backup mensal pelo período de **5 anos** (para fins de auditoria fiscal e tributária).
* **Destino:** Armazenados em buckets de nuvem fria (ex: AWS S3 Glacier ou Google Cloud Coldline Storage).

### 3. Criptografia em Repouso (Encryption at Rest)
* Todos os volumes de banco de dados e arquivos de backup gerados devem ser **criptografados em repouso** (usando algoritmo AES-256) antes de serem transferidos ou salvos no bucket.

---

## 🛠️ 3. Como Realizar um Backup Manual via CLI

Para fins de manutenção e migrações preventivas locais, execute os seguintes comandos no terminal do PostgreSQL:

### Gerar Backup (pg_dump)
```bash
pg_dump -h <host_postgre> -U <usuario> -d <nome_do_banco> -F c -b -v -f backup_estetisafe_pre_migration.dump
```

### Restaurar Backup (pg_restore)
```bash
pg_restore -h <host_postgre> -U <usuario> -d <nome_do_banco> -v backup_estetisafe_pre_migration.dump
```

---

## 🚨 4. Plano de Recuperação de Desastres (Disaster Recovery)

Caso ocorra um incidente grave ou perda de conectividade:
1. **RPO (Recovery Point Objective):** O limite aceitável de perda de dados é de no máximo **24 horas** (a janela entre o último backup automático diário e o incidente).
2. **RTO (Recovery Time Objective):** O tempo estimado para restaurar o sistema e restabelecer o banco de dados a partir do último snapshot em produção deve ser menor que **4 horas**.
3. **Teste Anual:** Recomenda-se realizar uma simulação de restauração do banco de dados em ambiente de homologação a cada 12 meses para validar a integridade dos snapshots.
