import { apiClient } from './apiClient.js'

function unwrapData(response) {
  return response?.data ?? response
}

function toQueryString(params) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') searchParams.set(key, value)
  })
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function normalizeList(response) {
  const payload = unwrapData(response)
  const responseMeta = response?.meta || {}
  if (Array.isArray(payload)) return { items: payload, total: payload.length, page: 1, pageSize: payload.length }

  const items = payload?.items || payload?.documents || payload?.results || []
  const pagination = payload?.pagination || payload?.meta || responseMeta || {}
  return {
    ...payload,
    items: Array.isArray(items) ? items : [],
    total: Number(payload?.total ?? payload?.count ?? pagination.total ?? items.length),
    page: Number(payload?.page || pagination.page || 1),
    pageSize: Number(payload?.page_size || payload?.pageSize || pagination.page_size || pagination.pageSize || pagination.per_page || items.length || 1),
  }
}

export const documentService = {
  list: async ({ search = '', status = '', page = 1, pageSize = 10 } = {}) => {
    const response = await apiClient.request(`/documents${toQueryString({ q: search, status, page, per_page: pageSize })}`)
    return normalizeList(response)
  },

  get: async (documentId) => unwrapData(await apiClient.request(`/documents/${encodeURIComponent(documentId)}`)),

  reprocess: async (documentId) => unwrapData(await apiClient.request(`/documents/${encodeURIComponent(documentId)}/reprocess`, { method: 'POST' })),

  upload: async (file, onProgress) => {
    const formData = new FormData()
    formData.append('files', file)
    return unwrapData(await apiClient.upload('/documents', formData, { onProgress }))
  },

  remove: (documentId) => apiClient.request(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' }),

  download: (documentId) => apiClient.request(`/documents/${encodeURIComponent(documentId)}/download`, {
    method: 'GET',
    responseType: 'blob',
  }),

  analytics: async () => unwrapData(await apiClient.request('/analytics/overview', { method: 'GET' })),

  search: async (query, options = {}) => documentService.list({ ...options, search: query }),

  chat: async ({ documentId, question }) => {
    const response = await apiClient.request('/chat', {
      method: 'POST',
      body: { document_id: documentId, question },
    })
    return unwrapData(response)
  },
}
