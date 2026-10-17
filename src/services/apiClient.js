const DEFAULT_API_BASE_URL = '/api/v1'
const TOKEN_KEY = 'logivoice.accessToken'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isUnavailable() {
    return this.status === 0 || this.status >= 500
  }
}

export function normalizeBaseUrl(value = DEFAULT_API_BASE_URL) {
  const baseUrl = String(value || DEFAULT_API_BASE_URL).trim()
  return baseUrl.replace(/\/+$/, '') || '/api/v1'
}

function getRuntimeBaseUrl() {
  const environment = import.meta.env || {}
  return normalizeBaseUrl(environment.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)
}

function getDefaultTokenStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  return null
}

function getErrorMessage(payload, fallback) {
  if (typeof payload === 'string' && payload.trim()) return payload
  if (payload?.error && typeof payload.error === 'string') return payload.error
  if (payload?.error?.message) return payload.error.message
  if (payload?.message) return payload.message
  if (payload?.detail) return payload.detail
  return fallback
}

export function createApiError(responseOrError, payload = null) {
  if (responseOrError instanceof ApiError) return responseOrError

  if (responseOrError instanceof Error && !payload) {
    return new ApiError('The backend could not be reached. Check your connection and try again.', {
      code: 'BACKEND_UNAVAILABLE',
      details: responseOrError.message,
    })
  }

  const status = Number(responseOrError?.status || 0)
  const body = payload || responseOrError?.payload || null
  const fallback = status ? `Request failed (${status}).` : 'Request failed.'
  const code = body?.error?.code || body?.code || (status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED')

  return new ApiError(getErrorMessage(body, fallback), {
    status,
    code,
    details: body,
  })
}

async function readResponseBody(response, responseType) {
  if (response.status === 204) return null
  if (responseType === 'blob' && response.ok) return response.blob()

  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function createApiClient({
  baseUrl = getRuntimeBaseUrl(),
  fetchImpl = globalThis.fetch,
  tokenStorage = getDefaultTokenStorage(),
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  function getToken() {
    return tokenStorage?.getItem?.(TOKEN_KEY) || null
  }

  function setToken(token) {
    if (token) tokenStorage?.setItem?.(TOKEN_KEY, token)
  }

  function clearToken() {
    tokenStorage?.removeItem?.(TOKEN_KEY)
  }

  function buildUrl(path) {
    if (/^https?:\/\//i.test(path)) return path
    const suffix = String(path).replace(/^\/+/, '')
    return `${normalizedBaseUrl}/${suffix}`
  }

  function getHeaders(extraHeaders = {}, hasJsonBody = false) {
    const headers = { Accept: 'application/json', ...extraHeaders }
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    if (hasJsonBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    return headers
  }

  async function request(path, options = {}) {
    const {
      body,
      headers: extraHeaders,
      responseType = 'json',
      ...fetchOptions
    } = options
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
    const hasJsonBody = body !== undefined && !isFormData && typeof body !== 'string'
    const requestBody = hasJsonBody ? JSON.stringify(body) : body

    if (typeof fetchImpl !== 'function') {
      throw new ApiError('No fetch implementation is available in this environment.', {
        code: 'FETCH_UNAVAILABLE',
      })
    }

    let response
    try {
      response = await fetchImpl(buildUrl(path), {
        ...fetchOptions,
        body: requestBody,
        headers: getHeaders(extraHeaders, hasJsonBody),
      })
    } catch (error) {
      throw createApiError(error)
    }

    const payload = await readResponseBody(response, responseType)
    if (!response.ok) throw createApiError(response, payload)
    return payload
  }

  function upload(path, formData, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      if (typeof XMLHttpRequest === 'undefined') {
        reject(new ApiError('File uploads require a browser environment.', { code: 'UPLOAD_UNAVAILABLE' }))
        return
      }

      const xhr = new XMLHttpRequest()
      xhr.open('POST', buildUrl(path))
      const token = getToken()
      xhr.setRequestHeader('Accept', 'application/json')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
      xhr.onerror = () => reject(createApiError(new Error('Upload request failed.')))
      xhr.onabort = () => reject(new ApiError('Upload cancelled.', { code: 'UPLOAD_CANCELLED' }))
      xhr.onload = () => {
        let payload = null
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : null
        } catch {
          payload = xhr.responseText || null
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(createApiError({ status: xhr.status }, payload))
          return
        }
        onProgress?.(100)
        resolve(payload)
      }
      xhr.send(formData)
    })
  }

  async function authenticate(path, credentials) {
    const response = await request(path, { method: 'POST', body: credentials })
    const data = response?.data ?? response
    const token = data?.access_token || data?.accessToken || data?.token
    if (token) setToken(token)
    return response
  }

  return {
    baseUrl: normalizedBaseUrl,
    request,
    upload,
    getToken,
    setToken,
    clearToken,
    health: () => request('/health', { method: 'GET' }),
    login: (credentials) => authenticate('/auth/login', credentials),
    register: (credentials) => authenticate('/auth/register', credentials),
    logout: async () => {
      try {
        await request('/auth/logout', { method: 'POST' })
      } finally {
        clearToken()
      }
    },
    me: () => request('/auth/me', { method: 'GET' }),
  }
}

export const apiClient = createApiClient()
