import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon } from './Icon'
import type { Identifier } from './clinicalTypes'
import type {
  EquipmentItemSummary,
  InventoryDashboard,
  InventoryEntryMode,
  InventoryStatus,
  ProductItemSummary,
} from './operationsTypes'

type InventoryModalMode = 'create' | 'edit' | null

interface BadgeMeta {
  label: string
  className: string
}

interface ProductFormState {
  name: string
  category: string
  brand: string
  batch: string
  quantity: string
  unit: string
  entryMode: InventoryEntryMode
  purchasedAt: string
  expiresAt: string
  notes: string
}

interface EquipmentFormState {
  name: string
  category: string
  brand: string
  model: string
  serialNumber: string
  anvisaRegistration: string
  notificationNumber: string
  processNumber: string
  entryMode: InventoryEntryMode
  acquiredAt: string
  maintenanceDueAt: string
  warrantyUntil: string
  notes: string
}

interface ProductModalProps {
  form: ProductFormState
  setForm: Dispatch<SetStateAction<ProductFormState>>
  mode: Exclude<InventoryModalMode, null>
  onClose: () => void
  onSave: () => void
  saving: boolean
}

interface EquipmentModalProps {
  form: EquipmentFormState
  setForm: Dispatch<SetStateAction<EquipmentFormState>>
  mode: Exclude<InventoryModalMode, null>
  onClose: () => void
  onSave: () => void
  saving: boolean
}

interface EquipmentDetailsModalProps {
  item: EquipmentItemSummary
  onClose: () => void
  onEdit: () => void
}

interface ProductCardProps {
  item: ProductItemSummary
  onEdit: (item: ProductItemSummary) => void
  onArchive: (id: Identifier) => void
}

interface EquipmentCardProps {
  item: EquipmentItemSummary
  onView: (item: EquipmentItemSummary) => void
  onEdit: (item: EquipmentItemSummary) => void
  onArchive: (id: Identifier) => void
}

const emptyProductForm: ProductFormState = {
  name: '',
  category: '',
  brand: '',
  batch: '',
  quantity: '1',
  unit: '',
  entryMode: 'NEW',
  purchasedAt: '',
  expiresAt: '',
  notes: '',
}

const emptyEquipmentForm: EquipmentFormState = {
  name: '',
  category: '',
  brand: '',
  model: '',
  serialNumber: '',
  anvisaRegistration: '',
  notificationNumber: '',
  processNumber: '',
  entryMode: 'NEW',
  acquiredAt: '',
  maintenanceDueAt: '',
  warrantyUntil: '',
  notes: '',
}

const entryModeLabels: Record<InventoryEntryMode, string> = {
  NEW: 'Novo cadastro',
  EXISTING: 'Item antigo',
}

const alertMeta: Record<InventoryStatus, BadgeMeta> = {
  VALID: { label: 'Em dia', className: 'badge badge-green' },
  WARNING: { label: 'Perto do vencimento', className: 'badge badge-gold' },
  OVERDUE: { label: 'Vencido', className: 'badge badge-red' },
  WITHOUT_DATE: { label: 'Sem data', className: 'badge badge-blue' },
}

function formatDate(value?: string | Date | null): string {
  if (!value) return 'NÃ£o informado'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(new Date(value))
}

function formatQuantity(item: ProductItemSummary): string {
  return `${item.quantity} ${item.unit || ''}`.trim()
}

function ProductModal({ form, setForm, mode, onClose, onSave, saving }: ProductModalProps) {
  function setField(key: keyof ProductFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(current => ({ ...current, [key]: event.target.value }))
  }

  return (
    <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <h2 className="modal-title">{mode === 'create' ? 'Novo produto' : 'Editar produto'}</h2>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="form-input" value={form.name} onChange={setField('name')} placeholder="Ex: MÃ¡scara calmante" />
          </div>

          <div className="form-group">
            <label className="form-label">Categoria</label>
            <input className="form-input" value={form.category} onChange={setField('category')} placeholder="Ex: CosmÃ©tico" />
          </div>

          <div className="form-group">
            <label className="form-label">Marca</label>
            <input className="form-input" value={form.brand} onChange={setField('brand')} placeholder="Ex: Adcos" />
          </div>

          <div className="form-group">
            <label className="form-label">Lote</label>
            <input className="form-input" value={form.batch} onChange={setField('batch')} placeholder="Ex: LT-2026-09" />
          </div>

          <div className="form-group">
            <label className="form-label">Quantidade</label>
            <input className="form-input" type="number" min="0" value={form.quantity} onChange={setField('quantity')} />
          </div>

          <div className="form-group">
            <label className="form-label">Unidade</label>
            <input className="form-input" value={form.unit} onChange={setField('unit')} placeholder="ml, un, caixas" />
          </div>

          <div className="form-group">
            <label className="form-label">Origem</label>
            <select className="form-input" value={form.entryMode} onChange={setField('entryMode')}>
              <option value="NEW">Novo cadastro</option>
              <option value="EXISTING">Produto antigo</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Entrada/AquisiÃ§Ã£o</label>
            <input className="form-input" type="date" value={form.purchasedAt} onChange={setField('purchasedAt')} />
          </div>

          <div className="form-group">
            <label className="form-label">Validade</label>
            <input className="form-input" type="date" value={form.expiresAt} onChange={setField('expiresAt')} />
          </div>

          <div className="form-group form-full">
            <label className="form-label">ObservaÃ§Ãµes</label>
            <textarea
              className="form-textarea"
              value={form.notes}
              onChange={setField('notes')}
              placeholder="ObservaÃ§Ãµes internas sobre uso, armazenamento ou procedÃªncia."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Salvar produto'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EquipmentModal({ form, setForm, mode, onClose, onSave, saving }: EquipmentModalProps) {
  const [showRegulatory, setShowRegulatory] = useState(
    Boolean(form.anvisaRegistration || form.notificationNumber || form.processNumber)
  )

  useEffect(() => {
    setShowRegulatory(Boolean(form.anvisaRegistration || form.notificationNumber || form.processNumber))
  }, [form.anvisaRegistration, form.notificationNumber, form.processNumber])

  function setField(key: keyof EquipmentFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(current => ({ ...current, [key]: event.target.value }))
  }

  return (
    <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <h2 className="modal-title">{mode === 'create' ? 'Novo equipamento' : 'Editar equipamento'}</h2>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="form-input" value={form.name} onChange={setField('name')} placeholder="Ex: Laser de baixa potÃªncia" />
          </div>

          <div className="form-group">
            <label className="form-label">Categoria</label>
            <input className="form-input" value={form.category} onChange={setField('category')} placeholder="Ex: Laser" />
          </div>

          <div className="form-group">
            <label className="form-label">Marca</label>
            <input className="form-input" value={form.brand} onChange={setField('brand')} placeholder="Ex: Ibramed" />
          </div>

          <div className="form-group">
            <label className="form-label">Modelo</label>
            <input className="form-input" value={form.model} onChange={setField('model')} placeholder="Ex: X100" />
          </div>

          <div className="form-group">
            <label className="form-label">SÃ©rie</label>
            <input className="form-input" value={form.serialNumber} onChange={setField('serialNumber')} placeholder="Ex: SN-000123" />
          </div>

          <div className="form-group">
            <label className="form-label">Origem</label>
            <select className="form-input" value={form.entryMode} onChange={setField('entryMode')}>
              <option value="NEW">Novo cadastro</option>
              <option value="EXISTING">Equipamento antigo</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">AquisiÃ§Ã£o</label>
            <input className="form-input" type="date" value={form.acquiredAt} onChange={setField('acquiredAt')} />
          </div>

          <div className="form-group">
            <label className="form-label">ManutenÃ§Ã£o atÃ©</label>
            <input className="form-input" type="date" value={form.maintenanceDueAt} onChange={setField('maintenanceDueAt')} />
          </div>

          <div className="form-group">
            <label className="form-label">Garantia atÃ©</label>
            <input className="form-input" type="date" value={form.warrantyUntil} onChange={setField('warrantyUntil')} />
          </div>

          <div className="form-group form-full">
            <button
              type="button"
              className={`inventory-toggle ${showRegulatory ? 'active' : ''}`}
              onClick={() => setShowRegulatory(current => !current)}
            >
              <span>
                <Icon name="fileText" /> Dados ANVISA
              </span>
              <span>{showRegulatory ? 'Ocultar' : 'Preencher'}</span>
            </button>
          </div>

          {showRegulatory ? (
            <>
              <div className="form-group">
                <label className="form-label">Registro ANVISA</label>
                <input className="form-input" value={form.anvisaRegistration} onChange={setField('anvisaRegistration')} placeholder="Ex: 10340440019" />
              </div>

              <div className="form-group">
                <label className="form-label">NÃºmero de notificaÃ§Ã£o</label>
                <input className="form-input" value={form.notificationNumber} onChange={setField('notificationNumber')} placeholder="Ex: 25351.123456/2026-01" />
              </div>

              <div className="form-group form-full">
                <label className="form-label">NÃºmero do processo</label>
                <input className="form-input" value={form.processNumber} onChange={setField('processNumber')} placeholder="Ex: 25351.654321/2026-10" />
              </div>
            </>
          ) : null}

          <div className="form-group form-full">
            <label className="form-label">ObservaÃ§Ãµes</label>
            <textarea
              className="form-textarea"
              value={form.notes}
              onChange={setField('notes')}
              placeholder="CalibraÃ§Ã£o, local de uso, observaÃ§Ãµes sobre performance ou histÃ³rico."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Salvar equipamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EquipmentDetailsModal({ item, onClose, onEdit }: EquipmentDetailsModalProps) {
  const meta = alertMeta[item.status] || alertMeta.VALID

  return (
    <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="section-head">
          <div>
            <h2 className="modal-title">{item.name}</h2>
            <p className="section-copy">Abra o cadastro completo do equipamento e revise os dados antes de editar.</p>
          </div>
          <span className={meta.className}>{item.statusLabel || meta.label}</span>
        </div>

        <div className="detail-list inventory-detail-list">
          <div className="detail-row">
            <span>Categoria</span>
            <strong>{item.category || 'NÃ£o informado'}</strong>
          </div>
          <div className="detail-row">
            <span>Marca</span>
            <strong>{item.brand || 'NÃ£o informado'}</strong>
          </div>
          <div className="detail-row">
            <span>Modelo</span>
            <strong>{item.model || 'NÃ£o informado'}</strong>
          </div>
          <div className="detail-row">
            <span>SÃ©rie</span>
            <strong>{item.serialNumber || 'NÃ£o informado'}</strong>
          </div>
          <div className="detail-row">
            <span>Origem</span>
            <strong>{entryModeLabels[item.entryMode] || 'NÃ£o informado'}</strong>
          </div>
          <div className="detail-row">
            <span>AquisiÃ§Ã£o</span>
            <strong>{formatDate(item.acquiredAt)}</strong>
          </div>
          <div className="detail-row">
            <span>PrÃ³xima manutenÃ§Ã£o</span>
            <strong>{formatDate(item.maintenanceDueAt)}</strong>
          </div>
          <div className="detail-row">
            <span>Garantia</span>
            <strong>{formatDate(item.warrantyUntil)}</strong>
          </div>
        </div>

        <div className="inventory-regulatory-box">
          <div className="inventory-regulatory-title">Dados ANVISA</div>
          <div className="detail-list inventory-detail-list">
            <div className="detail-row">
              <span>Registro</span>
              <strong>{item.anvisaRegistration || 'NÃ£o informado'}</strong>
            </div>
            <div className="detail-row">
              <span>NotificaÃ§Ã£o</span>
              <strong>{item.notificationNumber || 'NÃ£o informado'}</strong>
            </div>
            <div className="detail-row">
              <span>Processo</span>
              <strong>{item.processNumber || 'NÃ£o informado'}</strong>
            </div>
          </div>
        </div>

        {item.notes ? <div className="inventory-notes inventory-notes-detail">{item.notes}</div> : null}

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            <Icon name="edit" /> Editar cadastro
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductCard({ item, onEdit, onArchive }: ProductCardProps) {
  const meta = alertMeta[item.status] || alertMeta.VALID

  return (
    <article className="inventory-card">
      <div className="inventory-card-head">
        <div>
          <h3 className="inventory-card-title">{item.name}</h3>
          <p className="inventory-card-subtitle">{[item.brand, item.category, item.batch, entryModeLabels[item.entryMode]].filter(Boolean).join(' - ')}</p>
        </div>
        <span className={meta.className}>{item.statusLabel || meta.label}</span>
      </div>

      <div className="inventory-meta-grid">
        <div className="inventory-meta-item">
          <span>Quantidade</span>
          <strong>{formatQuantity(item)}</strong>
        </div>
        <div className="inventory-meta-item">
          <span>Validade</span>
          <strong>{formatDate(item.expiresAt)}</strong>
        </div>
        <div className="inventory-meta-item">
          <span>Entrada</span>
          <strong>{formatDate(item.purchasedAt)}</strong>
        </div>
      </div>

      {item.notes ? <div className="inventory-notes">{item.notes}</div> : null}

      <div className="inventory-card-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(item)}>
          <Icon name="edit" /> Editar
        </button>
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => onArchive(item.id)}>
          <Icon name="trash" /> Arquivar
        </button>
      </div>
    </article>
  )
}

function EquipmentCard({ item, onView, onEdit, onArchive }: EquipmentCardProps) {
  const meta = alertMeta[item.status] || alertMeta.VALID

  return (
    <article className="inventory-card">
      <div className="inventory-card-head">
        <div>
          <h3 className="inventory-card-title">{item.name}</h3>
          <p className="inventory-card-subtitle">{[item.brand, item.model, item.category, entryModeLabels[item.entryMode]].filter(Boolean).join(' - ')}</p>
        </div>
        <span className={meta.className}>{item.statusLabel || meta.label}</span>
      </div>

      <div className="inventory-meta-grid">
        <div className="inventory-meta-item">
          <span>SÃ©rie</span>
          <strong>{item.serialNumber || 'NÃ£o informado'}</strong>
        </div>
        <div className="inventory-meta-item">
          <span>PrÃ³xima manutenÃ§Ã£o</span>
          <strong>{formatDate(item.maintenanceDueAt)}</strong>
        </div>
        <div className="inventory-meta-item">
          <span>Garantia</span>
          <strong>{formatDate(item.warrantyUntil)}</strong>
        </div>
      </div>

      {item.anvisaRegistration || item.notificationNumber || item.processNumber ? (
        <div className="inventory-regulatory-chip">
          {[
            item.anvisaRegistration ? `Registro ${item.anvisaRegistration}` : null,
            item.notificationNumber ? 'NotificaÃ§Ã£o cadastrada' : null,
            item.processNumber ? 'Processo cadastrado' : null,
          ]
            .filter(Boolean)
            .join(' - ')}
        </div>
      ) : null}

      {item.notes ? <div className="inventory-notes">{item.notes}</div> : null}

      <div className="inventory-card-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onView(item)}>
          <Icon name="search" /> Ver cadastro
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(item)}>
          <Icon name="edit" /> Editar
        </button>
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => onArchive(item.id)}>
          <Icon name="trash" /> Arquivar
        </button>
      </div>
    </article>
  )
}

export default function ProdutosEquipamentos() {
  const [summary, setSummary] = useState<InventoryDashboard | null>(null)
  const [products, setProducts] = useState<ProductItemSummary[]>([])
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [productModal, setProductModal] = useState<InventoryModalMode>(null)
  const [equipmentModal, setEquipmentModal] = useState<InventoryModalMode>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm)
  const [equipmentForm, setEquipmentForm] = useState<EquipmentFormState>(emptyEquipmentForm)
  const [selectedProduct, setSelectedProduct] = useState<ProductItemSummary | null>(null)
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentItemSummary | null>(null)
  const [equipmentDetails, setEquipmentDetails] = useState<EquipmentItemSummary | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [savingEquipment, setSavingEquipment] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const [summaryResponse, productsResponse, equipmentResponse] = await Promise.all([
        api.get<InventoryDashboard>('/inventory/summary'),
        api.get<ProductItemSummary[]>('/products'),
        api.get<EquipmentItemSummary[]>('/equipment'),
      ])

      setSummary(summaryResponse.data)
      setProducts(productsResponse.data)
      setEquipmentItems(equipmentResponse.data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel carregar produtos e equipamentos'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreateProduct() {
    setSelectedProduct(null)
    setProductForm(emptyProductForm)
    setProductModal('create')
  }

  function openEditProduct(item: ProductItemSummary) {
    setSelectedProduct(item)
    setProductForm({
      name: item.name || '',
      category: item.category || '',
      brand: item.brand || '',
      batch: item.batch || '',
      quantity: item.quantity != null ? String(item.quantity) : '1',
      unit: item.unit || '',
      entryMode: item.entryMode || 'NEW',
      purchasedAt: item.purchasedAt ? String(item.purchasedAt).slice(0, 10) : '',
      expiresAt: item.expiresAt ? String(item.expiresAt).slice(0, 10) : '',
      notes: item.notes || '',
    })
    setProductModal('edit')
  }

  function openCreateEquipment() {
    setSelectedEquipment(null)
    setEquipmentForm(emptyEquipmentForm)
    setEquipmentModal('create')
  }

  function openEditEquipment(item: EquipmentItemSummary) {
    setSelectedEquipment(item)
    setEquipmentForm({
      name: item.name || '',
      category: item.category || '',
      brand: item.brand || '',
      model: item.model || '',
      serialNumber: item.serialNumber || '',
      anvisaRegistration: item.anvisaRegistration || '',
      notificationNumber: item.notificationNumber || '',
      processNumber: item.processNumber || '',
      entryMode: item.entryMode || 'NEW',
      acquiredAt: item.acquiredAt ? String(item.acquiredAt).slice(0, 10) : '',
      maintenanceDueAt: item.maintenanceDueAt ? String(item.maintenanceDueAt).slice(0, 10) : '',
      warrantyUntil: item.warrantyUntil ? String(item.warrantyUntil).slice(0, 10) : '',
      notes: item.notes || '',
    })
    setEquipmentModal('edit')
  }

  async function saveProduct() {
    if (!productForm.name.trim()) {
      toast.error('Informe o nome do produto')
      return
    }

    const parsedQuantity = Number(productForm.quantity || 0)

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      toast.error('Informe uma quantidade vÃ¡lida')
      return
    }

    if (productModal === 'edit' && !selectedProduct) {
      toast.error('Selecione um produto vÃ¡lido antes de salvar')
      return
    }

    setSavingProduct(true)

    try {
      const payload = {
        ...productForm,
        name: productForm.name.trim(),
        category: productForm.category.trim(),
        brand: productForm.brand.trim(),
        batch: productForm.batch.trim(),
        unit: productForm.unit.trim(),
        notes: productForm.notes.trim(),
        quantity: parsedQuantity,
      }

      if (productModal === 'create') {
        await api.post<ProductItemSummary>('/products', payload)
        toast.success('Produto cadastrado')
      } else if (selectedProduct) {
        await api.put<ProductItemSummary>(`/products/${selectedProduct.id}`, payload)
        toast.success('Produto atualizado')
      }

      setProductModal(null)
      setSelectedProduct(null)
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel salvar o produto'))
    } finally {
      setSavingProduct(false)
    }
  }

  async function saveEquipment() {
    if (!equipmentForm.name.trim()) {
      toast.error('Informe o nome do equipamento')
      return
    }

    if (equipmentModal === 'edit' && !selectedEquipment) {
      toast.error('Selecione um equipamento vÃ¡lido antes de salvar')
      return
    }

    setSavingEquipment(true)

    try {
      const payload = {
        ...equipmentForm,
        name: equipmentForm.name.trim(),
        category: equipmentForm.category.trim(),
        brand: equipmentForm.brand.trim(),
        model: equipmentForm.model.trim(),
        serialNumber: equipmentForm.serialNumber.trim(),
        anvisaRegistration: equipmentForm.anvisaRegistration.trim(),
        notificationNumber: equipmentForm.notificationNumber.trim(),
        processNumber: equipmentForm.processNumber.trim(),
        notes: equipmentForm.notes.trim(),
      }

      if (equipmentModal === 'create') {
        await api.post<EquipmentItemSummary>('/equipment', payload)
        toast.success('Equipamento cadastrado')
      } else if (selectedEquipment) {
        await api.put<EquipmentItemSummary>(`/equipment/${selectedEquipment.id}`, payload)
        toast.success('Equipamento atualizado')
      }

      setEquipmentModal(null)
      setSelectedEquipment(null)
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel salvar o equipamento'))
    } finally {
      setSavingEquipment(false)
    }
  }

  async function removeProduct(id: Identifier) {
    if (!window.confirm('Deseja arquivar este produto?')) return

    try {
      await api.delete<{ ok: boolean }>(`/products/${id}`)
      toast.success('Produto arquivado')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel arquivar o produto'))
    }
  }

  async function removeEquipment(id: Identifier) {
    if (!window.confirm('Deseja arquivar este equipamento?')) return

    try {
      await api.delete<{ ok: boolean }>(`/equipment/${id}`)
      toast.success('Equipamento arquivado')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel arquivar o equipamento'))
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Produtos e equipamentos</h1>
          <p className="page-subtitle">Cadastre itens novos ou antigos, acompanhe validade e receba alertas antes do vencimento.</p>
        </div>
      </div>

      <div className="documents-summary-grid">
        <div className="stat-card gold">
          <div className="stat-label">Produtos ativos</div>
          <div className="stat-value">{summary?.totalProducts ?? 0}</div>
          <div className="stat-sub">Itens de consumo, insumos e cosmÃ©ticos da clÃ­nica.</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Equipamentos ativos</div>
          <div className="stat-value">{summary?.totalEquipment ?? 0}</div>
          <div className="stat-sub">Equipamentos tÃ©cnicos com acompanhamento de manutenÃ§Ã£o.</div>
        </div>
        <div className="stat-card rose">
          <div className="stat-label">Alertas</div>
          <div className="stat-value">{summary ? summary.alerts.length : 0}</div>
          <div className="stat-sub">Itens perto do vencimento, da manutenÃ§Ã£o ou jÃ¡ vencidos.</div>
        </div>
      </div>

      <div className="overview-grid">
        <section className="card section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Tela de alerta</h2>
              <p className="section-copy">Tudo o que estiver perto do vencimento aparece aqui com prioridade.</p>
            </div>
          </div>

          {!summary?.alerts?.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="box" size={24} />
              </div>
              <h3>Nenhum alerta no momento</h3>
              <p>Quando um produto ou equipamento estiver perto do vencimento, o aviso aparece automaticamente.</p>
            </div>
          ) : (
            <div className="dashboard-alert-list">
              {summary.alerts.map(item => {
                const meta = alertMeta[item.status] || alertMeta.VALID
                return (
                  <div className="dashboard-alert-item" key={`${item.assetType}-${item.id}`}>
                    <div>
                      <div className="font-500">{item.name}</div>
                      <div className="text-sm text-muted">
                        {item.assetType === 'PRODUCT' ? 'Produto' : 'Equipamento'} - {item.entryMode ? entryModeLabels[item.entryMode] : 'Cadastro'}
                      </div>
                    </div>
                    <div className="dashboard-alert-meta">
                      <span className={meta.className}>{item.statusLabel || meta.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="card section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Resumo rÃ¡pido</h2>
              <p className="section-copy">Leitura imediata do risco operacional de estoque e equipamentos.</p>
            </div>
          </div>

          <div className="detail-list">
            <div className="detail-row">
              <span>Produtos vencendo</span>
              <strong>{summary?.expiringProducts ?? 0}</strong>
            </div>
            <div className="detail-row">
              <span>Produtos vencidos</span>
              <strong>{summary?.expiredProducts ?? 0}</strong>
            </div>
            <div className="detail-row">
              <span>Equipamentos vencendo</span>
              <strong>{summary?.dueEquipment ?? 0}</strong>
            </div>
            <div className="detail-row">
              <span>Equipamentos vencidos</span>
              <strong>{summary?.overdueEquipment ?? 0}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="inventory-grid">
        <section className="card section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Produtos</h2>
              <p className="section-copy">Cadastre novos produtos e produtos antigos com lote, validade e quantidade.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={openCreateProduct}>
              <Icon name="plus" /> Novo produto
            </button>
          </div>

          {loading ? (
            <div className="loading-page">
              <span className="spinner" />
            </div>
          ) : !products.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="box" size={24} />
              </div>
              <h3>Nenhum produto cadastrado</h3>
              <p>Comece cadastrando seu estoque para acompanhar vencimentos.</p>
            </div>
          ) : (
            <div className="inventory-card-list">
              {products.map(item => (
                <ProductCard key={item.id} item={item} onEdit={openEditProduct} onArchive={removeProduct} />
              ))}
            </div>
          )}
        </section>

        <section className="card section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Equipamentos</h2>
              <p className="section-copy">Cadastre equipamentos novos e antigos com manutenÃ§Ã£o e garantia.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={openCreateEquipment}>
              <Icon name="plus" /> Novo equipamento
            </button>
          </div>

          {loading ? (
            <div className="loading-page">
              <span className="spinner" />
            </div>
          ) : !equipmentItems.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="box" size={24} />
              </div>
              <h3>Nenhum equipamento cadastrado</h3>
              <p>Cadastre os equipamentos para acompanhar manutenÃ§Ã£o e vencimentos.</p>
            </div>
          ) : (
            <div className="inventory-card-list">
              {equipmentItems.map(item => (
                <EquipmentCard key={item.id} item={item} onView={setEquipmentDetails} onEdit={openEditEquipment} onArchive={removeEquipment} />
              ))}
            </div>
          )}
        </section>
      </div>

      {productModal ? (
        <ProductModal
          form={productForm}
          setForm={setProductForm}
          mode={productModal}
          onClose={() => setProductModal(null)}
          onSave={saveProduct}
          saving={savingProduct}
        />
      ) : null}

      {equipmentModal ? (
        <EquipmentModal
          form={equipmentForm}
          setForm={setEquipmentForm}
          mode={equipmentModal}
          onClose={() => setEquipmentModal(null)}
          onSave={saveEquipment}
          saving={savingEquipment}
        />
      ) : null}

      {equipmentDetails ? (
        <EquipmentDetailsModal
          item={equipmentDetails}
          onClose={() => setEquipmentDetails(null)}
          onEdit={() => {
            const currentItem = equipmentDetails
            setEquipmentDetails(null)
            openEditEquipment(currentItem)
          }}
        />
      ) : null}
    </div>
  )
}
