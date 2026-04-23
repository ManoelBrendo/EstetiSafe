import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import logoPath from './lappui-mark.svg'
import { buildMailtoLink, buildPhoneLink, getSupportContact, hasSupportContact } from './support'
import type { SupportContact } from './types'

interface MarketingColumn {
  icon: IconName
  title: string
  description: string
  bullets: string[]
}

interface StageCard {
  icon: IconName
  eyebrow: string
  title: string
  copy: string
}

interface HighlightCard {
  icon: IconName
  eyebrow?: string
  title: string
  copy: string
}

interface SanitaryTrack {
  title: string
  detail: string
}

interface WorkflowStep {
  step: string
  title: string
  copy: string
}

interface FaqItem {
  id: string
  title: string
  answer: string
}

interface BrandingState {
  name: string
  tagline: string
  clinicLabel: string
  logo: string
  logoAlt: string
  isWhiteLabel: boolean
  poweredBy: string
}

interface MarketingLeadFormState {
  clinicName: string
  contactName: string
  email: string
  phone: string
  city: string
  teamSize: string
  mainGoal: string
  message: string
  requestedDemo: boolean
}

const platformColumns: MarketingColumn[] = [
  {
    icon: 'fileText',
    title: 'Administrativo',
    description: 'Cadastros, organizacao gerencial e visao centralizada para decisoes mais rapidas e seguras.',
    bullets: [
      'Clientes, servicos e profissionais em um fluxo unico.',
      'Gestao da rotina com menos ruido e menos retrabalho.',
      'Mais clareza para quem lidera a clinica e a operacao.',
    ],
  },
  {
    icon: 'calendar',
    title: 'Operacional',
    description: 'Agenda, atendimento, prontuario e execucao do dia a dia em uma interface mais refinada.',
    bullets: [
      'Atendimento com contexto, historico e proximos passos.',
      'Equipe com acesso mais rapido ao que importa em cada etapa.',
      'Fluxo visual mais sofisticado, claro e pratico para a rotina.',
    ],
  },
  {
    icon: 'clipboard',
    title: 'Regularizacao sanitaria',
    description: 'Documentacao, alertas e rastreabilidade para reduzir improviso e fortalecer o padrao da clinica.',
    bullets: [
      'Alvaras, POPs, PGRSS e biosseguranca mais organizados.',
      'Vencimentos, pendencias e registros auditaveis no mesmo ambiente.',
      'Mais respaldo para fiscalizacao, equipe e gestao clinica.',
    ],
  },
]

const stageCards: StageCard[] = [
  {
    icon: 'sparkles',
    eyebrow: 'Percepcao premium',
    title: 'A interface ja comunica padrao elevado de atendimento.',
    copy: 'A clinica transmite mais organizacao, cuidado e sofisticacao desde a primeira leitura.',
  },
  {
    icon: 'users',
    eyebrow: 'Atendimento com contexto',
    title: 'Agenda, prontuario e historico dentro de uma jornada mais elegante.',
    copy: 'A equipe navega melhor e o atendimento ganha consistencia, clareza e apresentacao.',
  },
  {
    icon: 'check',
    eyebrow: 'Controle sanitario',
    title: 'Documentos criticos, alertas e rastreabilidade no mesmo fluxo.',
    copy: 'A regularizacao sanitaria deixa de ficar espalhada e passa a ser acompanhada com metodo.',
  },
]

const heroHighlights: StageCard[] = [
  {
    icon: 'fileText',
    eyebrow: 'Administrativo',
    title: 'Gestao mais clara',
    copy: 'Cadastros, organizacao e visao gerencial em um fluxo que transmite mais profissionalismo.',
  },
  {
    icon: 'calendar',
    eyebrow: 'Operacional',
    title: 'Rotina mais fluida',
    copy: 'Agenda, historico e atendimento em uma jornada mais limpa para equipe e recepcao.',
  },
  {
    icon: 'clipboard',
    eyebrow: 'Sanitario',
    title: 'Regularizacao acompanhada',
    copy: 'Documentos, alertas e registros criticos com mais metodo, visibilidade e prontidao.',
  },
]

const elevatedExperience: HighlightCard[] = [
  {
    icon: 'sparkles',
    title: 'Padrao visual mais alto',
    copy: 'O cliente percebe uma operacao mais seria, refinada e bem organizada antes mesmo de conhecer todos os modulos.',
  },
  {
    icon: 'calendar',
    title: 'Fluxo mais fluido para equipe',
    copy: 'Recepcao, gestao e profissionais encontram informacoes com mais rapidez, reduzindo friccao operacional.',
  },
  {
    icon: 'clipboard',
    title: 'Mais seguranca na rotina',
    copy: 'O administrativo, o operacional e a regularizacao sanitaria passam a conversar no mesmo ambiente.',
  },
]

const sanitaryTracks: SanitaryTrack[] = [
  {
    title: 'Documentacao sanitaria',
    detail: 'Acompanhe alvaras, POPs, manual de biosseguranca, PGRSS e contratos com mais clareza.',
  },
  {
    title: 'Alertas criticos',
    detail: 'Vencimentos e pendencias deixam de ficar escondidos em planilhas ou lembrancas soltas.',
  },
  {
    title: 'Registros auditaveis',
    detail: 'Mantenha historico, logs, responsaveis e evidencias de forma mais acessivel e confiavel.',
  },
  {
    title: 'Prontidao para fiscalizacao',
    detail: 'A clinica ganha mais respaldo para demonstrar metodo, controle e organizacao operacional.',
  },
]

const modules: HighlightCard[] = [
  {
    icon: 'fileText',
    title: 'Documentacao e compliance',
    copy: 'Alvaras, POPs, PGRSS, biosseguranca, responsaveis e vencimentos organizados em um so nucleo.',
  },
  {
    icon: 'users',
    title: 'Clientes e prontuario',
    copy: 'Anamnese, consentimento, historico, evolucao e material de acompanhamento em uma experiencia mais cuidadosa.',
  },
  {
    icon: 'calendar',
    title: 'Agenda e operacao diaria',
    copy: 'Profissional, procedimento, pagamento e contexto do atendimento reunidos em um painel funcional.',
  },
  {
    icon: 'box',
    title: 'Produtos e equipamentos',
    copy: 'Validade, lote, manutencao, dados regulatorios e visao operacional sem depender de controles paralelos.',
  },
]

const workflowSteps: WorkflowStep[] = [
  {
    step: '01',
    title: 'Diagnostico da clinica',
    copy: 'A landing capta contexto real para iniciar uma conversa comercial melhor e mais consultiva.',
  },
  {
    step: '02',
    title: 'Estruturacao da rotina',
    copy: 'O sistema organiza o administrativo, o operacional e a regularizacao sanitaria com visao de produto.',
  },
  {
    step: '03',
    title: 'Elevacao do atendimento',
    copy: 'A equipe passa a trabalhar em um ambiente mais claro, mais sofisticado e mais coerente com o padrao da clinica.',
  },
  {
    step: '04',
    title: 'Mais controle sanitario',
    copy: 'Documentos, alertas, registros e evidencias ficam mais prontos para acompanhamento e fiscalizacao.',
  },
]

const personaCards = [
  {
    title: 'Para a gestao',
    copy: 'Mais visao sobre equipe, processos, documentos, pendencias e percepcao profissional da clinica.',
  },
  {
    title: 'Para o responsavel tecnico',
    copy: 'Mais facilidade para acompanhar documentacao sanitaria, biosseguranca, POPs, PGRSS e registros criticos.',
  },
  {
    title: 'Para a operacao',
    copy: 'Mais clareza no atendimento, menos improviso e uma jornada mais refinada para quem executa no dia a dia.',
  },
]

const faqItems: FaqItem[] = [
  {
    id: 'luxo',
    title: 'A interface sofisticada nao atrapalha a usabilidade?',
    answer: 'Nao. A proposta visual eleva a percepcao de valor, mas a navegacao continua orientada a clareza, ao atendimento e ao controle operacional.',
  },
  {
    id: 'sanitario',
    title: 'Onde entra o diferencial sanitario da plataforma?',
    answer: 'Ele aparece na organizacao documental, nos alertas, nos registros auditaveis e na forma como a clinica passa a acompanhar a regularizacao sanitaria em um so fluxo.',
  },
  {
    id: 'implantacao',
    title: 'Esse posicionamento comercial sustenta a entrega depois da venda?',
    answer: 'Sim. A landing vende uma plataforma sofisticada, mas a base do produto continua sendo rotina organizada, atendimento elevado e acompanhamento sanitario real.',
  },
  {
    id: 'whitelabel',
    title: 'Da para adaptar para a marca da clinica?',
    answer: 'Sim. O topo e os elementos de identidade continuam preparados para white-label com nome, logo e rotulos configuraveis.',
  },
]

const teamSizeOptions = ['', 'Ate 2 profissionais', '3 a 5 profissionais', '6 a 10 profissionais', 'Mais de 10 profissionais']
const goalOptions = ['', 'Organizar documentos e compliance', 'Estruturar prontuario e consentimento', 'Melhorar agenda e equipe', 'Controlar produtos e equipamentos', 'Unificar a gestao da clinica']

const initialForm: MarketingLeadFormState = {
  clinicName: '',
  contactName: '',
  email: '',
  phone: '',
  city: '',
  teamSize: '',
  mainGoal: '',
  message: '',
  requestedDemo: true,
}

function cleanTextValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanLogoValue(value: unknown) {
  const raw = cleanTextValue(value)
  if (!raw) return ''
  if (raw.startsWith('/')) return raw
  if (raw.startsWith('data:image/')) return raw

  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') return raw
  } catch {
    return ''
  }

  return ''
}

function resolveBranding(): BrandingState {
  const env = import.meta.env
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null

  const name = cleanTextValue(params?.get('brandName')) || cleanTextValue(env.VITE_MARKETING_BRAND_NAME) || "L'Appui"
  const tagline =
    cleanTextValue(params?.get('brandTagline')) ||
    cleanTextValue(env.VITE_MARKETING_BRAND_TAGLINE) ||
    'Software para clinicas de estetica'
  const clinicLabel =
    cleanTextValue(params?.get('clinicLabel')) ||
    cleanTextValue(env.VITE_MARKETING_CLINIC_LABEL) ||
    'Interface sofisticada com acompanhamento sanitario'
  const logo = cleanLogoValue(params?.get('brandLogo')) || cleanLogoValue(env.VITE_MARKETING_BRAND_LOGO) || logoPath
  const poweredBy =
    cleanTextValue(params?.get('poweredBy')) ||
    cleanTextValue(env.VITE_MARKETING_POWERED_BY) ||
    "Powered by L'Appui"
  const isWhiteLabel = name !== "L'Appui" || logo !== logoPath || tagline !== 'Software para clinicas de estetica'

  return {
    name,
    tagline,
    clinicLabel,
    logo,
    logoAlt: `Logo ${name}`,
    isWhiteLabel,
    poweredBy: isWhiteLabel ? poweredBy : '',
  }
}

export default function MarketingSite() {
  const [form, setForm] = useState<MarketingLeadFormState>(initialForm)
  const [loading, setLoading] = useState(false)
  const [activeFaq, setActiveFaq] = useState(faqItems[0].id)
  const supportContact = useMemo<SupportContact>(() => getSupportContact(), [])
  const branding = useMemo(() => resolveBranding(), [])
  const canShowSupport = hasSupportContact(supportContact)
  const supportEmailLink = buildMailtoLink(supportContact.email)
  const supportPhoneLink = buildPhoneLink(supportContact.phone)
  const activeFaqCard = faqItems.find(item => item.id === activeFaq) || faqItems[0]

  function updateField<Key extends keyof MarketingLeadFormState>(key: Key, value: MarketingLeadFormState[Key]) {
    setForm(current => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)

    try {
      await api.post('/public/leads', {
        ...form,
        source: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : 'landing-page',
      })
      toast.success('Recebemos seu interesse. Vamos retornar com uma apresentacao em breve.')
      setForm(initialForm)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel enviar seu contato agora'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="leadv2-page">
      <header className="leadv2-topbar">
        <Link to="/" className="leadv2-brand">
          <span className="leadv2-brand-mark">
            <img src={branding.logo} alt={branding.logoAlt} />
          </span>
          <span className="leadv2-brand-copy">
            <strong>{branding.name}</strong>
            <small>{branding.tagline}</small>
          </span>
        </Link>

        <nav className="leadv2-nav">
          <a href="#plataforma">Plataforma</a>
          <a href="#sanitario">Sanitario</a>
          <a href="#modulos">Modulos</a>
          <a href="#diagnostico">Diagnostico</a>
        </nav>

        <div className="leadv2-topbar-actions">
          {branding.poweredBy ? <span className="leadv2-powered-by">{branding.poweredBy}</span> : null}
          <Link className="btn btn-ghost" to="/login">Entrar</Link>
          <a className="btn btn-gold" href="#lead-form">Solicitar apresentacao</a>
        </div>
      </header>

      <main className="leadv2-main">
        <section id="plataforma" className="leadv2-hero">
          <div className="leadv2-copy leadv2-copy-hero">
            <div className="leadv2-copy-content">
              <span className="leadv2-badge">Interface sofisticada para elevar o padrao do atendimento</span>
              <p className="leadv2-kicker">Administrativo, operacional e regularizacao sanitaria em uma mesma experiencia</p>
              <h1>Um aplicativo que reune o administrativo, o operacional e a regularizacao sanitaria da sua clinica.</h1>
              <p className="leadv2-lead">
                {branding.name} foi desenhado para clinicas que querem transmitir mais sofisticacao no atendimento,
                organizar melhor o dia a dia e acompanhar a regularizacao sanitaria com mais clareza, metodo e respaldo.
              </p>

              <div className="leadv2-cta-row">
                <a className="btn btn-gold" href="#lead-form"><Icon name="sparkles" /> Quero uma apresentacao</a>
                <Link className="btn btn-outline" to="/register"><Icon name="plus" /> Criar conta</Link>
              </div>
            </div>

            <div className="leadv2-copy-highlights">
              {heroHighlights.map(item => (
                <article key={item.title} className="leadv2-copy-highlight">
                  <div className="leadv2-copy-highlight-icon"><Icon name={item.icon} size={18} /></div>
                  <span>{item.eyebrow}</span>
                  <strong>{item.title}</strong>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="leadv2-section leadv2-elevated-grid">
          {elevatedExperience.map(card => (
            <article key={card.title} className="leadv2-elevated-card">
              <div className="leadv2-elevated-icon"><Icon name={card.icon} size={18} /></div>
              <strong>{card.title}</strong>
              <p>{card.copy}</p>
            </article>
          ))}
        </section>

        <section className="leadv2-section leadv2-showcase-section">
          <div className="leadv2-showcase-intro">
            <div className="leadv2-section-head">
              <span className="leadv2-badge leadv2-badge-soft">A interface do aplicativo na pratica</span>
              <h2>Depois da mensagem principal, a clinica enxerga a plataforma em um bloco proprio, mais organizado e facil de absorver.</h2>
              <p>Assim a primeira leitura fica mais forte, e a vitrine visual do produto entra no momento certo para reforcar percepcao premium, fluidez operacional e acompanhamento sanitario.</p>
            </div>

            <aside className="leadv2-showcase-callout">
              <strong>Alerta inteligente</strong>
              <span>Documentos criticos, pendencias e vencimentos visiveis antes de virarem problema.</span>
            </aside>
          </div>

          <div className="leadv2-stage leadv2-stage-showcase">
            <div className="leadv2-orb leadv2-orb-a" />
            <div className="leadv2-orb leadv2-orb-b" />

            <div className="leadv2-stage-shell">
              <div className="leadv2-stage-head">
                <div className="leadv2-stage-brand">
                  <div className="leadv2-stage-logo"><img src={branding.logo} alt={branding.logoAlt} /></div>
                  <div>
                    <span>{branding.clinicLabel}</span>
                    <strong>{branding.name}</strong>
                    <p>Uma plataforma elegante para elevar o padrao do atendimento, organizar a operacao e acompanhar a regularizacao sanitaria da clinica.</p>
                  </div>
                </div>
              </div>

              <div className="leadv2-scene-window">
                {stageCards.map(card => (
                  <article key={card.title} className="leadv2-scene-card">
                    <div className="leadv2-scene-card-icon"><Icon name={card.icon} size={18} /></div>
                    <span>{card.eyebrow}</span>
                    <strong>{card.title}</strong>
                    <p>{card.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="sanitario" className="leadv2-section leadv2-pillar-section">
          <div className="leadv2-section-head">
            <span className="leadv2-badge leadv2-badge-soft">O valor do produto na pratica</span>
            <h2>O que a clinica passa a enxergar quando o administrativo, o operacional e o sanitario deixam de ficar separados.</h2>
            <p>Em vez de uma ferramenta bonita isolada, a clinica ganha uma interface sofisticada que tambem sustenta rotina, metodo e regularizacao.</p>
          </div>

          <div className="leadv2-pillar-grid">
            {platformColumns.map(column => (
              <article key={column.title} className="leadv2-pillar-card">
                <div className="leadv2-pillar-icon"><Icon name={column.icon} size={18} /></div>
                <h3>{column.title}</h3>
                <p>{column.description}</p>
                <div className="leadv2-pillar-list">
                  {column.bullets.map(item => (
                    <div key={item} className="leadv2-inline-check">
                      <Icon name="check" size={16} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="leadv2-section leadv2-sanitario-section">
          <div className="leadv2-section-head">
            <span className="leadv2-badge leadv2-badge-soft">Rotina sanitaria acompanhada</span>
            <h2>O diferencial do aplicativo aparece quando a clinica passa a acompanhar o que antes ficava disperso.</h2>
            <p>Documentacao critica, alertas, registros e prontidao para fiscalizacao deixam de depender de improviso, memoria ou planilhas paralelas.</p>
          </div>

          <div className="leadv2-sanitario-layout">
            <div className="leadv2-sanitario-list">
              {sanitaryTracks.map(item => (
                <article key={item.title} className="leadv2-sanitario-item">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>

            <div className="leadv2-sanitario-visual">
              <div className="leadv2-visual-shell">
                <div className="leadv2-visual-panel leadv2-visual-panel-main">
                  <span>Regularizacao sanitaria</span>
                  <strong>Documentos, alertas e registros em um painel mais claro e sofisticado.</strong>
                  <p>O sistema ajuda a clinica a acompanhar o que precisa estar valido, acessivel e bem registrado.</p>
                </div>
                <div className="leadv2-visual-stack">
                  <div className="leadv2-visual-panel">
                    <span>Documentos criticos</span>
                    <strong>Alvara sanitario, POPs, biosseguranca e PGRSS organizados.</strong>
                  </div>
                  <div className="leadv2-visual-panel">
                    <span>Registros auditaveis</span>
                    <strong>Historico, responsaveis e evidencias com mais rastreabilidade.</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modulos" className="leadv2-section leadv2-modules-section">
          <div className="leadv2-section-head">
            <span className="leadv2-badge leadv2-badge-soft">Modulos principais</span>
            <h2>Uma plataforma longa o suficiente para sustentar a operacao e elegante o suficiente para elevar a percepcao do atendimento.</h2>
            <p>O visitante entende que nao esta olhando apenas para um software de agenda, mas para um nucleo mais completo de gestao e conformidade.</p>
          </div>

          <div className="leadv2-module-grid">
            {modules.map(module => (
              <article key={module.title} className="leadv2-module-card">
                <div className="leadv2-module-icon"><Icon name={module.icon} size={20} /></div>
                <h3>{module.title}</h3>
                <p>{module.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="leadv2-section leadv2-persona-section">
          <div className="leadv2-section-head">
            <span className="leadv2-badge leadv2-badge-soft">Quem percebe o valor</span>
            <h2>O sistema melhora a leitura da clinica para quem lidera, para quem executa e para quem responde tecnicamente pela operacao.</h2>
            <p>Essa combinacao de sofisticacao visual com estrutura real de gestao torna a plataforma mais forte comercialmente e mais consistente na pratica.</p>
          </div>

          <div className="leadv2-persona-grid">
            {personaCards.map(card => (
              <article key={card.title} className="leadv2-persona-card">
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="leadv2-section leadv2-flow-section">
          <div className="leadv2-section-head">
            <span className="leadv2-badge leadv2-badge-soft">Jornada comercial e operacional</span>
            <h2>Uma landing pensada para vender bem e um produto pensado para sustentar o que foi prometido.</h2>
            <p>A narrativa visual e funcional mostra que a plataforma melhora percepcao, organiza a operacao e acompanha a regularizacao sanitaria da clinica.</p>
          </div>

          <div className="leadv2-flow-grid">
            {workflowSteps.map(step => (
              <article key={step.step} className="leadv2-flow-card">
                <span>{step.step}</span>
                <strong>{step.title}</strong>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="leadv2-section leadv2-faq-section">
          <div className="leadv2-section-head">
            <span className="leadv2-badge leadv2-badge-soft">Perguntas estrategicas</span>
            <h2>Respostas para quem quer elevar o padrao da clinica sem abrir mao de controle, rastreabilidade e respaldo.</h2>
            <p>Essa area ajuda a landing a vender melhor sem parecer exagerada ou superficial.</p>
          </div>

          <div className="leadv2-faq-layout">
            <div className="leadv2-faq-list">
              {faqItems.map(item => {
                const isActive = item.id === activeFaq
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`leadv2-faq-trigger${isActive ? ' active' : ''}`}
                    onClick={() => setActiveFaq(item.id)}
                  >
                    <strong>{item.title}</strong>
                    <span>{isActive ? 'Resposta aberta' : 'Ver resposta'}</span>
                  </button>
                )
              })}
            </div>

            <article className="leadv2-faq-answer">
              <span className="leadv2-badge leadv2-badge-soft">Resposta em foco</span>
              <h3>{activeFaqCard.title}</h3>
              <p>{activeFaqCard.answer}</p>
            </article>
          </div>
        </section>

        <section id="diagnostico" className="leadv2-section leadv2-diagnostico-section">
          <div className="leadv2-diagnostico-copy">
            <span className="leadv2-badge leadv2-badge-soft">Diagnostico comercial</span>
            <h2>Capte leads com contexto real e ja mostre que a plataforma trabalha imagem, operacao e regularizacao sanitaria juntas.</h2>
            <p>O formulario abaixo continua simples para conversao, mas com informacao suficiente para uma abordagem comercial mais consultiva.</p>
            {canShowSupport ? (
              <div className="leadv2-support-actions">
                {supportEmailLink ? <a className="btn btn-outline btn-sm" href={supportEmailLink}><Icon name="mail" /> {supportContact.email}</a> : null}
                {supportPhoneLink ? <a className="btn btn-ghost btn-sm" href={supportPhoneLink}><Icon name="phone" /> {supportContact.phone}</a> : null}
              </div>
            ) : null}
          </div>

          <form id="lead-form" className="leadv2-form-card" onSubmit={handleSubmit}>
            <div className="leadv2-form-grid">
              <label className="marketing-form-field"><span>Nome da clinica</span><input className="form-input" value={form.clinicName} onChange={event => updateField('clinicName', event.target.value)} placeholder="Ex: Clinica Aurora" required /></label>
              <label className="marketing-form-field"><span>Responsavel</span><input className="form-input" value={form.contactName} onChange={event => updateField('contactName', event.target.value)} placeholder="Seu nome" required /></label>
              <label className="marketing-form-field"><span>E-mail</span><input className="form-input" type="email" value={form.email} onChange={event => updateField('email', event.target.value)} placeholder="contato@clinica.com" required /></label>
              <label className="marketing-form-field"><span>Telefone ou WhatsApp</span><input className="form-input" value={form.phone} onChange={event => updateField('phone', event.target.value)} placeholder="(11) 99999-0000" required /></label>
              <label className="marketing-form-field"><span>Cidade</span><input className="form-input" value={form.city} onChange={event => updateField('city', event.target.value)} placeholder="Sao Paulo" /></label>
              <label className="marketing-form-field"><span>Porte da equipe</span><select className="form-select" value={form.teamSize} onChange={event => updateField('teamSize', event.target.value)}>{teamSizeOptions.map(option => <option key={option || 'empty'} value={option}>{option || 'Selecione o porte da equipe'}</option>)}</select></label>
              <label className="marketing-form-field leadv2-form-full"><span>Prioridade da clinica</span><select className="form-select" value={form.mainGoal} onChange={event => updateField('mainGoal', event.target.value)}>{goalOptions.map(option => <option key={option || 'empty'} value={option}>{option || 'Qual cenario voce quer resolver primeiro'}</option>)}</select></label>
              <label className="marketing-form-field leadv2-form-full"><span>Contexto atual</span><textarea className="form-textarea" rows={5} value={form.message} onChange={event => updateField('message', event.target.value)} placeholder="Ex: hoje usamos planilhas, temos dificuldade com documentacao sanitaria, prontuario e alertas de vencimento." /></label>
            </div>

            <label className="leadv2-consent-row">
              <input type="checkbox" checked={form.requestedDemo} onChange={event => updateField('requestedDemo', event.target.checked)} />
              <span>Quero receber uma apresentacao guiada do sistema.</span>
            </label>

            <button className="btn btn-gold btn-block" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : 'Enviar diagnostico'}</button>
            <p className="leadv2-form-note">Ao enviar, sua clinica entra na base comercial do L'Appui para contato consultivo.</p>
          </form>
        </section>
      </main>
    </div>
  )
}

