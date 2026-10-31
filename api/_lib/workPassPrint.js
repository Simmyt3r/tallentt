// Work Pass printing is a paid, full-time-employment privilege.
// Uses actual accepted employment records and both settled monthly charges.
// A digital Work Pass and its signed QR remain readable even when printing is locked.
import { query } from './db.js'

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const minDate = (a,b) => a < b ? a : b

export function workPassPrintPolicy({agreements=[], periods=[], today}) {
  if (!validDate(today)) return {canPrint:false,dueMonths:0,paidMonths:0,outstandingMonths:0,reason:'Payment status is unavailable.'}
  const states = new Map(periods.map(p => [String(p.agreement_id)+':'+p.month,p]))
  let dueMonths=0,paidMonths=0,invalid=false
  for (const agreement of agreements) {
    const start=String(agreement.start_on||'')
    const end=agreement.status==='ended' ? minDate(String(agreement.ended_on || ''),today) : today
    const day=Number(agreement.due_day)
    if (!validDate(start) || !validDate(end) || !Number.isInteger(day) || day<1 || day>31) {
      invalid=true
      continue
    }
    if (end < start) continue
    const [startYear,startMonth] = start.slice(0,7).split('-').map(Number)
    const [endYear,endMonth] = end.slice(0,7).split('-').map(Number)
    for (let year=startYear,month=startMonth;year<endYear || (year===endYear&&month<=endMonth);) {
      const key=year+'-'+String(month).padStart(2,'0')
      const finalDay=new Date(Date.UTC(year,month,0)).getUTCDate()
      // Employment's due date is the agreed day, clamped to month-end
      // and never before the first day of employment.
      const dueOn=[key+'-'+String(Math.min(day,finalDay)).padStart(2,'0'),start].sort().at(-1)
      if (dueOn<=end && dueOn<=today) {
        dueMonths++
        const row=states.get(String(agreement.id)+':'+key)
        if (row?.status==='confirmed' && row.client_paid===true && row.talent_paid===true) paidMonths++
      }
      month++
      if(month===13){month=1;year++}
    }
  }
  const outstandingMonths=dueMonths-paidMonths
  const canPrint=!invalid && dueMonths>0 && outstandingMonths===0
  const reason=invalid?'Employment dates need review before printing.'
    : !agreements.length?'Printing is available after full-time employment and paid salary tracking.'
      : dueMonths===0?'No full-time salary month is due and verified yet.'
        : outstandingMonths>0?`${outstandingMonths} due salary month${outstandingMonths===1?' needs':'s need'} confirmation and both tracking fees before printing.`
          :'All due salary months have confirmed, fully paid tracking fees.'
  return {canPrint,dueMonths,paidMonths,outstandingMonths,reason}
}

export async function workPassPrintEligibility(userId, q=query) {
  const {rows:tables}=await q(`SELECT to_regclass('employment_agreements') AS agreements,
    to_regclass('employment_salary_periods') AS periods,
    to_regclass('salary_tracking_contributions') AS contributions`)
  if (!tables[0]?.agreements || !tables[0]?.periods || !tables[0]?.contributions)
    return {canPrint:false,dueMonths:0,paidMonths:0,outstandingMonths:0,reason:'Salary tracking must be activated before printing.'}
  const {rows:agreements}=await q(`SELECT id,status,terms->>'start_on' AS start_on,
    terms->>'due_day' AS due_day,ended_on::text AS ended_on
    FROM employment_agreements
    WHERE (employer_id=$1 OR talent_id=$1) AND status IN ('active','ended')`,[userId])
  if (!agreements.length) return workPassPrintPolicy({agreements,periods:[],today:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())})
  const {rows:periods}=await q(`SELECT p.agreement_id,p.month,p.status,
    COALESCE(BOOL_OR(c.side='client' AND c.status='paid'
      AND c.payer_id=a.employer_id AND c.amount>0),FALSE) AS client_paid,
    COALESCE(BOOL_OR(c.side='talent' AND c.status='paid'
      AND c.payer_id=a.talent_id AND c.amount>0),FALSE) AS talent_paid
    FROM employment_salary_periods p JOIN employment_agreements a ON a.id=p.agreement_id
    LEFT JOIN salary_tracking_contributions c ON c.period_id=p.id
    WHERE (a.employer_id=$1 OR a.talent_id=$1) AND a.status IN ('active','ended')
    GROUP BY p.id,p.agreement_id,p.month,p.status`,[userId])
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  return workPassPrintPolicy({agreements,periods,today})
}
