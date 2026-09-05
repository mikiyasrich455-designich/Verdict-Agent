export function log(method, path, status, duration, extra = '') {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${method} ${path} → ${status} (${duration}ms) ${extra}`)
}

export function error(msg, err) {
  console.error(`[ERROR] ${msg}`, err?.message || err)
}
