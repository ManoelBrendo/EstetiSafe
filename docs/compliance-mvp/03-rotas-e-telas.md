# Rotas e Telas

## Estado atual do frontend

Rotas implementadas hoje:

- `/login`
- `/register`
- `/`
- `/clientes`
- `/agendamentos`
- `/servicos`
- `/profissionais`

Estas rotas devem ser preservadas como nucleo operacional do novo produto.

## Proposta de navegacao v2

### Grupo 1 - Operacao da clinica
- `/dashboard`
- `/clientes`
- `/clientes/:id`
- `/clientes/:id/consentimentos/:consentRecordId/assinar`
- `/agendamentos`
- `/servicos`
- `/profissionais`
- `/procedimentos`

### Grupo 2 - Compliance documental
- `/documentos`
- `/documentos/:id`
- `/documentos/alertas`
- `/documentos/controlados`
- `/documentos/controlados/:id`

### Grupo 3 - Biosseguranca e rotina
- `/operacao/esterilizacao`
- `/operacao/limpeza`
- `/operacao/equipamentos`
- `/operacao/manutencoes`

### Grupo 4 - Estoque e residuos
- `/insumos`
- `/insumos/lotes`
- `/residuos/coletoras`
- `/residuos/coletas`

### Grupo 5 - Auditoria e configuracao
- `/auditoria`
- `/auditoria/findings`
- `/auditoria/relatorios`
- `/configuracoes/clinica`
- `/configuracoes/equipe`

## Proposta de menu lateral

1. Dashboard
2. Clientes
3. Agenda
4. Procedimentos
5. Documentos
6. Biosseguranca
7. Insumos
8. Residuos
9. Auditoria
10. Configuracoes

## Telas principais

### 1. Dashboard de conformidade

Objetivo:
- Ser a pagina inicial do gestor.

Blocos principais:
- Score geral da clinica.
- Alertas criticos.
- Documentos vencendo.
- Registros operacionais faltantes.
- Receita e operacao do mes.
- Proximos agendamentos.
- CTA `Simular fiscalizacao`.

### 2. Centro de documentos

Objetivo:
- Concentrar todos os documentos obrigatorios e suas evidencias.

Layout sugerido:
- Coluna esquerda: categorias.
- Centro: lista de documentos com filtros.
- Painel direito: vencimento, versao ativa, historico, responsavel e upload.

Acoes:
- Criar documento.
- Enviar nova versao.
- Marcar revisao.
- Baixar versao anterior.

### 3. Documento controlado (POP / Manual / PGRSS)

Objetivo:
- Editar, versionar e publicar documentos sanitarios.

Blocos:
- Cabecalho com tipo e status.
- Timeline de versoes.
- Conteudo rico ou arquivo anexo.
- Metadados de vigencia e revisao.
- Botao `Publicar versao`.

### 4. Esterilizacao

Objetivo:
- Registrar ciclos com rastreabilidade.

Blocos:
- Filtro por equipamento e periodo.
- Formulario rapido de novo ciclo.
- Lista de ciclos com resultado de indicadores.
- Estado de liberacao da carga.

### 5. Limpeza e rotina

Objetivo:
- Tornar checklists operacionais rapidos e auditaveis.

Blocos:
- Selecao de template.
- Respostas por item.
- Turno, area e responsavel.
- Historico de execucoes.

### 6. Cliente 360

Objetivo:
- Unificar cadastro, anamnese, consentimento e evolucao.

Fluxo recomendado:
- Ao salvar um novo cliente, a interface oferece `Gerar termo de consentimento agora` como proximo passo imediato.
- Ao confirmar, o sistema abre uma tela de assinatura dentro do contexto do proprio cliente.
- O prontuario do cliente passa a mostrar o estado do consentimento: pendente, assinado, expirado ou revogado.

Abas:
- Resumo
- Anamnese
- Consentimentos
- Assinatura do termo
- Procedimentos
- Evolucao
- Arquivos anexos

### 7. Insumos e lotes

Objetivo:
- Rastrear lote, validade e uso por procedimento.

Blocos:
- Lista de produtos.
- Lotes com validade.
- Alertas de vencimento.
- Vinculo com procedimentos realizados.

### 8. Residuos

Objetivo:
- Guardar contratos e evidencias de coleta.

Blocos:
- Empresa coletora.
- Contrato ativo.
- Historico de coletas.
- Comprovantes anexados.

### 9. Auditoria

Objetivo:
- Simular a percepcao da vigilancia sanitaria.

Blocos:
- Score por categoria.
- Findings por severidade.
- Itens conformes, pendentes e nao aplicaveis.
- Acao recomendada por finding.
- Botao para exportar PDF.

## Comportamento mobile

- Dashboard precisa funcionar em cards empilhados.
- Listas grandes devem virar cards ou tabela com scroll horizontal controlado.
- Formularios criticos devem ser em wizard simples no mobile.
- Modulo de checklist deve privilegiar toque rapido e confirmacoes simples.
- Assinatura deve abrir em canvas full-width quando chegar a fase de consentimento.
