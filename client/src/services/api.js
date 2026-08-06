import axios from 'axios'

const configuredUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').trim().replace(/\/+$/, '')
const baseURL = configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`

const api = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true,
  headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
})

api.interceptors.request.use(config => {
  if (config.data instanceof FormData) delete config.headers['Content-Type']
  else config.headers['Content-Type'] = 'application/json'
  return config
})

api.interceptors.response.use(
  response => response.data,
  error => {
    const payload = error.response?.data || {
      success: false,
      message: error.code === 'ERR_NETWORK'
        ? 'Cannot reach the Visitor Pass API. Check the deployment URL and server availability.'
        : error.message || 'Request failed',
    }
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      window.dispatchEvent(new Event('auth:expired'))
    }
    return Promise.reject(payload)
  },
)

export default api
