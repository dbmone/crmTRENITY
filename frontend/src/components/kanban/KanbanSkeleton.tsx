const COLUMN_HEIGHTS = [3, 5, 2, 4, 3];

function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      className="rounded-xl border border-bg-border bg-bg-surface p-3 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="skeleton h-3 w-3/4 mb-2.5" />
      <div className="skeleton h-2.5 w-full mb-1.5" />
      <div className="skeleton h-2.5 w-2/3" />
      <div className="flex items-center gap-2 mt-3">
        <div className="skeleton h-5 w-12 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonColumn({ cardCount, colDelay }: { cardCount: number; colDelay: number }) {
  return (
    <div
      className="flex-shrink-0 w-[260px] sm:w-[280px] flex flex-col animate-fade-in"
      style={{ animationDelay: `${colDelay}ms` }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 mb-3">
        <div className="skeleton h-3 w-3 rounded-full" />
        <div className="skeleton h-3.5 w-24" />
        <div className="skeleton h-5 w-6 rounded-full ml-auto" />
      </div>
      {/* Cards */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} delay={colDelay + i * 50} />
        ))}
      </div>
    </div>
  );
}

export default function KanbanSkeleton() {
  return (
    <div className="kanban-board">
      {COLUMN_HEIGHTS.map((count, i) => (
        <SkeletonColumn key={i} cardCount={count} colDelay={i * 60} />
      ))}
    </div>
  );
}
