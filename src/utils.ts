export type FFmpeguTimeObject = {
  hours?: number
  minutes?: number
  seconds?: number
  milliseconds?: number
}

const MS_IN_SECOND = 1_000
const MS_IN_MINUTE = 60 * MS_IN_SECOND
const MS_IN_HOUR = 60 * MS_IN_MINUTE

export const isTimeObject = (value: unknown): value is FFmpeguTimeObject =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  ["hours", "minutes", "seconds", "milliseconds"].some(
    (key) =>
      key in value && typeof value[key as keyof typeof value] === "number"
  )

type ResolvedTimeOptions<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? Exclude<T[P], FFmpeguTimeObject> : T[P]
}

export const formatTime = (t: FFmpeguTimeObject): string => {
  const totalMilliseconds = Math.trunc(
    (t.hours ?? 0) * MS_IN_HOUR +
      (t.minutes ?? 0) * MS_IN_MINUTE +
      (t.seconds ?? 0) * MS_IN_SECOND +
      (t.milliseconds ?? 0)
  )
  const sign = totalMilliseconds < 0 ? "-" : ""
  const absoluteMilliseconds = Math.abs(totalMilliseconds)
  const h = Math.floor(absoluteMilliseconds / MS_IN_HOUR)
  const m = Math.floor((absoluteMilliseconds % MS_IN_HOUR) / MS_IN_MINUTE)
  const s = Math.floor((absoluteMilliseconds % MS_IN_MINUTE) / MS_IN_SECOND)
  const ms = absoluteMilliseconds % MS_IN_SECOND
  const pad2 = (n: number) => String(n).padStart(2, "0")
  const pad3 = (n: number) => String(n).padStart(3, "0")
  return `${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`
}

export const resolveTimeOptions = <
  T extends Record<string, unknown>,
  K extends keyof T
>(
  options: T,
  keys: K[]
): ResolvedTimeOptions<T, K> => {
  const resolved = { ...options } as ResolvedTimeOptions<T, K>

  for (const key of keys) {
    const value = resolved[key]

    if (isTimeObject(value)) {
      resolved[key] = formatTime(value) as ResolvedTimeOptions<T, K>[K]
    }
  }

  return resolved
}

export const formatBitrate = (value: string | number, unit?: string) =>
  typeof unit === "undefined" ? value : `${value}${unit}`
