export interface ApiGetOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxRetries?: number
  baseDelayMs?: number
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiGet<T>(
  url: string,
  options: ApiGetOptions = {},
): Promise<T> {
  const {
    signal,
    timeoutMs = 10_000,
    maxRetries = 3,
    baseDelayMs = 1000,
  } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController()
    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal

    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, { signal: combinedSignal })
      clearTimeout(timeout)

      if (response.ok) {
        return (await response.json()) as T
      }

      if (response.status >= 400 && response.status < 500) {
        throw new ApiError(response.status, `HTTP ${response.status}`)
      }

      lastError = new ApiError(response.status, `HTTP ${response.status}`)
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof ApiError && err.status < 500) throw err
      if (signal?.aborted) throw err
      lastError = err as Error
    }

    if (attempt < maxRetries - 1 && baseDelayMs > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError ?? new Error('Request failed')
}
