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
    description: 'Cadastros, organização gerencial e visão centralizada para decisões mais rápidas e seguras.',
    bullets: [
      'Clientes, serviços e profissionais em um fluxo único.',
      'Gestão da rotina com menos ruído e menos retrabalho.',
      'Mais clareza para quem lidera a clínica e a operação.',
    ],
  },
  {
    icon: 'calendar',
    title: 'Operacional',
    description: 'Agenda, atendimento, prontuário e execução do dia a dia em uma interface mais refinada.',
    bullets: [
      'Atendimento com contexto, histórico e próximos passos.',
      'Equipe com acesso mais rápido ao que importa em cada etapa.',
      'Fluxo visual mais sofisticado, claro e prático para a rotina.',
    ],
  },
  {
    icon: 'clipboard',
    title: 'Regularização sanitária',
    description: 'Documentação, alertas e rastreabilidade para reduzir improviso e fortalecer o padrão da clínica.',
    bullets: [
      'Alvarás, POPs, PGRSS e biossegurança mais organizados.',
      'Vencimentos, pendências e registros auditáveis no mesmo ambiente.',
      'Mais respaldo para fiscalização, equipe e gestão clínica.',
    ],
  },
]

const stageCards: StageCard[] = [
  {
    icon: 'sparkles',
    eyebrow: 'Percepção premium',
    title: 'A interface já comunica padrão elevado de atendimento.',
    copy: 'A clínica transmite mais organização, cuidado e sofisticação desde a primeira leitura.',
  },
  {
    icon: 'users',
    eyebrow: 'Atendimento com contexto',
    title: 'Agenda, prontuário e histórico dentro de uma jornada mais elegante.',
    copy: 'A equipe navega melhor e o atendimento ganha consistência, clareza e apresentação.',
  },
  {
    icon: 'check',
    eyebrow: 'Controle sanitário',
    title: 'Documentos críticos, alertas e rastreabilidade no mesmo fluxo.',
    copy: 'A regularização sanitária deixa de ficar espalhada e passa a ser acompanhada com método.',
  },
]

const heroHighlights: StageCard[] = [
  {
    icon: 'fileText',
    eyebrow: 'Administrativo',
    title: 'Gestão mais clara',
    copy: 'Cadastros, organização e visão gerencial em um fluxo que transmite mais profissionalismo.',
  },
  {
    icon: 'calendar',
    eyebrow: 'Operacional',
    title: 'Rotina mais fluida',
    copy: 'Agenda, histórico e atendimento em uma jornada mais limpa para equipe e recepção.',
  },
  {
    icon: 'clipboard',
    eyebrow: 'Sanitário',
    title: 'Regularização acompanhada',
    copy: 'Documentos, alertas e registros críticos com mais método, visibilidade e prontidão.',
  },
]

const elevatedExperience: HighlightCard[] = [
  {
    icon: 'sparkles',
    title: 'Padrão visual mais alto',
    copy: 'O cliente percebe uma operação mais séria, refinada e bem organizada antes mesmo de conhecer todos os módulos.',
  },
  {
    icon: 'calendar',
    title: 'Fluxo mais fluido para equipe',
    copy: 'Recepção, gestão e profissionais encontram informações com mais rapidez, reduzindo fricção operacional.',
  },
  {
    icon: 'clipboard',
    title: 'Mais segurança na rotina',
    copy: 'O administrativo, o operacional e a regularização sanitária passam a conversar no mesmo ambiente.',
  },
]

const sanitaryTracks: SanitaryTrack[] = [
  {
    title: 'Documentação sanitária',
    detail: 'Acompanhe alvarás, POPs, manual de biossegurança, PGRSS e contratos com mais clareza.',
  },
  {
    title: 'Alertas críticos',
    detail: 'Vencimentos e pendências deixam de ficar escondidos em planilhas ou lembranças soltas.',
  },
  {
    title: 'Registros auditáveis',
    detail: 'Mantenha histórico, logs, responsáveis e evidências de forma mais acessível e confiável.',
  },
  {
    title: 'Prontidão para fiscalização',
    detail: 'A clínica ganha mais respaldo para demonstrar método, controle e organização operacional.',
  },
]

const modules: HighlightCard[] = [
  {
    icon: 'fileText',
    title: 'Documentação e compliance',
    copy: 'Alvarás, POPs, PGRSS, biossegurança, responsáveis e vencimentos organizados em um só núcleo.',
  },
  {
    icon: 'users',
    title: 'Clientes e prontuário',
    copy: 'Anamnese, consentimento, histórico, evolução e material de acompanhamento em uma experiência mais cuidadosa.',
  },
  {
    icon: 'calendar',
    title: 'Agenda e operação diária',
    copy: 'Profissional, procedimento, pagamento e contexto do atendimento reunidos em um painel funcional.',
  },
  {
    icon: 'box',
    title: 'Produtos e equipamentos',
    copy: 'Validade, lote, manutenção, dados regulatórios e visão operacional sem depender de controles paralelos.',
  },
]

const workflowSteps: WorkflowStep[] = [
  {
    step: '01',
    title: 'Diagnóstico da clínica',
    copy: 'A landing capta contexto real para iniciar uma conversa comercial melhor e mais consultiva.',
  },
  {
    step: '02',
    title: 'Estruturação da rotina',
    copy: 'O sistema organiza o administrativo, o operacional e a regularização sanitária com visão de produto.',
  },
  {
    step: '03',
    title: 'Elevação do atendimento',
    copy: 'A equipe passa a trabalhar em um ambiente mais claro, mais sofisticado e mais coerente com o padrão da clínica.',
  },
  {
    step: '04',
    title: 'Mais controle sanitario',
    copy: 'Documentos, alertas, registros e evidências ficam mais prontos para acompanhamento e fiscalização.',
  },
]

const personaCards = [
  {
    title: 'Para a gestão',
    copy: 'Mais visão sobre equipe, processos, documentos, pendências e percepção profissional da clínica.',
  },
  {
    title: 'Para o responsável técnico',
    copy: 'Mais facilidade para acompanhar documentação sanitária, biossegurança, POPs, PGRSS e registros críticos.',
  },
  {
    title: 'Para a operação',
    copy: 'Mais clareza no atendimento, menos improviso e uma jornada mais refinada para quem executa no dia a dia.',
  },
]

const faqItems: FaqItem[] = [
  {
    id: 'luxo',
    title: 'A interface sofisticada não atrapalha a usabilidade?',
    answer: 'Não. A proposta visual eleva a percepção de valor, mas a navegação continua orientada à clareza, ao atendimento e ao controle operacional.',
  },
  {
    id: 'sanitario',
    title: 'Onde entra o diferencial sanitário da plataforma?',
    answer: 'Ele aparece na organização documental, nos alertas, nos registros auditáveis e na forma como a clínica passa a acompanhar a regularização sanitária em um s? fluxo.',
  },
  {
    id: 'implantacao',
    title: 'Esse posicionamento comercial sustenta a entrega depois da venda?',
    answer: 'Sim. A landing vende uma plataforma sofisticada, mas a base do produto continua sendo rotina organizada, atendimento elevado e acompanhamento sanitario real.',
  },
  {
    id: 'whitelabel',
    title: 'Dá para adaptar para a marca da clínica?',
    answer: 'Sim. O topo e os elementos de identidade continuam preparados para white-label com nome, logo e rótulos configuráveis.',
  },
]

const teamSizeOptions = ['', 'Até 2 profissionais', '3 a 5 profissionais', '6 a 10 profissionais', 'Mais de 10 profissionais']
const goalOptions = ['', 'Organizar documentos e compliance', 'Estruturar prontuário e consentimento', 'Melhorar agenda e equipe', 'Controlar produtos e equipamentos', 'Unificar a gestão da clínica']

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
    'Software para clínicas de estética'
  const clinicLabel =
    cleanTextValue(params?.get('clinicLabel')) ||
    cleanTextValue(env.VITE_MARKETING_CLINIC_LABEL) ||
    'Interface sofisticada com acompanhamento sanitário'
  const logo = cleanLogoValue(params?.get('brandLogo')) || cleanLogoValue(env.VITE_MARKETING_BRAND_LOGO) || logoPath
  const poweredBy =
    cleanTextValue(params?.get('poweredBy')) ||
    cleanTextValue(env.VITE_MARKETING_POWERED_BY) ||
    "Powered by L'Appui"
  const isWhiteLabel = name !== "L'Appui" || logo !== logoPath || tagline !== 'Software para clínicas de estética'

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
      toast.success('Recebemos seu interesse. Vamos retornar com uma apresentação em breve.')
      setForm(initialForm)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível enviar seu contato agora'))
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
          <a href="#sanitario">Sanitário</a>
          <a href="#modulos">Módulos</a>
          <a href="#diagnóstico">Diagnóstico</a>
        </nav>

        <div className="leadv2-topbar-actions">
          {branding.poweredBy ? <span className="leadv2-powered-by">{branding.poweredBy}</span> : null}
          <Link className="btn btn-ghost" to="/login">Entrar</Link>
          <a className="btn btn-gold" href="#lead-form">Solicitar apresentação</a>
        </div>
      </header>

      <main className="leadv2-main">
        <section id="plataforma" className="leadv2-hero">
          <div className="leadv2-copy leadv2-copy-hero">
            <div className="leadv2-copy-content">
              <span className="leadv2-badge">Interface sofisticada para elevar o padrão do atendimento</span>
              <p className="leadv2-kicker">Administrativo, operacional e regularização sanitária em uma mesma experiência</p>
              <h1>Um aplicativo que reúne o administrativo, o operacional e a regularização sanitária da sua clínica.</h1>
              <p className="leadv2-lead">
                {branding.name} foi desenhado para clínicas que querem transmitir mais sofisticação no atendimento,
                organizar melhor o dia a dia e acompanhar a regularização sanitária com mais clareza, método e respaldo.
              </p>

              <div className="leadv2-cta-row">
                <a className="btn btn-gold" href="#lead-form"><Icon name="sparkles" /> Quero uma apresentação</a>
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
              <span className="leadv2-badge leadv2-badge-soft">A interface do aplicativo na prática</span>
              <h2>Depois da mensagem principal, a clínica enxerga a plataforma em um bloco próprio, mais organizado e fácil de absorver.</h2>
              <p>Assim a primeira leitura fica mais forte, e a vitrine visual do produto entra no momento certo para reforçar percepção premium, fluidez operacional e acompanhamento sanitário.</p>
            </div>

            <aside className="leadv2-showcase-callout">
              <strong>Alerta inteligente</strong>
              <span>Documentos críticos, pendências e vencimentos visíveis antes de virarem problema.</span>
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
                    <p>Uma plataforma elegante para elevar o padrão do atendimento, organizar a operação e acompanhar a regularização sanitária da clínica.</p>
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
            <span className="leadv2-badge leadv2-badge-soft">O valor do produto na prática</span>
            <h2>O que a clínica passa a enxergar quando o administrativo, o operacional e o sanitário deixam de ficar separados.</h2>
            <p>Em vez de uma ferramenta bonita isolada, a clínica ganha uma interface sofisticada que também sustenta rotina, método e regularização.</p>
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
            <span className="leadv2-badge leadv2-badge-soft">Rotina sanitária acompanhada</span>
            <h2>O diferencial do aplicativo aparece quando a clínica passa a acompanhar o que antes ficava disperso.</h2>
            <p>Documentação crítica, alertas, registros e prontidão para fiscalização deixam de depender de improviso, memória ou planilhas paralelas.</p>
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
                  <span>Regularização sanitária</span>
                  <strong>Documentos, alertas e registros em um painel mais claro e sofisticado.</strong>
                  <p>O sistema ajuda a clínica a acompanhar o que precisa estar válido, acessível e bem registrado.</p>
                </div>
                <div className="leadv2-visual-stack">
                  <div className="leadv2-visual-panel">
                    <span>Documentos críticos</span>
                    <strong>Alvará sanitário, POPs, biossegurança e PGRSS organizados.</strong>
                  </div>
                  <div className="leadv2-visual-panel">
                    <span>Registros auditáveis</span>
                    <strong>Histórico, responsáveis e evidências com mais rastreabilidade.</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modulos" className="leadv2-section leadv2-modules-section">
          <div className="leadv2-section-head">
            <span className="leadv2-badge leadv2-badge-soft">Módulos principais</span>
            <h2>Uma plataforma ampla o suficiente para sustentar a operação e elegante o suficiente para elevar a percepção do atendimento.</h2>
            <p>O visitante entende que não está olhando apenas para um software de agenda, mas para um núcleo mais completo de gestão e conformidade.</p>
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
            <h2>O sistema melhora a leitura da clínica para quem lidera, para quem executa e para quem responde tecnicamente pela operação.</h2>
            <p>Essa combinação de sofisticação visual com estrutura real de gestão torna a plataforma mais forte comercialmente e mais consistente na prática.</p>
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
            <p>A narrativa visual e funcional mostra que a plataforma melhora percepção, organiza a operação e acompanha a regularização sanitária da clínica.</p>
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
            <span className="leadv2-badge leadv2-badge-soft">Perguntas estratégicas</span>
            <h2>Respostas para quem quer elevar o padrão da clínica sem abrir mão de controle, rastreabilidade e respaldo.</h2>
            <p>Essa área ajuda a landing a vender melhor sem parecer exagerada ou superficial.</p>
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

            <article key={activeFaq} className="leadv2-faq-answer animate-fade-in-up">
              <span className="leadv2-badge leadv2-badge-soft">Resposta em foco</span>
              <h3>{activeFaqCard.title}</h3>
              <p>{activeFaqCard.answer}</p>
            </article>
          </div>
        </section>

        <section id="diagnóstico" className="leadv2-section leadv2-diagnóstico-section">
          <div className="leadv2-diagnóstico-copy">
            <span className="leadv2-badge leadv2-badge-soft">Diagnóstico comercial</span>
            <h2>Capte leads com contexto real e já mostre que a plataforma trabalha imagem, operação e regularização sanitária juntas.</h2>
            <p>O formulário abaixo continua simples para conversão, mas com informação suficiente para uma abordagem comercial mais consultiva.</p>
            {canShowSupport ? (
              <div className="leadv2-support-actions">
                {supportEmailLink ? <a className="btn btn-outline btn-sm" href={supportEmailLink}><Icon name="mail" /> {supportContact.email}</a> : null}
                {supportPhoneLink ? <a className="btn btn-ghost btn-sm" href={supportPhoneLink}><Icon name="phone" /> {supportContact.phone}</a> : null}
              </div>
            ) : null}
          </div>

          <form id="lead-form" className="leadv2-form-card" onSubmit={handleSubmit}>
            <div className="leadv2-form-grid">
              <label htmlFor="lead-clinic-name" className="marketing-form-field"><span>Nome da clínica</span><input id="lead-clinic-name" className="form-input" value={form.clinicName} onChange={event => updateField('clinicName', event.target.value)} placeholder="Ex: Clínica Aurora" required /></label>
              <label htmlFor="lead-contact-name" className="marketing-form-field"><span>Responsável</span><input id="lead-contact-name" className="form-input" value={form.contactName} onChange={event => updateField('contactName', event.target.value)} placeholder="Seu nome" required /></label>
              <label htmlFor="lead-email" className="marketing-form-field"><span>E-mail</span><input id="lead-email" className="form-input" type="email" value={form.email} onChange={event => updateField('email', event.target.value)} placeholder="contato@clínica.com" required /></label>
              <label htmlFor="lead-phone" className="marketing-form-field"><span>Telefone ou WhatsApp</span><input id="lead-phone" className="form-input" value={form.phone} onChange={event => updateField('phone', event.target.value)} placeholder="(11) 99999-0000" required /></label>
              <label htmlFor="lead-city" className="marketing-form-field"><span>Cidade</span><input id="lead-city" className="form-input" value={form.city} onChange={event => updateField('city', event.target.value)} placeholder="São Paulo" /></label>
              <label htmlFor="lead-team-size" className="marketing-form-field"><span>Porte da equipe</span><select id="lead-team-size" className="form-select" value={form.teamSize} onChange={event => updateField('teamSize', event.target.value)}>{teamSizeOptions.map(option => <option key={option || 'empty'} value={option}>{option || 'Selecione o porte da equipe'}</option>)}</select></label>
              <label htmlFor="lead-main-goal" className="marketing-form-field leadv2-form-full"><span>Prioridade da clínica</span><select id="lead-main-goal" className="form-select" value={form.mainGoal} onChange={event => updateField('mainGoal', event.target.value)}>{goalOptions.map(option => <option key={option || 'empty'} value={option}>{option || 'Qual cenário você quer resolver primeiro'}</option>)}</select></label>
              <label htmlFor="lead-message" className="marketing-form-field leadv2-form-full"><span>Contexto atual</span><textarea id="lead-message" className="form-textarea" rows={5} value={form.message} onChange={event => updateField('message', event.target.value)} placeholder="Ex: hoje usamos planilhas, temos dificuldade com documentação sanitária, prontuário e alertas de vencimento." /></label>
            </div>

            <label htmlFor="lead-requested-demo" className="leadv2-consent-row">
              <input id="lead-requested-demo" type="checkbox" checked={form.requestedDemo} onChange={event => updateField('requestedDemo', event.target.checked)} />
              <span>Quero receber uma apresentação guiada do sistema.</span>
            </label>

            <button id="lead-submit-btn" className="btn btn-gold btn-block" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : 'Enviar diagnóstico'}</button>
            <p className="leadv2-form-note">Ao enviar, sua clínica entra na base comercial do L'Appui para contato consultivo.</p>
          </form>
        </section>
      </main>
    </div>
  )
}

