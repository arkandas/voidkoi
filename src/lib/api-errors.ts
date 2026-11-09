import { NextResponse } from 'next/server'
import { ApiError, type ApiErrorCode } from '@/lib/error-codes'

export function apiError(code: ApiErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status })
}

/** Run a handler body: an ApiError becomes its response, anything else is logged and becomes `fallback`. */
export async function handle(fallback: ApiErrorCode, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof ApiError) return apiError(error.code, error.status)
    console.error(`${fallback}:`, error)
    return apiError(fallback, 500)
  }
}
