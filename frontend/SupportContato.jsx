import { useMemo } from 'react'
import { Icon } from './Icon'
import { useAuth } from './useAuth'
import { buildMailtoLink, buildPhoneLink, getSupportContact, hasSupportContact } from './support'

export default function SupportContato() {
  const { user } = useAuth()

  const contact = useMemo(
    () => getSupportContact(user?.supportContact || {}),
    [user?.supportContact]
  )

  const hasContact = hasSupportContact(user?.supportContact || {})
  const emailLink = buildMailtoLink(contact.email)
  const phoneLink = buildPhoneLink(contact.phone)

  return (
    <div className="page support-contact-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contatar suporte</h1>
          <p className="page-subtitle">
            Canal direto para dúvidas, ajustes, manutenção de conta, atualização da plataforma e apoio operacional.
          </p>
        </div>
      </div>

      <div className="support-contact-grid">
        <section className="card support-contact-card">
          <span className="eyebrow">Responsável</span>
          <h2 className="section-title">{contact.name || "Suporte L'Appui"}</h2>
          <p className="section-copy">
            Use este canal quando precisar de orientação, liberação de acesso, ajuste de cadastro ou apoio técnico na clínica.
          </p>
        </section>

        <section className="card support-contact-card">
          <span className="eyebrow">E-mail</span>
          <h2 className="section-title">{contact.email || 'Ainda não configurado'}</h2>
          <p className="section-copy">Ideal para solicitações formais, envio de detalhes do problema e histórico de atendimento.</p>
          {emailLink ? (
            <a className="btn btn-outline" href={emailLink}>
              <Icon name="mail" /> Enviar e-mail
            </a>
          ) : null}
        </section>

        <section className="card support-contact-card">
          <span className="eyebrow">Telefone</span>
          <h2 className="section-title">{contact.phone || 'Ainda não configurado'}</h2>
          <p className="section-copy">Melhor canal para urgências, suporte rápido e alinhamentos curtos durante a rotina da clínica.</p>
          {phoneLink ? (
            <a className="btn btn-gold" href={phoneLink}>
              <Icon name="phone" /> Ligar agora
            </a>
          ) : null}
        </section>
      </div>

      <section className="card section-card documents-main-card">
        <div className="section-head">
          <div>
            <h2 className="section-title">Quando acionar o suporte</h2>
            <p className="section-copy">Alguns cenários em que vale chamar ajuda imediatamente.</p>
          </div>
        </div>

        <div className="document-card-list">
          <article className="document-card">
            <h3 className="document-card-title">Acesso e autenticação</h3>
            <p className="document-card-subtitle">Recuperação de entrada, sessão de manutenção e suporte para troca de credenciais.</p>
          </article>
          <article className="document-card">
            <h3 className="document-card-title">Ajustes operacionais</h3>
            <p className="document-card-subtitle">Correção de cadastro, orientação de uso e dúvidas sobre fluxo clínico e administrativo.</p>
          </article>
          <article className="document-card">
            <h3 className="document-card-title">Atualizações da plataforma</h3>
            <p className="document-card-subtitle">Solicitações de melhoria, acompanhamento de release e ajustes feitos durante a manutenção.</p>
          </article>
        </div>
      </section>

      {!hasContact ? (
        <section className="card section-card support-empty-state">
          <h2 className="section-title">Canais ainda não configurados</h2>
          <p className="section-copy">
            Defina `SUPPORT_CONTACT_*` no backend e `VITE_SUPPORT_*` no frontend para publicar os contatos reais do suporte nesta tela e também na área de login.
          </p>
        </section>
      ) : null}
    </div>
  )
}
