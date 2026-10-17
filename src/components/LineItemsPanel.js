import { createElement as h, useId } from 'react'

const COLUMNS = [
  { key: 'description', label: 'Description' },
  { key: 'sku', label: 'SKU' },
  { key: 'quantity', label: 'Quantity', numeric: true },
  { key: 'unit', label: 'Unit' },
  { key: 'unit_price', label: 'Unit price', numeric: true },
  { key: 'amount', label: 'Amount', numeric: true },
]

function displayCell(value) {
  // Decimal strings are deliberately never parsed: precision and trailing zeros matter.
  if (typeof value === 'string' && value.trim() !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return '—'
}

export default function LineItemsPanel({ items, currency }) {
  const headingId = useId()
  const hintId = useId()
  const rows = Array.isArray(items) ? items.filter((item) => (
    item && typeof item === 'object' && !Array.isArray(item)
    && COLUMNS.some(({ key }) => Object.hasOwn(item, key))
  )) : []
  const hasCurrency = typeof currency === 'string' && currency.trim() !== ''

  return h('section', { className: 'panel line-items-panel', 'aria-labelledby': headingId },
    h('div', { className: 'panel-heading compact' },
      h('div', null,
        h('p', { className: 'eyebrow' }, 'LOGISTICS'),
        h('h3', { id: headingId }, 'Line items'),
        h('p', null, hasCurrency ? `Currency: ${currency}. Values shown as extracted.` : 'Currency not provided. Values shown as extracted.'),
      ),
    ),
    rows.length === 0
      ? h('div', { className: 'state-message', role: 'status' },
        h('div', null,
          h('strong', null, 'No line items available'),
          h('p', null, 'This document has no readable line-item details.'),
        ),
      )
      : h('div', null,
        h('p', { id: hintId, className: 'line-items-note muted' }, '— means not provided. Scroll horizontally to see all columns on smaller screens.'),
        rows.length < items.length && h('p', { className: 'line-items-note muted', role: 'status' }, 'Some line items could not be displayed.'),
        h('div', { className: 'table-wrap line-items-scroll', role: 'region', 'aria-label': 'Line items table', 'aria-describedby': hintId, tabIndex: 0 },
          h('table', { className: 'line-items-table' },
            h('caption', { className: 'sr-only' }, 'Extracted line items'),
            h('thead', null,
              h('tr', null, COLUMNS.map(({ key, label, numeric }) => h('th', { key, scope: 'col', className: numeric ? 'line-item-number' : undefined }, label))),
            ),
            h('tbody', null, rows.map((item, index) => h('tr', { key: index },
              COLUMNS.map(({ key, numeric }) => h('td', { key, className: numeric ? 'line-item-number' : undefined }, displayCell(item[key]))),
            ))),
          ),
        ),
      ),
  )
}
