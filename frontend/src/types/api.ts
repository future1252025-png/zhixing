export interface BusinessError {
  status: number
  code: string
  message: string
  fields: string[]
  details: Record<string, unknown>
}
