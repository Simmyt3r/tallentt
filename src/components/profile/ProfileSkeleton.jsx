// Path: src/components/profile/ProfileSkeleton.jsx
function Block({ className = '' }) {
  return <div className={`animate-pulse rounded-[14px] bg-black/5 ${className}`} />
}

export default function ProfileSkeleton() {
  return (
    <div className="max-w-[720px] mx-auto space-y-6" aria-busy="true" aria-label="Loading profile">
      <div className="rounded-[22px] border-[1.5px] border-black/10 p-5 flex items-center gap-4">
        <Block className="w-20 h-20 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Block className="h-4 w-32" />
          <Block className="h-3 w-40" />
          <Block className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-2">
        <Block className="h-3 w-20" />
        <Block className="h-3 w-full" />
        <Block className="h-3 w-5/6" />
      </div>
      <div className="space-y-2">
        <Block className="h-3 w-16" />
        <div className="flex gap-2">
          <Block className="h-7 w-20 rounded-full" />
          <Block className="h-7 w-24 rounded-full" />
          <Block className="h-7 w-16 rounded-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Block className="h-3 w-20" />
        <div className="grid grid-cols-3 gap-2.5">
          <Block className="aspect-square" />
          <Block className="aspect-square" />
          <Block className="aspect-square" />
        </div>
      </div>
    </div>
  )
}
