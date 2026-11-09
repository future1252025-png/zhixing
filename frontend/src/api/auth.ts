import request from './request'
import { isNativeAuthClient } from '@/auth/sessionTokens'
import type { CourseSnapshot } from '@/utils/courseSnapshot'

export type AuthUser = {
  id: number
  student_id: string
  nickname: string
  avatar_text: string | null
  avatar_color: string | null
  role: string
  created_at: string
}

export type RegisterPayload = {
  student_id: string
  password: string
  nickname: string
}

export type LoginPayload = {
  student_id: string
  password: string
}

export type ProfileUpdatePayload = {
  nickname: string
  avatar_text?: string | null
  avatar_color?: string | null
}

export type DeleteAccountPayload = {
  password: string
}

export type LoginResponse = {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  refresh_token?: string
  user: AuthUser
  startup?: CourseSnapshot
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  const response = await request.post<AuthUser>('/api/auth/register', payload)
  return response.data
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await request.post<LoginResponse>('/api/auth/login', {
    ...payload,
    client_kind: isNativeAuthClient() ? 'native' : 'web',
    include_startup: true
  })
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

export async function deleteAccount(payload: DeleteAccountPayload): Promise<void> {
  await request.delete('/api/auth/me', { data: payload })
}
