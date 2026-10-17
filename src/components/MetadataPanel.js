import { createElement as h } from 'react'

const AMOUNT_FIELDS = new Set(['subtotal', 'tax', 'total'])

function humanizeMetadataKey(key) {
  return String(key).replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bSku\b/g, 'SKU')
}

function metadataText(value) {
  if (value === undefined || value === null || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
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
  if (vcard) return h('div', { className: 'metadata-vcard' },
    h('strong', null, vcard.name || 'Contact card'),
    vcard.organization && h('span', null, vcard.organization),
    vcard.title && h('span', null, vcard.title),
    vcard.phone && h('a', { href: `tel:${vcard.phone}` }, vcard.phone),
    vcard.email && h('a', { href: `mailto:${vcard.email}` }, vcard.email),
    vcard.address && h('span', null, vcard.address),
  )
  const isUrl = typeof code.data === 'string' && /^(?:https?:\/\/|www\.)/i.test(code.data)
  const href = isUrl && /^https?:\/\//i.test(code.data) ? code.data : `https://${code.data}`
  return isUrl ? h('a', { href, target: '_blank', rel: 'noreferrer' }, code.data) : h('span', null, code.data || 'Empty value')
}

function MetadataValue({ field, value }) {
  if (field === 'barcodes' && Array.isArray(value)) {
    if (value.length === 0) return h('span', { className: 'muted' }, 'No codes detected')
    return h('div', { className: 'metadata-codes' }, value.map((code, index) => h('div', { className: 'metadata-code', key: `${code.type}-${code.data}-${code.page ?? index}` },
      h('span', { className: 'metadata-code-type' }, code.type || 'CODE'),
      h(BarcodeValue, { code }),
      code.page && h('small', null, `Page ${code.page}`),
    )))
  }

  if (field === 'entities' && value && typeof value === 'object') {
    const groups = Object.entries(value).filter(([key, entries]) => key !== 'source' && Array.isArray(entries) && entries.length > 0)
    return h('div', { className: 'metadata-entities' },
      groups.map(([key, entries]) => h('div', { className: 'metadata-entity-group', key },
        h('small', null, humanizeMetadataKey(key)),
        h('div', { className: 'metadata-chips' }, entries.map((entry, index) => h('span', { className: 'metadata-chip', key: index }, metadataText(entry)))),
      )),
      h('small', { className: 'metadata-source' }, `Source: ${value.source || 'fallback'}`),
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return h('span', { className: 'muted' }, 'None detected')
    return h('div', { className: 'metadata-chips' }, value.map((entry, index) => h('span', { className: 'metadata-chip', key: index }, metadataText(entry))))
  }

  if (value && typeof value === 'object') return h('pre', { className: 'metadata-json' }, JSON.stringify(value, null, 2))
  return h('span', null, metadataText(value))
}

export default function MetadataPanel({ metadata, uploaded, updated }) {
  const entityGroups = metadata?.entities && typeof metadata.entities === 'object' ? metadata.entities : {}
  const entries = Object.entries(metadata || {}).filter(([key, value]) => (
    key !== 'line_items'
    && !(Array.isArray(entityGroups[key]) && ['organizations', 'locations'].includes(key))
    && (AMOUNT_FIELDS.has(key) || (value !== undefined && value !== null && value !== ''))
  ))

  return h('section', { className: 'panel' },
    h('div', { className: 'panel-heading compact' },
      h('div', null, h('p', { className: 'eyebrow' }, 'RECORD'), h('h3', null, 'Metadata')),
    ),
    h('dl', { className: 'metadata-list' },
      h('div', null, h('dt', null, 'Uploaded'), h('dd', null, uploaded)),
      h('div', null, h('dt', null, 'Updated'), h('dd', null, updated)),
      entries.map(([key, value]) => h('div', { key }, h('dt', null, humanizeMetadataKey(key)), h('dd', null, h(MetadataValue, { field: key, value })))),
    ),
    entries.length === 0 && h('p', { className: 'muted' }, 'No additional metadata returned.'),
  )
}
