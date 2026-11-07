// Pure accounting projection over source-linked platform fee streams.
// Customer escrow, wallet balances and sponsor-to-Talent principal are NOT inputs.
export function summarizeRecordedIncome(streams){
  const recorded=streams.filter(item=>item.recorded&&item.inflow!==null&&item.inflow!==undefined)
  const total=rows=>rows.reduce((sum,row)=>sum+BigInt(row.inflow),0n).toString()
  const earned=recorded.filter(item=>item.recognition==='earned')
  const awaiting=recorded.filter(item=>item.recognition!=='earned')
  return {
    recorded_fee_charges:recorded.length?total(recorded):null,
    earned_revenue:earned.length?total(earned):null,
    pending_recognition:awaiting.length?total(awaiting):null,
    recorded_categories:recorded.length,
    unavailable_categories:streams.filter(item=>!item.recorded).map(item=>item.id),
    partial:true,
    basis:'Source-linked platform charges; not bank settlement, cash balance or net profit.',
  }
}
