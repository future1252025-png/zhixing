import request from './request'

export type AuthUser = {
  id: number
  student_id: string | null
  username: string
  nickname: string
  avatar_text: string | null
  avatar_color: string | null
  role: string
  created_at: string
}

export type RegisterPayload = {
  username: string
  password: string
  nickname: string
  student_id?: string | null
}

export type LoginPayload = {
  username: string
  password: string
}

export type ProfileUpdatePayload = {
  nickname: string
  avatar_text?: string | null
  avatar_color?: string | null
}

export type LoginResponse = {
  access_token: string
  token_type: 'bearer'
  user: AuthUser
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  const response = await request.post<AuthUser>('/api/auth/register', payload)
  return response.data
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await request.post<LoginResponse>('/api/auth/login', payload)
  return response.data
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await request.get<AuthUser>('/api/auth/me')
  return response.data
}

export async function updateProfile(payload: ProfileUpdatePayload): Promise<AuthUser> {
  const response = await request.patch<AuthUser>('/api/auth/me', payload)
  return response.data
}
