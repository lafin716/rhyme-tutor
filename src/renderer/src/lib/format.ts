/** Korean relative time for "last studied" labels. */
export function relativeTimeKo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '아직 학습 전'
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '—'
  const minutes = Math.round((now - time) / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  const date = new Date(time)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return '좋은 아침이에요.'
  if (hour >= 12 && hour < 18) return '좋은 오후예요.'
  if (hour >= 18 && hour < 23) return '좋은 저녁이에요.'
  return '늦은 시간까지 수고가 많아요.'
}

/**
 * Suggests a course title from the learner's natural-language request, e.g.
 * "Kubernetes를 기초부터 배우고 싶어" -> "Kubernetes를 기초부터". The learner can edit it before creating.
 */
export function deriveCourseTitle(topic: string): string {
  const trimmed = topic.trim().replace(/\s+/g, ' ')
  const cut = trimmed
    .replace(/\s+(?:배우고|알고|공부하고|익히고|학습하고|배우려고|알아보고)(?=\s|$).*$/u, '')
    .replace(/[.?!]+$/u, '')
    .trim()
  const base = cut.length > 0 ? cut : trimmed
  return base.length > 60 ? base.slice(0, 60).trim() : base
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
