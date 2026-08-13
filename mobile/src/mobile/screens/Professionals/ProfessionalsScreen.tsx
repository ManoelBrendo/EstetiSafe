import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { professionalsApi } from '../../../shared/api/professionals'
import { Card } from '../../../shared/components/Card'
import { ConnectionNotice } from '../../../shared/components/ConnectionNotice'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ListSummary } from '../../../shared/components/ListSummary'
import { MetricPill } from '../../../shared/components/MetricPill'
import { SearchField } from '../../../shared/components/SearchField'
import { ScreenHeader } from '../../../shared/components/ScreenHeader'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { demoProfessionals } from '../../../shared/data/demoData'
import { colors, radius, spacing, typography } from '../../../shared/theme/theme'
import type { ProfessionalSummary } from '../../../shared/types/operations'
import { formatCurrency } from '../../../shared/utils/formatters'

const emptyProfessionalForm = {
  name: '',
  specialty: '',
  phone: '',
  notes: '',
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}

export function ProfessionalsScreen() {
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>(demoProfessionals)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyProfessionalForm)
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const nextProfessionals = await professionalsApi.list()
      setProfessionals(nextProfessionals)
      setOffline(false)
    } catch {
      setProfessionals(demoProfessionals)
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const payrollTotal = useMemo(
    () => professionals.reduce((total, item) => total + Number(item.payroll?.estimatedPayout || 0), 0),
    [professionals]
  )

  const appointmentsTotal = useMemo(
    () => professionals.reduce((total, item) => total + Number(item.payroll?.completedAppointments || 0), 0),
    [professionals]
  )

  const visibleProfessionals = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return professionals

    return professionals.filter(professional =>
      [
        professional.name,
        professional.specialty,
        professional.phone,
        professional.notes,
        professional.availabilitySummary,
        professional.compensationSummary,
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    )
  }, [professionals, searchTerm])

  const listCopy = useMemo(() => {
    if (searchTerm.trim()) return 'Equipe refinada pela busca atual.'
    return 'Profissionais com cadastro, agenda e folha acompanhados no mobile.'
  }, [searchTerm])

  function setFormField(field: keyof typeof emptyProfessionalForm, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function resetForm() {
    setForm(emptyProfessionalForm)
    setFormMessage('')
    setFormOpen(false)
  }

  async function handleCreateProfessional() {
    if (!form.name.trim() || !form.specialty.trim()) {
      setFormMessage('Informe nome e especialidade.')
      return
    }

    setSaving(true)
    setFormMessage('')

    const localProfessional: ProfessionalSummary = {
      id: `local-pro-${Date.now()}`,
      name: form.name.trim(),
      specialty: form.specialty.trim(),
      phone: form.phone.trim(),
      notes: form.notes.trim(),
      active: true,
      availabilitySummary: 'Agenda a configurar',
      compensationSummary: 'Folha a configurar',
      payroll: {
        completedAppointments: 0,
        grossRevenue: 0,
        estimatedPayout: 0,
      },
    }

    try {
      if (offline) {
        setProfessionals(current => [localProfessional, ...current])
      } else {
        const created = await professionalsApi.create({
          name: form.name.trim(),
          specialty: form.specialty.trim(),
          phone: form.phone.trim(),
          notes: form.notes.trim(),
          active: true,
        })
        setProfessionals(current => [created, ...current])
        await load()
      }
      resetForm()
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : 'Nao foi possivel cadastrar profissional.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Equipe"
        title="Profissionais"
        copy="Cadastro, consulta e gestao da equipe com base pronta para vinculos documentais."
      />

      {offline ? (
        <ConnectionNotice copy="Dados demo ativos ate conectar autenticacao e API real." />
      ) : null}

      <View style={styles.metrics}>
        <MetricPill label="Ativos" value={professionals.length} />
        <MetricPill label="Atend." value={appointmentsTotal} />
        <MetricPill label="Folha" value={formatCurrency(payrollTotal)} />
      </View>

      <SearchField
        accessibilityLabel="Buscar profissionais"
        placeholder="Buscar por nome, especialidade ou agenda"
        value={searchTerm}
        onChangeText={setSearchTerm}
      />

      <TouchableOpacity activeOpacity={0.82} onPress={() => setFormOpen(current => !current)} style={styles.primaryAction}>
        <Text style={styles.primaryActionText}>Cadastrar profissional</Text>
        <Text style={styles.primaryActionCopy}>
          {offline ? 'Previa local ativa ate conectar autenticacao.' : 'API conectada para evoluir o cadastro.'}
        </Text>
      </TouchableOpacity>

      {formOpen ? (
        <Card>
          <View style={styles.form}>
            <Text style={styles.formTitle}>Nova profissional</Text>
            <TextInput placeholder="Nome completo" placeholderTextColor={colors.muted} style={styles.input} value={form.name} onChangeText={value => setFormField('name', value)} />
            <TextInput placeholder="Especialidade" placeholderTextColor={colors.muted} style={styles.input} value={form.specialty} onChangeText={value => setFormField('specialty', value)} />
            <TextInput keyboardType="phone-pad" placeholder="Telefone" placeholderTextColor={colors.muted} style={styles.input} value={form.phone} onChangeText={value => setFormField('phone', value)} />
            <TextInput multiline placeholder="Observacoes" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} value={form.notes} onChangeText={value => setFormField('notes', value)} />
            {formMessage ? <Text style={styles.formMessage}>{formMessage}</Text> : null}
            <View style={styles.formActions}>
              <TouchableOpacity activeOpacity={0.82} onPress={resetForm} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.82} disabled={saving} onPress={handleCreateProfessional} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      ) : null}

      <TouchableOpacity activeOpacity={0.82} onPress={load} style={styles.secondaryAction}>
        <Text style={styles.secondaryActionText}>{loading ? 'Atualizando...' : 'Atualizar equipe'}</Text>
      </TouchableOpacity>

      <ListSummary label="Profissionais visiveis" value={visibleProfessionals.length} copy={listCopy} />

      <View style={styles.list}>
        {visibleProfessionals.length ? (
          visibleProfessionals.map(professional => {
            const selected = selectedProfessionalId === String(professional.id)
            return (
              <TouchableOpacity key={String(professional.id)} activeOpacity={0.86} onPress={() => setSelectedProfessionalId(selected ? null : String(professional.id))}>
                <Card>
                  <View style={styles.head}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(professional.name)}</Text>
                    </View>
                    <View style={styles.identity}>
                      <Text style={styles.name}>{professional.name}</Text>
                      <Text style={styles.specialty}>{professional.specialty}</Text>
                    </View>
                    <StatusBadge label={professional.active === false ? 'Inativo' : 'Ativo'} tone={professional.active === false ? 'neutral' : 'success'} />
                  </View>

                  <View style={styles.compactGrid}>
                    <View style={styles.compactItem}>
                      <Text style={styles.compactLabel}>Agenda</Text>
                      <Text style={styles.compactValue}>{professional.availabilitySummary || 'A configurar'}</Text>
                    </View>
                    <View style={styles.compactItem}>
                      <Text style={styles.compactLabel}>Folha</Text>
                      <Text style={styles.compactValue}>{professional.compensationSummary || 'Sem regra definida'}</Text>
                    </View>
                  </View>

                  <Text style={styles.payrollLine}>
                    Repasse estimado: {formatCurrency(professional.payroll?.estimatedPayout || 0)}
                  </Text>

                  {selected ? (
                    <View style={styles.detailBox}>
                      <Text style={styles.detailLabel}>Ficha rapida</Text>
                      <Text style={styles.detailText}>Telefone: {professional.phone || 'Nao informado'}</Text>
                      <Text style={styles.detailText}>Atendimentos no periodo: {professional.payroll?.completedAppointments || 0}</Text>
                      <Text style={styles.detailText}>Receita vinculada: {formatCurrency(professional.payroll?.grossRevenue || 0)}</Text>
                      <Text style={styles.detailText}>{professional.notes || 'Sem observacoes registradas.'}</Text>
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            )
          })
        ) : (
          <EmptyState title="Nenhum profissional" copy="Ajuste a busca ou cadastre a primeira profissional da equipe." />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  primaryAction: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '900',
  },
  primaryActionCopy: {
    color: 'rgba(255, 250, 243, 0.72)',
    fontSize: typography.small,
  },
  list: {
    gap: spacing.md,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  secondaryActionText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  form: {
    gap: spacing.md,
  },
  formTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '900',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: typography.body,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  textarea: {
    minHeight: 90,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  formMessage: {
    color: colors.danger,
    fontSize: typography.small,
    fontWeight: '800',
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    padding: spacing.md,
  },
  cancelButtonText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    flex: 1,
    padding: spacing.md,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '900',
  },
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: colors.goldDeep,
    fontSize: typography.body,
    fontWeight: '900',
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  specialty: {
    color: colors.muted,
    fontSize: typography.small,
  },
  compactGrid: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  compactItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
  },
  compactLabel: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  compactValue: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: '800',
  },
  payrollLine: {
    color: colors.green,
    fontSize: typography.small,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  detailBox: {
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  detailLabel: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  detailText: {
    color: colors.inkSoft,
    fontSize: typography.small,
    lineHeight: 18,
  },
})
