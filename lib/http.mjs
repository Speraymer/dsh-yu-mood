export function trustedRequestOrigin(req) {
  const origin = String(req?.headers?.origin || '')
  if (!origin || origin === 'dsh-app://app') return true
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.host === String(req?.headers?.host || '')
  } catch {
    return false
  }
}
