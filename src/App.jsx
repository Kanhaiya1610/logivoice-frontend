import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudUpload,
  FileText,
  Filter,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  Download,
  Mic,
} from 'lucide-react'
import { ApiError, apiClient } from './services/apiClient.js'
import { documentService } from './services/documentService.js'
import './App.css'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'txt']
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'chat', label: 'Document chat', icon: MessageSquare },
]

function decodeRouteId(value) {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function readRoute() {
  if (typeof window === 'undefined') return { view: 'dashboard', id: null }
  const value = window.location.hash.replace(/^#\/?/, '')
  const [view = 'dashboard', id = null] = value.split('/')
  return { view: NAV_ITEMS.some((item) => item.id === view) || view === 'document' ? view : 'dashboard', id: decodeRouteId(id) }
}

function navigate(view, id = null) {
  const path = id ? `document/${encodeURIComponent(id)}` : view
  window.location.hash = `/${path}`
}

function unwrapDocument(value) {
  const source = value?.document || value || {}
  return {
    ...source,
    id: source.id ?? source.document_id ?? source.documentId,
    filename: source.filename ?? source.file_name ?? source.name ?? 'Untitled document',
    status: String(source.status ?? source.processing_status ?? source.processingStatus ?? 'unknown').toLowerCase(),
    documentType: source.document_type ?? source.documentType ?? source.doc_type ?? source.classification ?? source.type,
    createdAt: source.created_at ?? source.createdAt ?? source.uploaded_at ?? source.uploadedAt,
    updatedAt: source.updated_at ?? source.updatedAt,
    size: source.file_size ?? source.fileSize ?? source.size,
    extractedText: source.extracted_text ?? source.extractedText ?? source.full_text ?? source.text ?? '',
    metadata: source.metadata ?? source.extracted_data ?? source.entities ?? source.fields ?? {},
    error: source.error ?? source.processing_error ?? source.processingError,
  }
}

function formatDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size unavailable'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / (1024 ** unit)).toFixed(unit ? 1 : 0)} ${units[unit]}`
}

function formatMetric(value) {
  if (value === undefined || value === null || value === '') return '—'
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : String(value)
}

function getExtension(filename) {
  return filename?.split('.').pop()?.toLowerCase() || ''
}

function validateFile(file) {
  if (!file) return 'Choose a file to upload.'
  const extension = getExtension(file.name)
  if (!ACCEPTED_EXTENSIONS.includes(extension)) return 'Supported formats are PDF, PNG, JPG, JPEG, and TXT.'
  if (file.size > MAX_FILE_SIZE) return 'Files must be 25 MB or smaller.'
  return null
}

function getStatusTone(status) {
  if (['processed', 'complete', 'completed', 'success'].includes(status)) return 'success'
  if (['failed', 'error'].includes(status)) return 'danger'
  if (['processing', 'queued', 'pending', 'in_progress'].includes(status)) return 'warning'
  return 'neutral'
}

function readableStatus(status) {
  if (!status || status === 'unknown') return 'Status unavailable'
  return status.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getPayloadMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

function getDataValue(data, keys) {
  for (const key of keys) {
    if (data?.[key] !== undefined && data?.[key] !== null) return data[key]
  }
  return undefined
}

function humanizeMetadataKey(key) {
  return String(key).replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function parseVCard(value) {
  if (typeof value !== 'string' || !/^BEGIN:VCARD/i.test(value.trim())) return null
  const fields = {}
  value.replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    const separator = line.indexOf(':')
    if (separator < 0) return
    const key = line.slice(0, separator).split(';')[0].toUpperCase()
    const fieldValue = line.slice(separator + 1).trim()
    if (fieldValue) fields[key] = fieldValue
  })
  return {
    name: fields.FN || fields.N?.replace(';', ' ') || '',
    organization: fields.ORG || '',
    title: fields.TITLE || '',
    phone: fields.TEL || '',
    email: fields.EMAIL || '',
    address: fields.ADR?.split(';').filter(Boolean).join(', ') || '',
  }
}

function BarcodeValue({ code }) {
  const vcard = parseVCard(code.data)
  if (vcard) return <div className="metadata-vcard"><strong>{vcard.name || 'Contact card'}</strong>{vcard.organization && <span>{vcard.organization}</span>}{vcard.title && <span>{vcard.title}</span>}{vcard.phone && <a href={`tel:${vcard.phone}`}>{vcard.phone}</a>}{vcard.email && <a href={`mailto:${vcard.email}`}>{vcard.email}</a>}{vcard.address && <span>{vcard.address}</span>}</div>
  const isUrl = typeof code.data === 'string' && /^(?:https?:\/\/|www\.)/i.test(code.data)
  const href = isUrl && /^https?:\/\//i.test(code.data) ? code.data : `https://${code.data}`
  return isUrl ? <a href={href} target="_blank" rel="noreferrer">{code.data}</a> : <span>{code.data || 'Empty value'}</span>
}

function MetadataValue({ field, value }) {
  if (field === 'barcodes' && Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">No codes detected</span>
    return <div className="metadata-codes">{value.map((code, index) => <div className="metadata-code" key={`${code.type}-${code.data}-${code.page ?? index}`}><span className="metadata-code-type">{code.type || 'CODE'}</span><BarcodeValue code={code} />{code.page && <small>Page {code.page}</small>}</div>)}</div>
  }

  if (field === 'entities' && value && typeof value === 'object') {
    const groups = Object.entries(value).filter(([key, entries]) => key !== 'source' && Array.isArray(entries) && entries.length > 0)
    return <div className="metadata-entities">{groups.map(([key, entries]) => <div className="metadata-entity-group" key={key}><small>{humanizeMetadataKey(key)}</small><div className="metadata-chips">{entries.map((entry) => <span className="metadata-chip" key={`${key}-${entry}`}>{entry}</span>)}</div></div>)}<small className="metadata-source">Source: {value.source || 'fallback'}</small></div>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">None detected</span>
    return <div className="metadata-chips">{value.map((entry) => <span className="metadata-chip" key={String(entry)}>{String(entry)}</span>)}</div>
  }

  if (value && typeof value === 'object') return <pre className="metadata-json">{JSON.stringify(value, null, 2)}</pre>
  return <span>{String(value)}</span>
}

function getBreakdown(data, keys) {
  const value = getDataValue(data, keys)
  if (Array.isArray(value)) {
    return value.map((entry) => ({
      label: entry.label ?? entry.name ?? entry.type ?? entry.status ?? 'Unknown',
      value: Number(entry.value ?? entry.count ?? entry.total ?? 0),
    }))
  }
  if (value && typeof value === 'object') return Object.entries(value).map(([label, amount]) => ({ label, value: Number(amount) }))
  return []
}

function StateMessage({ icon: Icon = AlertCircle, title, message, action }) {
  return (
    <div className="state-message" role="status">
      <Icon size={22} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {message && <p>{message}</p>}
        {action}
      </div>
    </div>
  )
}

function Spinner({ small = false }) {
  return <span className={`spinner ${small ? 'spinner-small' : ''}`} aria-label="Loading" />
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${getStatusTone(status)}`}><span aria-hidden="true" />{readableStatus(status)}</span>
}

function AuthScreen({ mode, setMode, onSubmit, loading, error }) {
  const isRegister = mode === 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand-mark large"><Activity size={23} aria-hidden="true" /></div>
        <p className="eyebrow">LOGISTICS INTELLIGENCE</p>
        <h1 id="auth-title">{isRegister ? 'Create your workspace' : 'Welcome back'}</h1>
        <p className="auth-intro">Turn operational documents into searchable, actionable knowledge.</p>
        {error && <div className="alert error" role="alert"><AlertCircle size={18} />{error}</div>}
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(form) }}>
          {isRegister && (
            <label className="field-label" htmlFor="auth-name">
              Name
              <input id="auth-name" name="name" value={form.name} onChange={updateField} autoComplete="name" required />
            </label>
          )}
          <label className="field-label" htmlFor="auth-email">
            Email
            <input id="auth-email" name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required />
          </label>
          <label className="field-label" htmlFor="auth-password">
            Password
            <input id="auth-password" name="password" type="password" value={form.password} onChange={updateField} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" required />
          </label>
          <button className="button primary full-width" type="submit" disabled={loading}>
            {loading ? <Spinner small /> : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button className="link-button" type="button" onClick={() => setMode(isRegister ? 'login' : 'register')}>
          {isRegister ? 'Already have an account? Sign in' : 'Need an account? Register'}
        </button>
        <p className="auth-footnote">Your documents stay in your connected LogiVoice workspace.</p>
      </section>
    </main>
  )
}

function Sidebar({ view, onNavigate, user, onLogout, open, close }) {
  return (
    <>
      {open && <button className="sidebar-scrim" type="button" aria-label="Close menu" onClick={close} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-mark"><Activity size={18} aria-hidden="true" /></div><span>LogiVoice</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} type="button" onClick={() => { onNavigate(id); close() }}>
              <Icon size={18} aria-hidden="true" />{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card"><CircleHelp size={18} aria-hidden="true" /><div><strong>Need help?</strong><span>Check the deployment guide for setup.</span></div></div>
          <div className="user-card">
            <div className="avatar" aria-hidden="true">{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</div>
            <div className="user-info"><strong>{user?.name || 'Workspace user'}</strong><span>{user?.email || 'Authenticated'}</span></div>
            <button className="icon-button" type="button" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  )
}

function Topbar({ title, subtitle, onMenu, backendState, onRetry }) {
  const isOnline = backendState === 'online'
  const isChecking = backendState === 'checking'
  return (
    <header className="topbar">
      <button className="menu-button icon-button" type="button" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="topbar-status">
        <span className={`connection-status ${isOnline ? 'online' : isChecking ? 'checking' : 'offline'}`}><span aria-hidden="true" />{isOnline ? 'Backend connected' : isChecking ? 'Checking backend' : 'Backend unavailable'}</span>
        {!isOnline && <button className="icon-button" type="button" onClick={onRetry} aria-label="Retry backend connection" title="Retry connection"><RefreshCw size={16} /></button>}
      </div>
    </header>
  )
}

function BackendAlert({ error, onRetry }) {
  if (!error) return null
  return <div className="alert warning backend-alert" role="alert"><ShieldCheck size={18} /><div><strong>Backend unavailable</strong><span>{error}</span></div><button className="button ghost small" type="button" onClick={onRetry}>Retry</button></div>
}

function MetricCard({ label, value, detail, icon: Icon }) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={18} aria-hidden="true" /></div><div><span>{label}</span><strong>{formatMetric(value)}</strong>{detail && <small>{detail}</small>}</div></article>
}

function UploadPanel({ uploadItems, error, onFiles, onClearError }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function handleFiles(fileList) {
    onFiles(Array.from(fileList || []))
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="panel upload-panel" aria-labelledby="upload-heading">
      <div className="panel-heading"><div><p className="eyebrow">INGEST</p><h2 id="upload-heading">Add documents</h2><p>Upload a logistics document to extract and index its contents.</p></div><CloudUpload size={26} className="heading-icon" aria-hidden="true" /></div>
      <button className={`dropzone ${dragging ? 'dragging' : ''}`} type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); handleFiles(event.dataTransfer.files) }}>
        <span className="dropzone-icon"><Upload size={21} aria-hidden="true" /></span>
        <strong>Drop files here or browse</strong>
        <span>PDF, PNG, JPG, JPEG or TXT · up to 25 MB</span>
        <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
      </button>
      {error && <div className="upload-error alert error" role="alert"><AlertCircle size={16} />{error}<button className="icon-button" type="button" onClick={onClearError} aria-label="Dismiss upload error"><X size={15} /></button></div>}
      {uploadItems.length > 0 && <div className="upload-queue" aria-live="polite">{uploadItems.map((item) => <div className="upload-row" key={item.key}><FileText size={18} /><div className="upload-row-main"><strong>{item.name}</strong><span>{item.error || (item.status === 'done' ? 'Uploaded and queued for processing' : item.status === 'uploading' ? `Uploading · ${item.progress}%` : 'Waiting')}</span>{item.status === 'uploading' && <progress value={item.progress} max="100" />}</div>{item.status === 'done' ? <CheckCircle2 className="success-text" size={18} /> : item.error ? <AlertCircle className="danger-text" size={18} /> : <Spinner small />}</div>)}</div>}
    </section>
  )
}

function SearchControls({ search, status, onSearch, onStatus, onVoice, voiceSupported, listening }) {
  return <div className="search-controls"><div className="search-field"><Search size={18} aria-hidden="true" /><input aria-label="Search documents" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search filename, text or metadata" /><button className={`voice-button ${listening ? 'listening' : ''}`} type="button" onClick={onVoice} disabled={!voiceSupported || listening} aria-label={voiceSupported ? 'Search by voice' : 'Voice search is unavailable'} title={voiceSupported ? 'Search by voice' : 'Voice search is unavailable'}><Mic size={17} /></button></div><label className="select-wrap" aria-label="Filter by processing status"><Filter size={16} aria-hidden="true" /><select value={status} onChange={(event) => onStatus(event.target.value)}><option value="">All statuses</option><option value="processed">Processed</option><option value="processing">Processing</option><option value="failed">Failed</option></select></label></div>
}

function DocumentsTable({ documents, loading, error, page, pageSize, total, onPageChange, onOpen, onRetry }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return <section className="panel documents-panel" aria-labelledby="documents-heading"><div className="panel-heading compact"><div><p className="eyebrow">LIBRARY</p><h2 id="documents-heading">Documents <span className="heading-count">{formatMetric(total)}</span></h2></div><button className="icon-button" type="button" onClick={onRetry} aria-label="Refresh documents" title="Refresh documents"><RefreshCw size={17} /></button></div>{loading ? <div className="loading-block"><Spinner /><span>Loading documents…</span></div> : error ? <StateMessage title="Could not load documents" message={error} action={<button className="button secondary small" type="button" onClick={onRetry}>Try again</button>} /> : documents.length === 0 ? <StateMessage icon={FolderOpen} title="No documents found" message="Upload a file or adjust your search and filters to see documents here." /> : <><div className="table-wrap"><table><thead><tr><th scope="col">Document</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Uploaded</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{documents.map((document) => <tr key={document.id || document.filename}><td><button className="document-name" type="button" onClick={() => onOpen(document.id)}><span className="file-icon"><FileText size={17} /></span><span><strong>{document.filename}</strong><small>{formatBytes(document.size)}</small></span></button></td><td>{document.documentType || 'Unclassified'}</td><td><StatusBadge status={document.status} /></td><td>{formatDate(document.createdAt)}</td><td><button className="icon-button" type="button" onClick={() => onOpen(document.id)} aria-label={`Open ${document.filename}`}><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Page {page} of {totalPages}</span><div><button className="icon-button" type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={17} /></button><button className="icon-button" type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page"><ChevronRight size={17} /></button></div></div></>}</section>
}

function ChatPanel({ document, messages, input, setInput, loading, error, onSend }) {
  return <section className="panel chat-panel" aria-labelledby="chat-heading"><div className="panel-heading compact"><div><p className="eyebrow">ASSISTANT</p><h2 id="chat-heading">Ask about this document</h2><p>{document ? `Answers are grounded in ${document.filename}.` : 'Select a document to start a grounded conversation.'}</p></div><MessageSquare size={23} className="heading-icon" aria-hidden="true" /></div>{!document ? <StateMessage icon={MessageSquare} title="Choose a document" message="Open a processed document or select one from the document chat page." /> : <><div className="chat-messages" aria-live="polite">{messages.length === 0 && <div className="chat-empty"><MessageSquare size={19} /><span>Ask a question about the extracted content, metadata, or document type.</span></div>}{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="chat-role">{message.role === 'user' ? 'You' : 'LogiVoice'}</span><p>{message.text}</p></div>)}</div>{error && <div className="alert error" role="alert"><AlertCircle size={16} />{error}</div>}<form className="chat-form" onSubmit={onSend}><label className="sr-only" htmlFor="chat-question">Question about this document</label><input id="chat-question" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question about the document…" disabled={loading} /><button className="button primary" type="submit" disabled={loading || !input.trim()}>{loading ? <Spinner small /> : <Send size={17} aria-hidden="true" />}<span className="sr-only">Send question</span></button></form></>}</section>
}

function AnalyticsView({ analytics, loading, error, onRetry }) {
  if (loading) return <div className="panel loading-block tall"><Spinner /><span>Loading analytics from the backend…</span></div>
  if (error) return <div className="panel"><StateMessage title="Analytics unavailable" message={error} action={<button className="button secondary small" type="button" onClick={onRetry}>Try again</button>} /></div>
  if (!analytics || Object.keys(analytics).length === 0) return <div className="panel"><StateMessage icon={BarChart3} title="No analytics available" message="Analytics will appear after the backend has processed documents." /></div>

  const total = getDataValue(analytics, ['total_documents', 'totalDocuments', 'total', 'documents_count'])
  const processed = getDataValue(analytics, ['processed_documents', 'processedDocuments', 'processed'])
  const processing = getDataValue(analytics, ['processing_documents', 'processingDocuments', 'processing', 'pending'])
  const failed = getDataValue(analytics, ['failed_documents', 'failedDocuments', 'failed', 'errors'])
  const typeBreakdown = getBreakdown(analytics, ['document_types', 'documentTypes', 'by_type', 'types', 'type_distribution'])
  const statusBreakdown = getBreakdown(analytics, ['status_counts', 'statusCounts', 'by_status', 'statuses', 'status_distribution'])
  const maxType = Math.max(...typeBreakdown.map((entry) => entry.value), 1)

  return <div className="analytics-view"><div className="metrics-grid"><MetricCard label="Total documents" value={total} detail="From stored records" icon={FolderOpen} /><MetricCard label="Processed" value={processed} detail="Ready to search" icon={CheckCircle2} /><MetricCard label="In progress" value={processing} detail="Awaiting extraction" icon={Clock3} /><MetricCard label="Failed" value={failed} detail="Needs review" icon={AlertCircle} /></div><section className="panel chart-panel"><div className="panel-heading compact"><div><p className="eyebrow">DISTRIBUTION</p><h2>Document types</h2><p>Classification totals returned by the backend.</p></div></div>{typeBreakdown.length === 0 ? <StateMessage icon={BarChart3} title="No type breakdown returned" message="The analytics endpoint did not include document type totals." /> : <div className="bars">{typeBreakdown.map((entry) => <div className="bar-row" key={entry.label}><div><span>{entry.label}</span><strong>{formatMetric(entry.value)}</strong></div><div className="bar-track"><span style={{ width: `${Math.max((entry.value / maxType) * 100, entry.value ? 3 : 0)}%` }} /></div></div>)}</div>}</section><section className="panel chart-panel"><div className="panel-heading compact"><div><p className="eyebrow">PROCESSING</p><h2>Status overview</h2></div></div>{statusBreakdown.length === 0 ? <StateMessage icon={Activity} title="No status breakdown returned" message="The analytics endpoint did not include processing status totals." /> : <div className="status-grid">{statusBreakdown.map((entry) => <div key={entry.label}><StatusBadge status={entry.label.toLowerCase()} /><strong>{formatMetric(entry.value)}</strong></div>)}</div>}</section></div>
}

function DocumentDetails({ document, loading, error, onBack, onRetry, onDelete, onDownload, onReprocess, reprocessing, chatProps }) {
  if (loading) return <div className="panel loading-block tall"><Spinner /><span>Loading document details…</span></div>
  if (error) return <div className="panel"><StateMessage title="Could not load document" message={error} action={<><button className="button secondary small" type="button" onClick={onRetry}>Try again</button><button className="button ghost small" type="button" onClick={onBack}>Back to documents</button></>} /></div>
  if (!document) return null

  const metadataEntries = Object.entries(document.metadata || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
   return <div className="detail-view"><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={16} /> Back to documents</button><div className="detail-header"><div><div className="file-title"><span className="file-icon large"><FileText size={23} /></span><div><p className="eyebrow">DOCUMENT DETAIL</p><h2>{document.filename}</h2><span>{document.documentType || 'Unclassified'} · {formatBytes(document.size)}</span></div></div></div><div className="detail-actions"><StatusBadge status={document.status} /><button className="button secondary small" type="button" onClick={onReprocess} disabled={reprocessing}><RefreshCw size={15} />{reprocessing ? 'Reprocessing…' : 'Reprocess'}</button><button className="button secondary small" type="button" onClick={onDownload}><Download size={15} /> Download</button><button className="button danger small" type="button" onClick={onDelete}><Trash2 size={15} /> Delete</button></div></div>{document.error && <div className="alert error" role="alert"><AlertCircle size={17} />{document.error}</div>}{document.status_message && <div className={`alert ${document.status === 'failed' ? 'error' : 'warning'}`} role="status"><AlertCircle size={17} />{document.status_message}</div>}<div className="detail-grid"><section className="panel"><div className="panel-heading compact"><div><p className="eyebrow">EXTRACTED CONTENT</p><h3>Text</h3></div></div>{document.extractedText ? <pre className="extracted-text">{document.extractedText}</pre> : <StateMessage icon={FileText} title="Text is not available yet" message="Text will appear when processing is complete." />}</section><section className="panel"><div className="panel-heading compact"><div><p className="eyebrow">RECORD</p><h3>Metadata</h3></div></div><dl className="metadata-list"><div><dt>Uploaded</dt><dd>{formatDate(document.createdAt)}</dd></div><div><dt>Updated</dt><dd>{formatDate(document.updatedAt)}</dd></div>{metadataEntries.map(([key, value]) => <div key={key}><dt>{humanizeMetadataKey(key)}</dt><dd><MetadataValue field={key} value={value} /></dd></div>)}</dl>{metadataEntries.length === 0 && <p className="muted">No additional metadata returned.</p>}</section></div><ChatPanel {...chatProps} document={document} /></div>
}

function App() {
  const initialRoute = readRoute()
  const [view, setView] = useState(initialRoute.view)
  const [selectedDocumentId, setSelectedDocumentId] = useState(initialRoute.id)
  const [authenticated, setAuthenticated] = useState(Boolean(apiClient.getToken()))
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [backendState, setBackendState] = useState('checking')
  const [backendError, setBackendError] = useState('')
  const [documents, setDocuments] = useState([])
  const [documentTotal, setDocumentTotal] = useState(0)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [uploadItems, setUploadItems] = useState([])
  const [uploadError, setUploadError] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [reprocessing, setReprocessing] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const recognitionRef = useRef(null)

  const voiceSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  const setRoute = useCallback((nextView, id = null) => {
    setView(nextView)
    setSelectedDocumentId(id)
    navigate(nextView, id)
  }, [])

  useEffect(() => {
    function handleHashChange() {
      const route = readRoute()
      setView(route.view)
      setSelectedDocumentId(route.id)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const loadHealth = useCallback(async () => {
    setBackendState('checking')
    try {
      await apiClient.health()
      setBackendState('online')
      setBackendError('')
    } catch (error) {
      setBackendState('unavailable')
      setBackendError(getPayloadMessage(error, 'The backend did not respond.'))
    }
  }, [])

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true)
    setDocumentsError('')
    try {
      const result = await documentService.list({ search, status, page, pageSize })
      setDocuments((result.items || []).map(unwrapDocument))
      setDocumentTotal(Number(result.total || 0))
      setBackendState('online')
      setBackendError('')
    } catch (error) {
      setDocumentsError(getPayloadMessage(error, 'The document list could not be loaded.'))
      if (error instanceof ApiError && error.isUnavailable) {
        setBackendState('unavailable')
        setBackendError(error.message)
      }
    } finally {
      setDocumentsLoading(false)
    }
  }, [page, pageSize, search, status])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    setAnalyticsError('')
    try {
      setAnalytics(await documentService.analytics())
      setBackendState('online')
      setBackendError('')
    } catch (error) {
      setAnalyticsError(getPayloadMessage(error, 'Analytics could not be loaded.'))
      if (error instanceof ApiError && error.isUnavailable) {
        setBackendState('unavailable')
        setBackendError(error.message)
      }
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return
    let active = true
    async function verifySession() {
      try {
        const response = await apiClient.me()
        if (!active) return
        setUser(response?.data?.user || response?.user || response?.data || response)
      } catch (error) {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          apiClient.clearToken()
          setAuthenticated(false)
          setAuthError('Your session has expired. Please sign in again.')
        }
      }
    }
    verifySession()
    return () => { active = false }
  }, [authenticated])

  useEffect(() => {
    if (authenticated) {
      const taskId = window.setTimeout(() => {
        loadHealth()
        loadDocuments()
      }, 0)
      return () => window.clearTimeout(taskId)
    }
    return undefined
  }, [authenticated, loadDocuments, loadHealth])

  useEffect(() => {
    if (authenticated && (view === 'analytics' || view === 'dashboard')) {
      const taskId = window.setTimeout(loadAnalytics, 0)
      return () => window.clearTimeout(taskId)
    }
    return undefined
  }, [authenticated, loadAnalytics, view])

  useEffect(() => {
    if (!authenticated || view !== 'document' || !selectedDocumentId) return undefined
    let active = true
    const taskId = window.setTimeout(() => {
      setDetailLoading(true)
      setDetailError('')
      documentService.get(selectedDocumentId).then((response) => {
        if (active) setDetail(unwrapDocument(response))
      }).catch((error) => {
        if (active) setDetailError(getPayloadMessage(error, 'The document details could not be loaded.'))
      }).finally(() => {
        if (active) setDetailLoading(false)
      })
    }, 0)
    return () => { active = false; window.clearTimeout(taskId) }
  }, [authenticated, selectedDocumentId, view])

  useEffect(() => {
    const hasProcessingDocument = documents.some((document) => ['processing', 'queued', 'pending', 'in_progress'].includes(document.status))
    if (!authenticated || !hasProcessingDocument) return undefined
    const intervalId = window.setInterval(loadDocuments, 5000)
    return () => window.clearInterval(intervalId)
  }, [authenticated, documents, loadDocuments])

  async function handleAuth(form) {
    setAuthLoading(true)
    setAuthError('')
    try {
      const response = authMode === 'register'
        ? await apiClient.register({ name: form.name, email: form.email, password: form.password })
        : await apiClient.login({ email: form.email, password: form.password })
      const responseData = response?.data || response
      setUser(responseData?.user || responseData)
      setAuthenticated(true)
      setRoute('dashboard')
    } catch (error) {
      setAuthError(getPayloadMessage(error, 'Authentication failed.'))
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await apiClient.logout()
    } catch (error) {
      setAuthError(getPayloadMessage(error, 'Signed out locally because the backend did not respond.'))
    } finally {
      setAuthenticated(false)
      setUser(null)
      setRoute('dashboard')
    }
  }

  function updateUploadItem(key, changes) {
    setUploadItems((items) => items.map((item) => item.key === key ? { ...item, ...changes } : item))
  }

  async function handleFiles(files) {
    setUploadError('')
    if (files.length === 0) return
    const invalid = files.map((file) => ({ file, error: validateFile(file) })).find((entry) => entry.error)
    if (invalid) {
      setUploadError(`${invalid.file.name}: ${invalid.error}`)
      return
    }
    const queue = files.map((file, index) => ({ key: `${file.name}-${file.lastModified}-${index}`, name: file.name, status: 'waiting', progress: 0, error: '' }))
    setUploadItems(queue)
    for (const [index, file] of files.entries()) {
      const item = queue[index]
      updateUploadItem(item.key, { status: 'uploading' })
      try {
        await documentService.upload(file, (progress) => updateUploadItem(item.key, { progress }))
        updateUploadItem(item.key, { status: 'done', progress: 100 })
      } catch (error) {
        updateUploadItem(item.key, { status: 'failed', error: getPayloadMessage(error, 'Upload failed.') })
      }
    }
    await loadDocuments()
    if (view === 'analytics' || view === 'dashboard') await loadAnalytics()
  }

  function handleSearch(value) {
    setSearch(value)
    setPage(1)
    if (voiceMessage) setVoiceMessage('')
  }

  function startVoiceSearch() {
    if (!voiceSupported) {
      setVoiceMessage('Voice search is not supported in this browser. Use the text field instead.')
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => { setListening(true); setVoiceMessage('Listening…') }
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setSearch(transcript)
      setPage(1)
      setVoiceMessage(`Searching for “${transcript}”.`)
      setRoute('documents')
    }
    recognition.onerror = () => setVoiceMessage('Voice input failed. Use the text field instead.')
    recognition.onend = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = recognition
    recognition.start()
  }

  async function handleDelete() {
    if (!detail?.id || !window.confirm(`Delete ${detail.filename}? This cannot be undone.`)) return
    try {
      await documentService.remove(detail.id)
      setDetail(null)
      setRoute('documents')
      await loadDocuments()
    } catch (error) {
      setDetailError(getPayloadMessage(error, 'The document could not be deleted.'))
    }
  }

  async function handleDownload() {
    if (!detail?.id) return
    try {
      const blob = await documentService.download(detail.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = detail.filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setDetailError(getPayloadMessage(error, 'The document download failed.'))
    }
  }

  async function handleReprocess() {
    if (!detail?.id || reprocessing) return
    setReprocessing(true)
    setDetailError('')
    try {
      const response = await documentService.reprocess(detail.id)
      setDetail(unwrapDocument(response))
      await loadDocuments()
      if (view === 'analytics' || view === 'dashboard') await loadAnalytics()
    } catch (error) {
      setDetailError(getPayloadMessage(error, 'The document could not be reprocessed.'))
    } finally {
      setReprocessing(false)
    }
  }

  async function handleChatSubmit(event) {
    event.preventDefault()
    const documentId = detail?.id || selectedDocumentId
    const question = chatInput.trim()
    if (!documentId || !question) return
    setChatInput('')
    setChatError('')
    setChatMessages((messages) => [...messages, { role: 'user', text: question }])
    setChatLoading(true)
    try {
      const response = await documentService.chat({ documentId, question })
      const answer = response?.answer || response?.message || response?.text || 'The assistant returned no answer.'
      setChatMessages((messages) => [...messages, { role: 'assistant', text: answer }])
    } catch (error) {
      setChatError(getPayloadMessage(error, 'The assistant could not answer this question.'))
    } finally {
      setChatLoading(false)
    }
  }

  const selectedFromList = useMemo(() => documents.find((document) => String(document.id) === String(selectedDocumentId)), [documents, selectedDocumentId])
  const activeChatDocument = detail || selectedFromList
  const activeTitle = view === 'analytics' ? 'Analytics' : view === 'documents' ? 'Documents' : view === 'chat' ? 'Document chat' : view === 'document' ? 'Document details' : 'Workspace overview'
  const activeSubtitle = view === 'dashboard' ? 'A clear view of your document operations.' : 'Search, inspect, and act on your connected records.'

  if (!authenticated) return <AuthScreen mode={authMode} setMode={(mode) => { setAuthMode(mode); setAuthError('') }} onSubmit={handleAuth} loading={authLoading} error={authError} />

  const metrics = {
    total: getDataValue(analytics, ['total_documents', 'totalDocuments', 'total', 'documents_count']),
    processed: getDataValue(analytics, ['processed_documents', 'processedDocuments', 'processed']),
    processing: getDataValue(analytics, ['processing_documents', 'processingDocuments', 'processing', 'pending']),
    failed: getDataValue(analytics, ['failed_documents', 'failedDocuments', 'failed', 'errors']),
  }

  return <div className="app-shell"><Sidebar view={view} onNavigate={(nextView) => setRoute(nextView)} user={user} onLogout={handleLogout} open={sidebarOpen} close={() => setSidebarOpen(false)} /><main className="main-content"><Topbar title={activeTitle} subtitle={activeSubtitle} onMenu={() => setSidebarOpen(true)} backendState={backendState} onRetry={loadHealth} /><BackendAlert error={backendError} onRetry={loadHealth} />{voiceMessage && <div className="voice-message" role="status"><Mic size={15} />{voiceMessage}<button className="icon-button" type="button" onClick={() => setVoiceMessage('')} aria-label="Dismiss voice status"><X size={14} /></button></div>}
    {view === 'dashboard' && <div className="page-content"><div className="welcome-row"><div><p className="eyebrow">OPERATIONS CENTER</p><h2>Good to see you{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h2><p>Monitor ingestion, processing, and retrieval from one workspace.</p></div><button className="button secondary" type="button" onClick={() => setRoute('documents')}><FolderOpen size={17} /> View library</button></div><div className="metrics-grid"><MetricCard label="Total documents" value={metrics.total} detail="From stored records" icon={FolderOpen} /><MetricCard label="Processed" value={metrics.processed} detail="Ready to search" icon={CheckCircle2} /><MetricCard label="In progress" value={metrics.processing} detail="Awaiting extraction" icon={Clock3} /><MetricCard label="Failed" value={metrics.failed} detail="Needs review" icon={AlertCircle} /></div><UploadPanel uploadItems={uploadItems} error={uploadError} onFiles={handleFiles} onClearError={() => setUploadError('')} /><div className="library-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Document library</h2></div><button className="link-button" type="button" onClick={() => setRoute('documents')}>View all <ChevronRight size={15} /></button></div><DocumentsTable documents={documents.slice(0, 5)} loading={documentsLoading} error={documentsError} page={page} pageSize={pageSize} total={Math.min(documentTotal, 5)} onPageChange={setPage} onOpen={(id) => setRoute('document', id)} onRetry={loadDocuments} /></div>}
    {view === 'documents' && <div className="page-content"><div className="page-heading"><div><p className="eyebrow">LIBRARY</p><h2>All documents</h2><p>Find records by filename, extracted content, or metadata.</p></div><button className="button primary" type="button" onClick={() => setRoute('dashboard')}><Upload size={16} /> Upload document</button></div><SearchControls search={search} status={status} onSearch={handleSearch} onStatus={(value) => { setStatus(value); setPage(1) }} onVoice={startVoiceSearch} voiceSupported={voiceSupported} listening={listening} /><DocumentsTable documents={documents} loading={documentsLoading} error={documentsError} page={page} pageSize={pageSize} total={documentTotal} onPageChange={setPage} onOpen={(id) => setRoute('document', id)} onRetry={loadDocuments} /></div>}
    {view === 'analytics' && <div className="page-content"><div className="page-heading"><div><p className="eyebrow">INSIGHTS</p><h2>Analytics overview</h2><p>Operational signals calculated from backend document records.</p></div><button className="button secondary" type="button" onClick={loadAnalytics}><RefreshCw size={16} /> Refresh</button></div><AnalyticsView analytics={analytics} loading={analyticsLoading} error={analyticsError} onRetry={loadAnalytics} /></div>}
     {view === 'document' && <div className="page-content"><DocumentDetails document={detail} loading={detailLoading} error={detailError} onBack={() => setRoute('documents')} onRetry={() => { setView('documents'); setTimeout(() => setRoute('document', selectedDocumentId), 0) }} onDelete={handleDelete} onDownload={handleDownload} onReprocess={handleReprocess} reprocessing={reprocessing} chatProps={{ messages: chatMessages, input: chatInput, setInput: setChatInput, loading: chatLoading, error: chatError, onSend: handleChatSubmit }} /></div>}
    {view === 'chat' && <div className="page-content"><div className="page-heading"><div><p className="eyebrow">RETRIEVAL</p><h2>Document chat</h2><p>Ask questions grounded in one authenticated document at a time.</p></div></div><div className="chat-layout"><aside className="panel chat-documents"><div className="panel-heading compact"><div><h3>Select a document</h3><p>Processed records are best for chat.</p></div></div>{documents.length === 0 ? <StateMessage icon={FolderOpen} title="No documents available" message="Upload and process a document first." /> : <div className="chat-document-list">{documents.map((document) => <button className={`chat-document ${String(activeChatDocument?.id) === String(document.id) ? 'selected' : ''}`} type="button" key={document.id} onClick={() => { setDetail(document); setSelectedDocumentId(document.id); setChatMessages([]); setChatError('') }}><FileText size={17} /><span><strong>{document.filename}</strong><small>{readableStatus(document.status)}</small></span></button>)}</div>}</aside><ChatPanel {...{ document: activeChatDocument, messages: chatMessages, input: chatInput, setInput: setChatInput, loading: chatLoading, error: chatError, onSend: handleChatSubmit }} /></div></div>}
  </main></div>
}

export default App
