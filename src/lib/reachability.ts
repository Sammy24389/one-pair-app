export type RecoveryTarget = {
  id: string
  online: boolean
  busy: boolean
  reconnect: () => Promise<unknown>
}

type Options = {
  targets: () => RecoveryTarget[]
  networkOnline?: () => boolean
  random?: () => number
}

/** Recover missing peer rooms; never tear down a healthy connection or a call. */
export function createReachability({targets, networkOnline = () => navigator.onLine, random = Math.random}: Options) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let running = false
  let requested = false
  let attempt = 0
  const attempts = 6

  const schedule = (delay: number) => {
    clearTimeout(timer)
    if (!disposed) timer = setTimeout(() => { timer = undefined; void recover() }, delay)
  }
  const recover = async () => {
    if (disposed || running || !networkOnline()) return
    const missing = targets().filter(target => !target.online && !target.busy)
    if (!missing.length) return
    running = true
    attempt++
    await Promise.allSettled(missing.map(target => Promise.resolve().then(target.reconnect)))
    running = false
    if (disposed) return
    if (requested) {
      requested = false
      attempt = 0
      schedule(250)
    } else if (attempt < attempts && networkOnline() && targets().some(target => !target.online && !target.busy)) {
      const base = Math.min(120_000, 20_000 * 2 ** (attempt - 1))
      schedule(Math.round(base * (0.75 + random() * 0.5)))
    }
  }
  return {
    wake() {
      if (disposed) return
      attempt = 0
      if (running) requested = true
      else if (networkOnline()) schedule(250)
    },
    offline() {
      clearTimeout(timer)
      timer = undefined
      requested = false
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      timer = undefined
      requested = false
    }
  }
}
