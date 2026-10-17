import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createApiClient, normalizeBaseUrl } from '../src/services/apiClient.js'
import { normalizeList } from '../src/services/documentService.js'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test('normalizes API base URLs without changing their configured origin', () => {
  assert.equal(normalizeBaseUrl('https://api.example.test/api/v1///'), 'https://api.example.test/api/v1')
  assert.equal(normalizeBaseUrl('/api/v1/'), '/api/v1')
  assert.equal(normalizeBaseUrl(''), '/api/v1')
})

test('adds a stored bearer token and serializes JSON requests', async () => {
  const calls = []
  const client = createApiClient({
    baseUrl: 'https://api.example.test/api/v1/',
    tokenStorage: storage({ 'logivoice.accessToken': 'test-token' }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })

  await client.request('/documents', { method: 'POST', body: { filename: 'manifest.txt' } })

  assert.equal(calls[0].url, 'https://api.example.test/api/v1/documents')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.equal(calls[0].options.body, JSON.stringify({ filename: 'manifest.txt' }))
})

test('normalizes structured API errors into ApiError', async () => {
  const client = createApiClient({
    baseUrl: '/api/v1',
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'INVALID_FILE', message: 'Unsupported file type.' } }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    }),
  })

  await assert.rejects(
    client.request('/documents', { method: 'GET' }),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 422)
      assert.equal(error.code, 'INVALID_FILE')
      assert.equal(error.message, 'Unsupported file type.')
      assert.equal(error.isUnavailable, false)
      return true
    },
  )
})

test('parses JSON errors even when the request expects a blob', async () => {
  const client = createApiClient({
    baseUrl: '/api/v1',
    fetchImpl: async () => new Response(JSON.stringify({
      success: false,
      error: { code: 'file_not_found', message: 'The document file is no longer available.' },
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }),
  })

  await assert.rejects(
    client.request('/documents/18/download', { method: 'GET', responseType: 'blob' }),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 404)
      assert.equal(error.code, 'file_not_found')
      assert.equal(error.message, 'The document file is no longer available.')
      return true
    },
  )
})

test('health uses the configured request pipeline', async () => {
  const calls = []
  const client = createApiClient({
    baseUrl: '/api/v1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    },
  })

  const result = await client.health()

  assert.deepEqual(result, { status: 'ok' })
  assert.equal(calls[0].url, '/api/v1/health')
  assert.equal(calls[0].options.method, 'GET')
})

test('normalizes the backend document envelope and top-level pagination metadata', () => {
  const result = normalizeList({
    success: true,
    data: { documents: [{ id: 7, filename: 'manifest.txt' }] },
    meta: { page: 2, per_page: 10, total: 11, pages: 2 },
  })

  assert.deepEqual(result.items, [{ id: 7, filename: 'manifest.txt' }])
  assert.equal(result.page, 2)
  assert.equal(result.pageSize, 10)
  assert.equal(result.total, 11)
})
