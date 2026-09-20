// Path: src/components/profile/ReviewsSection.jsx
import { Star } from 'lucide-react'
import { formatRatingSummary } from '../../lib/profile.js'

// There is no reviews table/pipeline anywhere in this app yet (see
// api/users/[username].js) — hats.rating is a real column but nothing
// ever writes to it. This renders the honest state either way: a real
// aggregate once one exists, "No reviews yet" until then. Never a
// fabricated star count or placeholder review card.
export default function ReviewsSection({ rating, ratedHatsCount }) {
  const summary = formatRatingSummary(rating, ratedHatsCount)

  return (
    <section aria-labelledby="reviews-heading" className="space-y-2.5">
      <h2 id="reviews-heading" className="text-[15px] font-bold tracking-tight">
        Reviews
      </h2>
      {summary ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[18px] font-bold">
            <Star size={16} className="text-amber-400 fill-amber-400" /> {summary.rating}
          </span>
          <span className="text-[12px] text-black/50 font-medium">
            {summary.count} rated {summary.count === 1 ? 'hat' : 'hats'}
          </span>
        </div>
      ) : (
        <p className="text-[12px] text-black/40 font-medium">No reviews yet</p>
      )}
    </section>
  )
}