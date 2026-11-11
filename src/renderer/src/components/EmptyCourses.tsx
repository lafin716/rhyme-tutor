import { Button } from './ui'

/** Empty-state illustration: an open book with a speech bubble. Pure SVG, no external assets. */
export function EmptyCourses({ onCreate }: { onCreate: () => void }) {
  return (
    <div data-testid="empty-courses" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <svg width="200" height="150" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
        <ellipse cx="100" cy="134" rx="78" ry="8" className="fill-line" />
        <path d="M30 42 Q66 30 100 44 Q134 30 170 42 L170 118 Q134 106 100 120 Q66 106 30 118 Z" className="fill-surface stroke-accent" strokeWidth="3" strokeLinejoin="round" />
        <path d="M100 44 L100 120" className="stroke-accent" strokeWidth="2" />
        <path d="M46 62 Q68 56 88 64 M46 76 Q68 70 88 78 M46 90 Q68 84 88 92" className="stroke-ink-3" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M112 64 Q130 56 150 64 M112 78 Q130 70 150 78" className="stroke-ink-3" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <g>
          <rect x="128" y="8" width="52" height="30" rx="10" className="fill-accent-soft stroke-accent" strokeWidth="2" />
          <path d="M138 38 L134 46 L146 38 Z" className="fill-accent-soft stroke-accent" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="144" cy="23" r="3" className="fill-accent" />
          <circle cx="154" cy="23" r="3" className="fill-accent" />
          <circle cx="164" cy="23" r="3" className="fill-accent" />
        </g>
        <path d="M22 26 l4 -8 l4 8 l-4 8 z" className="fill-accent" />
      </svg>
      <h2 className="text-lg font-semibold text-ink">아직 수업이 없어요</h2>
      <p className="max-w-md text-sm text-ink-2">
        배우고 싶은 주제를 말해 주세요. 선생님이 맞춤 커리큘럼을 만들어 드릴게요.
      </p>
      <Button variant="secondary" onClick={onCreate} data-testid="empty-create">
        새 학습 시작
      </Button>
    </div>
  )
}
