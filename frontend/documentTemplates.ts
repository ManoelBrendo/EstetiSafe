import type { DocumentCategory } from './operationsTypes'

interface DocumentTemplateInput {
  requirement: string
  category: DocumentCategory
  categoryLabel: string
  clinicName: string
  sourceScopeLabels?: string[]
  generatedAt?: string
}

interface DocumentTemplateContent {
  objective: string
  sections: string[]
  checklist: string[]
  responsible: string
}

const templateCatalog: Record<string, DocumentTemplateContent> = {
  'ficha de avaliacao facial': {
    objective: 'Registrar avaliação estética facial, histórico relevante, queixa principal, plano de cuidado e evolução comparável.',
    sections: ['Identificação da cliente', 'Queixa principal', 'Histórico e contraindicações', 'Avaliação da pele', 'Plano proposto', 'Evolução e revisão'],
    checklist: ['Registrar data e profissional responsável', 'Descrever achados sem diagnóstico médico', 'Anexar fotos somente com autorização vigente', 'Revisar antes de novo protocolo'],
    responsible: 'Profissional responsável',
  },
  'termo de uso de imagem antes depois': {
    objective: 'Formalizar ciência e autorização específica para registro, armazenamento e eventual uso de imagem clínica.',
    sections: ['Finalidade da imagem', 'Limites de uso', 'Canais autorizados', 'Prazo e revogação', 'Assinatura da cliente'],
    checklist: ['Separar uso clínico de uso publicitário', 'Permitir negativa sem prejuízo do atendimento', 'Registrar data e versão do termo', 'Guardar evidência assinada'],
    responsible: 'Administrativo + profissional responsável',
  },
  'termo especifico para injetaveis': {
    objective: 'Registrar ciência sobre objetivo, riscos, limitações, cuidados e autorização para procedimento injetável ou minimamente invasivo.',
    sections: ['Procedimento autorizado', 'Riscos e intercorrências possíveis', 'Contraindicações informadas', 'Cuidados pré e pós', 'Assinaturas'],
    checklist: ['Validar anamnese antes da assinatura', 'Descrever produto/técnica quando aplicável', 'Registrar lote em documento operacional próprio', 'Orientar retorno e sinais de alerta'],
    responsible: 'Responsável técnico',
  },
  'ficha de contraindicacoes para injetaveis': {
    objective: 'Triar fatores de risco antes de procedimento injetável, apoiando decisão técnica e rastreabilidade.',
    sections: ['Histórico de saúde', 'Medicamentos em uso', 'Alergias relatadas', 'Procedimentos recentes', 'Conduta definida'],
    checklist: ['Revisar respostas afirmativas com o responsável técnico', 'Registrar motivo de adiamento quando houver', 'Atualizar em novo ciclo de tratamento', 'Manter no prontuário'],
    responsible: 'Responsável técnico',
  },
  'termo de consentimento para laser e fototerapia': {
    objective: 'Registrar ciência sobre uso de tecnologia, riscos, contraindicações, cuidados e autorização para laser ou fototerapia.',
    sections: ['Tecnologia utilizada', 'Área tratada', 'Riscos e desconfortos esperados', 'Contraindicações', 'Cuidados antes e depois', 'Assinaturas'],
    checklist: ['Conferir fototipo e exposição solar recente', 'Registrar parâmetros em ficha técnica quando aplicável', 'Orientar proteção solar', 'Suspender em contraindicação relevante'],
    responsible: 'Responsável técnico',
  },
  'manual do equipamento laser': {
    objective: 'Organizar referência interna sobre operação, segurança, limpeza, manutenção e uso do equipamento.',
    sections: ['Identificação do equipamento', 'Indicações internas de uso', 'Segurança e EPIs', 'Limpeza e armazenamento', 'Manutenção e calibração', 'Treinamento da equipe'],
    checklist: ['Manter manual do fabricante anexado', 'Registrar série/modelo', 'Conferir manutenção vigente', 'Restringir operação a profissional treinado'],
    responsible: 'Responsável técnico',
  },
  'treinamento de seguranca em laser': {
    objective: 'Comprovar que a equipe recebeu orientação sobre segurança, operação e condutas em uso de tecnologia.',
    sections: ['Participantes', 'Conteúdo aplicado', 'Instrutor ou responsável', 'Data e carga horária', 'Assinaturas'],
    checklist: ['Listar profissionais autorizados', 'Repetir treinamento quando houver equipamento novo', 'Guardar evidência assinada', 'Vincular à rotina de manutenção'],
    responsible: 'Gestão da clínica',
  },
  'ficha de avaliacao corporal': {
    objective: 'Registrar avaliação corporal, medidas, queixas, plano de cuidado e evolução comparável entre sessões.',
    sections: ['Identificação da cliente', 'Queixa e objetivo', 'Histórico relevante', 'Medidas iniciais', 'Plano proposto', 'Evolução'],
    checklist: ['Registrar método de medição', 'Manter comparativos datados', 'Evitar promessas de resultado', 'Atualizar em reavaliações'],
    responsible: 'Profissional responsável',
  },
  'registro de medidas e evolucao corporal': {
    objective: 'Acompanhar evolução objetiva de medidas e observações do protocolo corporal.',
    sections: ['Data da sessão', 'Medidas acompanhadas', 'Observações clínicas', 'Conduta seguinte', 'Profissional'],
    checklist: ['Usar sempre o mesmo padrão de medição', 'Registrar intercorrências quando houver', 'Separar evolução de material publicitário', 'Validar com a cliente quando necessário'],
    responsible: 'Profissional responsável',
  },
  'termo de ciencia de riscos e limitacoes': {
    objective: 'Registrar que a cliente compreende riscos, limites de resultado, cuidados necessários e critérios de interrupção.',
    sections: ['Procedimento ou protocolo', 'Benefícios esperados', 'Riscos e limitações', 'Cuidados obrigatórios', 'Critérios de suspensão', 'Assinaturas'],
    checklist: ['Usar linguagem simples', 'Não prometer resultado garantido', 'Registrar dúvidas esclarecidas', 'Guardar termo final assinado'],
    responsible: 'Responsável técnico',
  },
  'pop de intercorrencias e eventos adversos': {
    objective: 'Padronizar resposta da equipe diante de intercorrência, evento adverso ou sinal de alerta.',
    sections: ['Identificação do evento', 'Classificação de gravidade', 'Primeiras condutas', 'Comunicação interna', 'Registro e acompanhamento', 'Encaminhamento externo'],
    checklist: ['Definir responsável por decisão técnica', 'Registrar horário e conduta', 'Anexar evidências quando houver', 'Revisar preventivamente após cada ocorrência'],
    responsible: 'Responsável técnico',
  },
  'plano de emergencia clinica': {
    objective: 'Definir responsáveis, contatos, materiais e fluxo mínimo para resposta rápida a urgência na clínica.',
    sections: ['Contatos de emergência', 'Responsáveis internos', 'Materiais disponíveis', 'Fluxo de acionamento', 'Registro pós-evento'],
    checklist: ['Manter contatos atualizados', 'Treinar equipe periodicamente', 'Revisar validade de materiais', 'Registrar simulações internas'],
    responsible: 'Gestão da clínica + responsável técnico',
  },
}

function normalizeTemplateKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function slugify(value: string) {
  return normalizeTemplateKey(value).replace(/\s+/g, '-').slice(0, 70) || 'documento'
}

function fallbackTemplate(requirement: string, categoryLabel: string): DocumentTemplateContent {
  return {
    objective: `Criar uma base organizada para ${requirement}, com campos essenciais, responsáveis e evidência final anexável ao SaaS.`,
    sections: ['Identificação da clínica', 'Finalidade do documento', 'Dados obrigatórios', 'Responsável pela revisão', 'Assinaturas ou evidências'],
    checklist: ['Preencher antes de salvar como documento final', 'Revisar com o responsável da área', 'Anexar versão final assinada quando aplicável', `Classificar em ${categoryLabel}`],
    responsible: categoryLabel === 'Sanitário' ? 'Responsável técnico' : 'Administrativo',
  }
}

export function createDocumentTemplateFile(input: DocumentTemplateInput) {
  const categoryLabel = input.categoryLabel || input.category
  const template = templateCatalog[normalizeTemplateKey(input.requirement)] || fallbackTemplate(input.requirement, categoryLabel)
  const generatedAt = input.generatedAt || new Date().toISOString()
  const generatedAtLabel = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(generatedAt))
  const profileLabel = input.sourceScopeLabels?.length ? input.sourceScopeLabels.join(', ') : 'Base documental geral'
  const title = `Modelo base - ${input.requirement}`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #2d241c; margin: 40px; line-height: 1.55; }
    header { border-bottom: 2px solid #c59a5a; margin-bottom: 24px; padding-bottom: 16px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { margin-top: 24px; font-size: 16px; color: #6f4b22; }
    .meta { color: #6f6258; font-size: 13px; }
    .notice { background: #fff8ed; border: 1px solid #ead7b8; padding: 12px; margin: 18px 0; }
    .field { border-bottom: 1px solid #d8cab7; min-height: 28px; margin: 8px 0 14px; }
    li { margin-bottom: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Clínica: ${escapeHtml(input.clinicName || 'Clínica')} · Categoria: ${escapeHtml(categoryLabel)} · Perfil: ${escapeHtml(profileLabel)}</div>
    <div class="meta">Gerado pelo L'Appui em ${escapeHtml(generatedAtLabel)}</div>
  </header>
  <div class="notice"><strong>Atenção:</strong> este é um modelo de preenchimento. A auditoria deve receber a versão final revisada, assinada ou comprovada quando aplicável.</div>
  <h2>Objetivo</h2>
  <p>${escapeHtml(template.objective)}</p>
  <h2>Campos e seções sugeridas</h2>
  ${template.sections.map(section => `<p><strong>${escapeHtml(section)}</strong></p><div class="field"></div>`).join('')}
  <h2>Checklist antes de anexar no SaaS</h2>
  <ul>${template.checklist.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  <h2>Responsável sugerido</h2>
  <p>${escapeHtml(template.responsible)}</p>
  <h2>Assinaturas / validação</h2>
  <p>Cliente ou representante:</p><div class="field"></div>
  <p>Profissional responsável:</p><div class="field"></div>
  <p>Data:</p><div class="field"></div>
</body>
</html>`

  return {
    fileName: `modelo-lappui-${slugify(input.requirement)}.html`,
    fileMimeType: 'text/html;charset=utf-8',
    fileDataUrl: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    suggestedNotes: `Modelo base gerado pelo L'Appui para ${input.requirement}. Anexe a versão final preenchida/assinada quando estiver concluída.`,
  }
}
