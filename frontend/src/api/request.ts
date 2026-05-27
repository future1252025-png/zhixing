import axios from 'axios'

export const TOKEN_STORAGE_KEY = 'campusmind_token'

const apiBaseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const request = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

export default request
