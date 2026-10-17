import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import LineItemsPanel from '../src/components/LineItemsPanel.js'
import MetadataPanel from '../src/components/MetadataPanel.js'
import { unwrapDocument } from '../src/utils/unwrapDocument.js'

const renderItems = (props = {}) => renderToStaticMarkup(h(LineItemsPanel, props))
const renderMetadata = (metadata) => renderToStaticMarkup(h(MetadataPanel, {
  metadata,
  uploaded: 'Oct 17, 2026',
  updated: 'Oct 18, 2026',
}))
const cells = (markup) => [...markup.matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)].map((match) => match[1])

test('renders a named, keyboard-accessible six-column line-items table with exact decimal values', () => {
  const markup = renderItems({
    currency: 'EUR',
    items: [{
      description: 'Pallet transport',
      sku: '0012-AB',
      quantity: '2.000',
      unit: 'pallet',
      unit_price: '1234.50',
      amount: '90071992547409931234567890.50',
    }],
  })

  assert.deepEqual([...markup.matchAll(/<th\b[^>]*scope="col"[^>]*>(.*?)<\/th>/g)].map((match) => match[1]), [
    'Description', 'SKU', 'Quantity', 'Unit', 'Unit price', 'Amount',
  ])
  assert.deepEqual(cells(markup), ['Pallet transport', '0012-AB', '2.000', 'pallet', '1234.50', '90071992547409931234567890.50'])
  assert.match(markup, /<caption[^>]*>Extracted line items<\/caption>/)
  assert.match(markup, /role="region" aria-label="Line items table" aria-describedby="[^"]+" tabindex="0"/)
  const headingId = markup.match(/<h3 id="([^"]+)">Line items<\/h3>/)[1]
  assert.ok(markup.includes(`aria-labelledby="${headingId}"`))
  const hintId = markup.match(/aria-describedby="([^"]+)"/)[1]
  assert.ok(markup.includes(`id="${hintId}"`))
  assert.match(markup, /Currency: EUR/)
  assert.doesNotMatch(markup, /USD|\$/)
})

test('distinguishes missing cells from zero and retains decimal trailing zeros', () => {
  const markup = renderItems({ items: [
    { description: 'Free sample', sku: null, quantity: '0', unit: null, unit_price: '0.00', amount: '0.00' },
    { description: null, sku: '', quantity: null, unit: ' ', unit_price: undefined, amount: '' },
    { description: 'Legacy numeric zero', quantity: 0, unit_price: 0, amount: 0 },
  ] })

  assert.deepEqual(cells(markup), [
    'Free sample', '—', '0', '—', '0.00', '0.00',
    '—', '—', '—', '—', '—', '—',
    'Legacy numeric zero', '—', '0', '—', '0', '0',
  ])
  assert.match(markup, /— means not provided/)
  assert.match(markup, /Currency not provided/)
  assert.doesNotMatch(markup, /USD|\$/)
})

test('escapes extracted text and currency rather than interpreting it as HTML', () => {
  const markup = renderItems({
    currency: '<script>bad()</script>',
    items: [{
      description: '<img src=x onerror="bad()">',
      sku: 'A&B',
      quantity: '1',
      unit: '<script>bad()</script>',
      unit_price: '0.00',
      amount: '5.00 < 6.00',
    }],
  })

  assert.deepEqual(cells(markup), [
    '&lt;img src=x onerror=&quot;bad()&quot;&gt;', 'A&amp;B', '1', '&lt;script&gt;bad()&lt;/script&gt;', '0.00', '5.00 &lt; 6.00',
  ])
  assert.match(markup, /Currency: &lt;script&gt;bad\(\)&lt;\/script&gt;/)
  assert.doesNotMatch(markup, /<img\b|<script\b/)
})

test('uses placeholders for malformed cell values without coercing objects or booleans', () => {
  const markup = renderItems({
    currency: { code: 'USD' },
    items: [
      { description: { nested: 'bad' }, sku: ['bad'], quantity: false, unit: true, unit_price: { value: '1.00' }, amount: ['1.00'] },
      { description: 'Non-finite numbers', quantity: NaN, unit_price: Infinity, amount: -Infinity },
    ],
  })

  assert.deepEqual(cells(markup), [
    '—', '—', '—', '—', '—', '—',
    'Non-finite numbers', '—', '—', '—', '—', '—',
  ])
  assert.match(markup, /Currency not provided/)
  assert.doesNotMatch(markup, /\[object Object\]|NaN|Infinity|USD/)
})

test('handles absent, empty, and malformed line_items with an informative empty state', () => {
  for (const items of [undefined, null, [], '', 'not an array', 0, false, {}, { description: 'not a row array' }, [null, undefined, false, 4, 'bad', [], {}, { unknown: 'bad' }]]) {
    const markup = renderItems({ items })
    assert.match(markup, /role="status"/)
    assert.match(markup, /No line items available/)
    assert.match(markup, /no readable line-item details/)
    assert.doesNotMatch(markup, /<table\b|\[object Object\]/)
  }
})

test('retains readable rows in a mixed malformed array and reports skipped rows', () => {
  const markup = renderItems({ items: [
    null, 123, 'bad', [], {}, { unknown: 'bad' },
    { description: 'Transport', quantity: '1', amount: '10.00' },
    { description: 'Discount', amount: '-1.50' },
  ] })

  assert.deepEqual(cells(markup), [
    'Transport', '—', '1', '—', '—', '10.00',
    'Discount', '—', '—', '—', '—', '-1.50',
  ])
  assert.match(markup, /Some line items could not be displayed/)
  assert.doesNotMatch(markup, /\[object Object\]|metadata-chip/)
})

test('renders the backend fields contract and normalized metadata identically', () => {
  const fields = {
    subtotal: '1234.50',
    tax: '0.00',
    total: '1234.50',
    currency: 'GBP',
    due_date: '2026-11-01',
    purchase_order_number: 'PO-001',
    tracking_number: '0000123456',
    carrier: 'Example Logistics',
    line_items: [{ description: 'Freight', sku: 'SKU-01', quantity: '1', unit: 'load', unit_price: '1234.50', amount: '1234.50' }],
  }
  function renderDocumentMetadata(payload) {
    const document = unwrapDocument(payload)
    return renderToStaticMarkup(h(Fragment, null,
      h(MetadataPanel, { metadata: document.metadata, uploaded: 'Today', updated: 'Today' }),
      h(LineItemsPanel, { items: document.metadata.line_items, currency: document.metadata.currency }),
    ))
  }

  const markup = renderDocumentMetadata({ fields })
  assert.equal(markup, renderDocumentMetadata({ metadata: fields }))
  assert.equal(markup, renderDocumentMetadata({ document: { fields } }))
  assert.match(markup, /<dt>Subtotal<\/dt><dd><span>1234\.50<\/span>/)
  assert.match(markup, /<dt>Tax<\/dt><dd><span>0\.00<\/span>/)
  assert.match(markup, /<dt>Total<\/dt><dd><span>1234\.50<\/span>/)
  assert.match(markup, /<dt>Currency<\/dt><dd><span>GBP<\/span>/)
  assert.match(markup, /<dt>Due Date<\/dt><dd><span>2026-11-01<\/span>/)
  assert.match(markup, /<dt>Purchase Order Number<\/dt><dd><span>PO-001<\/span>/)
  assert.match(markup, /<dt>Tracking Number<\/dt><dd><span>0000123456<\/span>/)
  assert.match(markup, /<dt>Carrier<\/dt><dd><span>Example Logistics<\/span>/)
  assert.deepEqual(cells(markup), ['Freight', 'SKU-01', '1', 'load', '1234.50', '1234.50'])
  assert.doesNotMatch(markup, /<dt>Line Items<\/dt>|\[object Object\]|USD/)
})

test('shows missing scalar amounts as em dashes and never defaults a missing currency', () => {
  const metadata = { subtotal: null, tax: '', total: '0.00', currency: null, sku: '0001' }
  const markup = renderMetadata(metadata)

  assert.match(markup, /<dt>Subtotal<\/dt><dd><span>—<\/span>/)
  assert.match(markup, /<dt>Tax<\/dt><dd><span>—<\/span>/)
  assert.match(markup, /<dt>Total<\/dt><dd><span>0\.00<\/span>/)
  assert.match(markup, /<dt>SKU<\/dt><dd><span>0001<\/span>/)
  assert.doesNotMatch(markup, /<dt>Currency<\/dt>|USD|\$/)
})

test('excludes line_items from the metadata sidebar regardless of its shape', () => {
  for (const lineItems of [undefined, null, [], [{ description: 'Handled in table' }], 'bad', { description: 'bad' }]) {
    const markup = renderMetadata({ line_items: lineItems, carrier: 'Example Carrier' })
    assert.match(markup, /Example Carrier/)
    assert.doesNotMatch(markup, /Line Items|Handled in table|\[object Object\]/)
  }
})

test('does not duplicate organization and location fields already grouped in entities', () => {
  const markup = renderMetadata({
    organizations: ['Acme Digital Solutions'],
    locations: ['Digitaland'],
    entities: {
      organizations: ['Acme Digital Solutions'],
      locations: ['Digitaland'],
      source: 'spacy+regex',
    },
  })

  assert.equal((markup.match(/<dt>Organizations<\/dt>/g) || []).length, 0)
  assert.equal((markup.match(/<dt>Locations<\/dt>/g) || []).length, 0)
  assert.match(markup, /<small>Organizations<\/small>/)
  assert.match(markup, /<small>Locations<\/small>/)
})

test('older documents retain QR links, barcode text and pages, vCards, and grouped entities', () => {
  const document = unwrapDocument({
    file_name: 'old-manifest.pdf',
    extracted_data: {
      barcodes: [
        { type: 'QRCODE', data: 'https://example.test/track?a=1&b=2', page: 1 },
        { type: 'QRCODE', data: 'www.example.test/track' },
        { type: 'CODE128', data: '0000123456', page: 2 },
        { type: 'QRCODE', data: 'BEGIN:VCARD\r\nFN:Alex Doe\r\nORG:Example Freight\r\nTITLE:Dispatcher\r\nTEL:+441234567\r\nEMAIL:alex@example.test\r\nADR:;;1 Main St;London;;;UK\r\nEND:VCARD' },
      ],
      entities: { organizations: ['Example Freight'], locations: ['London'], empty: [], source: 'ner' },
      tags: ['freight', 'priority'],
      reference: { warehouse: 'A1' },
    },
  })
  const markup = renderMetadata(document.metadata)

  assert.match(markup, /href="https:\/\/example\.test\/track\?a=1&amp;b=2" target="_blank" rel="noreferrer"/)
  assert.match(markup, /href="https:\/\/www\.example\.test\/track"/)
  assert.match(markup, /CODE128/)
  assert.match(markup, /0000123456/)
  assert.match(markup, /Page 1/)
  assert.match(markup, /Page 2/)
  assert.match(markup, /<strong>Alex Doe<\/strong>/)
  assert.match(markup, /Dispatcher/)
  assert.match(markup, /href="tel:\+441234567"/)
  assert.match(markup, /href="mailto:alex@example\.test"/)
  assert.match(markup, /1 Main St, London, UK/)
  assert.match(markup, /<small>Organizations<\/small>/)
  assert.match(markup, /<small>Locations<\/small>/)
  assert.match(markup, /Source: ner/)
  assert.match(markup, /class="metadata-chip">freight<\/span>/)
  assert.match(markup, /class="metadata-json"/)
  assert.match(markup, /&quot;warehouse&quot;: &quot;A1&quot;/)
  assert.match(markup, /Oct 17, 2026/)
  assert.match(markup, /Oct 18, 2026/)
  assert.match(renderItems({ items: document.metadata.line_items }), /No line items available/)
  assert.doesNotMatch(markup, /Line Items|\[object Object\]/)
})

test('old documents without metadata and existing empty metadata groups still render', () => {
  for (const payload of [undefined, {}, { fields: null }, { document: { filename: 'old.pdf' } }]) {
    const document = unwrapDocument(payload)
    assert.match(renderMetadata(document.metadata), /No additional metadata returned/)
    assert.match(renderItems({ items: document.metadata.line_items }), /No line items available/)
  }

  const markup = renderMetadata({ barcodes: [], tags: [], entities: { locations: [] }, optional_field: null })
  assert.match(markup, /No codes detected/)
  assert.match(markup, /None detected/)
  assert.match(markup, /Source: fallback/)
  assert.doesNotMatch(markup, /Optional Field/)
})

test('generic arrays remain readable chips, including JSON objects rather than object coercion', () => {
  const markup = renderMetadata({ references: ['REF-1', { code: 'REF-2 <fragile>' }, 0] })

  assert.match(markup, /class="metadata-chip">REF-1<\/span>/)
  assert.match(markup, /class="metadata-chip">\{&quot;code&quot;:&quot;REF-2 &lt;fragile&gt;&quot;\}<\/span>/)
  assert.match(markup, /class="metadata-chip">0<\/span>/)
  assert.doesNotMatch(markup, /\[object Object\]|<fragile>/)
})
