// Escrow state takes precedence over legacy work-status defaults.
export function workStatusForDeal(deal) {
  if (deal.status === 'not_funded') return 'awaiting_funding'
  if (deal.status === 'cancelled') return 'cancelled'
  if (deal.status === 'released') return 'completed'
  if (deal.status === 'refunded') return 'refunded'
  return deal.work_status || 'awaiting_start'
}

// Same projection for grouped admin reports; underlying booking rows stay intact.
export const DEAL_WORK_STATUS_SQL = `CASE
  WHEN status = 'not_funded' THEN 'awaiting_funding'
  WHEN status = 'cancelled' THEN 'cancelled'
  WHEN status = 'released' THEN 'completed'
  WHEN status = 'refunded' THEN 'refunded'
  ELSE COALESCE(work_status, 'awaiting_start') END`
