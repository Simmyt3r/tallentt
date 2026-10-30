import {createHash} from 'node:crypto'
import {query,getClient} from './db.js'
import {notifyUserWithQuery} from './notifications.js'
import {dispatchStoredNotifications} from './pushNotifications.js'
import {debitWallet,creditWallet} from './wallet.js'
import {salaryTrackingQuote} from '../../shared/monetization.js'
import {salaryTrackingPrices,fixedSalaryQuote,collectTrackingSide,refundTrackingSides} from './salaryTrackingFees.js'

const fail=(status,message)=>Object.assign(new Error(message),{status})
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const id=value=>{if(!UUID.test(String(value||'')))throw fail(400,'Invalid record.');return value}
const text=(value,max,label,required=true)=>{
  const clean=typeof value==='string'?value.trim():''
  if((required&&!clean)||clean.length>max)throw fail(400,`${label} must contain ${required?'1':'0'}–${max} characters.`)
  return clean
}
export const employmentToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
function date(value,label){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw fail(400,`Choose a valid ${label}.`)
  return value
}
export function employmentTerms(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'Enter the agreement terms.')
  const salary=Number(value.salary),dueDay=Number(value.due_day),noticeDays=Number(value.notice_days)
  if(!Number.isSafeInteger(salary)||salary<1||salary>2_000_000_000)throw fail(400,'Enter a positive monthly salary in whole naira.')
  if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)throw fail(400,'Choose a salary due day from 1 to 31.')
  if(!Number.isInteger(noticeDays)||noticeDays<0||noticeDays>365)throw fail(400,'Choose notice days from 0 to 365.')
  if(!['On-site','Remote','Hybrid'].includes(value.work_mode))throw fail(400,'Choose the work location mode.')
  return {role:text(value.role,120,'Role'),talent:text(value.talent,100,'Talent'),
    start_on:date(value.start_on,'start date'),salary,currency:'NGN',due_day:dueDay,
    notice_days:noticeDays,work_mode:value.work_mode,location:text(value.location,200,'Location',false),
    description:text(value.description,2000,'Responsibilities',false),time_zone:'Africa/Lagos'}
}
export function salaryDueOn(month,day,start){
  const [year,m]=month.split('-').map(Number)
  const last=new Date(Date.UTC(year,m,0)).getUTCDate()
  return [month+'-'+String(Math.min(day,last)).padStart(2,'0'),start].sort().at(-1)
}
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value
const fingerprint=body=>createHash('sha256').update(JSON.stringify(stable(body))).digest('hex')
async function ready(q=query){const {rows}=await q("SELECT to_regclass('employment_agreements') AS present");return Boolean(rows[0]?.present)}
const access=`(a.employer_id=$2 OR (a.talent_id=$2 AND a.status<>'draft' AND a.employer_accepted_at IS NOT NULL))`

export async function employmentGet(userId,params){
  if(!await ready())return params.has('employment_id')?Promise.reject(fail(503,'Employment is not available yet.')):{threads:[],available:false}
  const agreementId=params.get('employment_id')
  if(!agreementId){
    const {rows}=await query(`SELECT a.id,a.status,a.updated_at,a.created_at,a.terms->>'role' AS hat_title,
      u.full_name AS peer_name,u.username AS peer_username,u.avatar_url AS peer_avatar,
      (SELECT body FROM employment_messages WHERE agreement_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_message,
      a.updated_at AS last_at,
      (SELECT COUNT(*)::int FROM employment_messages WHERE agreement_id=a.id AND sender_id<>$1 AND read_at IS NULL) AS unread_count
      FROM employment_agreements a JOIN users u ON u.id=CASE WHEN a.employer_id=$1 THEN a.talent_id ELSE a.employer_id END
      WHERE a.employer_id=$1 OR (a.talent_id=$1 AND a.status<>'draft' AND a.employer_accepted_at IS NOT NULL) ORDER BY a.updated_at DESC LIMIT 100`,[userId])
    return {threads:rows,available:true}
  }
  id(agreementId)
  const {rows}=await query(`SELECT a.*,e.full_name AS employer_name,e.username AS employer_username,
    t.full_name AS talent_name,t.username AS talent_username FROM employment_agreements a
    JOIN users e ON e.id=a.employer_id JOIN users t ON t.id=a.talent_id WHERE a.id=$1 AND ${access}`,[agreementId,userId])
  if(!rows.length)throw fail(404,'Agreement not found.')
  const {rows:periods}=await query('SELECT *,due_on::text,paid_on::text,received_on::text FROM employment_salary_periods WHERE agreement_id=$1 ORDER BY month DESC',[agreementId])
  const trackingPrices=await salaryTrackingPrices()
  if(trackingPrices){
    const {rows:paid}=await query(`SELECT period_id,side,status,amount
      FROM salary_tracking_contributions
      WHERE period_id=ANY($1::uuid[])`,[periods.map(p=>p.id)])
    for(const period of periods){
      const contributions=paid.filter(p=>p.period_id===period.id)
      period.trackingFees={
        clientPaid:contributions.some(p=>p.side==='client'&&p.status==='paid'),
        talentPaid:contributions.some(p=>p.side==='talent'&&p.status==='paid'),
        monthlyFee:contributions.find(p=>p.side==='client')?.amount??null,
        workPassEligible:period.status==='confirmed'&&
          contributions.some(p=>p.side==='client'&&p.status==='paid')&&
          contributions.some(p=>p.side==='talent'&&p.status==='paid'),
      }
    }
  }
  const {rows:messages}=await query(`SELECT m.*,r.body AS reply_body FROM employment_messages m
    LEFT JOIN employment_messages r ON r.id=m.reply_to_id AND r.agreement_id=m.agreement_id
    WHERE m.agreement_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,[agreementId])
  const {rows:events}=await query('SELECT id,actor_id,action,metadata,created_at FROM employment_events WHERE agreement_id=$1 ORDER BY id DESC LIMIT 100',[agreementId])
  return {agreement:rows[0],periods,messages:messages.reverse(),events,today:employmentToday(),trackingPrices}
}

async function assertNotBlocked(client,a){
  const {rows:tables}=await client.query("SELECT to_regclass('associate_links') AS associates,to_regclass('community_threads') AS chats")
  if(tables[0].associates){
    const {rows}=await client.query(`SELECT 1 FROM associate_links WHERE member_low=LEAST($1::uuid,$2::uuid)
      AND member_high=GREATEST($1::uuid,$2::uuid) AND status='blocked'`,[a.employer_id,a.talent_id])
    if(rows.length)throw fail(403,'This connection is blocked.')
  }
  if(tables[0].chats){
    const {rows}=await client.query(`SELECT 1 FROM community_threads WHERE status='blocked' AND
      ((initiator_id=$1 AND recipient_id=$2) OR (initiator_id=$2 AND recipient_id=$1))`,[a.employer_id,a.talent_id])
    if(rows.length)throw fail(403,'This connection is blocked.')
  }
}

export async function employmentAction(userId,body){
  const allowed=['employment_create','employment_revise','employment_send','employment_accept','employment_decline','employment_withdraw','employment_end','employment_report','employment_confirm','employment_dispute','employment_pay_tracking','employment_message','employment_read','employment_visibility']
  if(!allowed.includes(body.action))throw fail(400,'Unknown employment action.')
  if(!await ready())throw fail(503,'Employment is not available yet.')
  const command=body.action==='employment_read'?null:id(body.command_id),hash=fingerprint(body)
  const client=await getClient(),notifications=[]
  let result
  try{
    await client.query('BEGIN')
    // One command at a time per actor; agreement locks serialize opposing parties.
    const {rows:actors}=await client.query('SELECT id,role FROM users WHERE id=$1 FOR NO KEY UPDATE',[userId])
    if(!actors.length)throw fail(401,'Account not found.')
    if(command){
      const {rows}=await client.query('SELECT request_hash,result FROM employment_commands WHERE actor_id=$1 AND command_id=$2',[userId,command])
      if(rows.length){
        if(rows[0].request_hash!==hash)throw fail(409,'This request was already used for a different change.')
        await client.query('COMMIT');return rows[0].result
      }
    }
    let a,summary='',metadata={},periodId=null
    if(body.action==='employment_create'){
      if(!['client','dual'].includes(actors[0].role))throw fail(403,'A Client Card account is required to hire.')
      const talentId=id(body.talent_id)
      if(talentId===userId)throw fail(400,'Choose another talent.')
      const {rows:talents}=await client.query("SELECT id FROM users WHERE id=$1 AND role IN ('talent','dual')",[talentId])
      if(!talents.length)throw fail(404,'Talent not found.')
      const terms=employmentTerms(body.terms)
      const {rows:hats}=await client.query("SELECT 1 FROM hats WHERE user_id=$1 AND category=$2 AND role='talent' AND active=TRUE LIMIT 1",[talentId,terms.talent])
      if(!hats.length)throw fail(400,'Choose one of this person’s active talents.')
      await assertNotBlocked(client,{employer_id:userId,talent_id:talentId})
      const {rows:count}=await client.query("SELECT COUNT(*)::int AS n FROM employment_agreements WHERE employer_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[userId])
      if(count[0].n>=8)throw fail(429,'You have created several agreements today. Try again tomorrow.')
      const {rows}=await client.query('INSERT INTO employment_agreements(employer_id,talent_id,terms) VALUES($1,$2,$3::jsonb) RETURNING *',[userId,talentId,JSON.stringify(terms)])
      a=rows[0];summary='Draft agreement created.';metadata={terms,version:a.version}
    }else{
      const {rows}=await client.query(`SELECT a.* FROM employment_agreements a WHERE a.id=$1 AND ${access} FOR UPDATE`,[id(body.agreement_id),userId])
      a=rows[0];if(!a)throw fail(404,'Agreement not found.')
      const employer=a.employer_id===userId
      const requireEmployer=()=>{if(!employer)throw fail(403,'Only the employer can do this.')}
      const requireTalent=()=>{if(employer)throw fail(403,'Only the named talent can do this.')}
      const expectVersion=()=>{if(body.expected_version!==a.version)throw fail(409,'The agreement changed. Refresh and review the latest terms.')}
      if(['employment_revise','employment_send','employment_accept','employment_decline','employment_withdraw','employment_end'].includes(body.action))expectVersion()
      switch(body.action){
        case 'employment_revise':{
          requireEmployer()
          if(!['draft','pending'].includes(a.status))throw fail(409,'Accepted or closed terms cannot be edited. Create a new agreement.')
          const terms=employmentTerms(body.terms)
          if(terms.talent!==a.terms.talent)throw fail(400,'Create a new agreement to change the talent category.')
          await client.query("UPDATE employment_agreements SET terms=$2::jsonb,status='draft',version=version+1,employer_accepted_at=NULL WHERE id=$1",[a.id,JSON.stringify(terms)])
          summary='Terms revised; awaiting a new invitation.';metadata={terms,version:a.version+1};break
        }
        case 'employment_send':{
          requireEmployer();if(a.status!=='draft')throw fail(409,'Only a draft can be sent.')
          await assertNotBlocked(client,a)
          await client.query("UPDATE employment_agreements SET status='pending',employer_accepted_at=NOW() WHERE id=$1",[a.id])
          summary='Employer accepted these terms and invited the talent to review.';metadata={terms:a.terms,version:a.version};break
        }
        case 'employment_accept':{
          requireTalent();if(a.status!=='pending')throw fail(409,'Only a pending invitation can be accepted.')
          await assertNotBlocked(client,a)
          if(typeof body.publish_status!=='boolean')throw fail(400,'Choose whether to show your employment status publicly.')
          await client.query("UPDATE employment_agreements SET status='active',talent_accepted_at=NOW(),accepted_version=version,publish_status=$2 WHERE id=$1",[a.id,body.publish_status])
          summary='Talent accepted the agreement. Employment recorded.';metadata={terms:a.terms,version:a.version};break
        }
        case 'employment_decline':case 'employment_withdraw':{
          if(body.action==='employment_decline'){requireTalent();if(a.status!=='pending')throw fail(409,'This invitation is no longer pending.')}
          else {requireEmployer();if(!['draft','pending'].includes(a.status))throw fail(409,'Only an unaccepted agreement can be withdrawn.')}
          const status=body.action==='employment_decline'?'declined':'withdrawn'
          await client.query('UPDATE employment_agreements SET status=$2 WHERE id=$1',[a.id,status])
          summary=`Agreement ${status}.`;break
        }
        case 'employment_end':{
          if(a.status!=='active')throw fail(409,'This employment is not active.')
          const note=text(body.note,1000,'Reason for ending')
          await client.query("UPDATE employment_agreements SET status='ended',ended_on=$2::date WHERE id=$1",[a.id,employmentToday()])
          summary='Employment ended. Outstanding salary records remain available.';metadata={note,ended_on:employmentToday()};break
        }
        case 'employment_visibility':{
          requireTalent();if(!['active','ended'].includes(a.status)||typeof body.publish_status!=='boolean')throw fail(400,'Choose visibility for an accepted agreement.')
          await client.query('UPDATE employment_agreements SET publish_status=$2 WHERE id=$1',[a.id,body.publish_status])
          summary='Talent updated public employment visibility.';break
        }
        case 'employment_report':{
          requireEmployer();if(!['active','ended'].includes(a.status))throw fail(409,'Accept the agreement before reporting salary.')
          const month=String(body.month||''),today=employmentToday()
          if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month<a.terms.start_on.slice(0,7)||month>today.slice(0,7)||(a.ended_on&&month>new Date(a.ended_on).toISOString().slice(0,7)))throw fail(400,'Choose a month within this employment and not in the future.')
          const paidOn=date(body.paid_on,'payment date')
          if(paidOn>today||paidOn<a.terms.start_on)throw fail(400,'Payment date must be between the employment start and today.')
          if(!['bank_transfer','cash','escrow'].includes(body.method))throw fail(400,'Choose a payment method.')
          const note=text(body.note,1000,'Payment note',false)
          const {rows:previous}=await client.query('SELECT * FROM employment_salary_periods WHERE agreement_id=$1 AND month=$2 FOR UPDATE',[a.id,month])
          const prev=previous[0]
          if(prev&&(prev.status==='confirmed'||prev.status==='reported'))throw fail(409,'This month is already reported. Wait for the talent’s response.')
          if(prev&&body.expected_revision!==prev.revision)throw fail(409,'The salary record changed. Refresh first.')
          let escrow=null
          if(body.method==='escrow'){
            escrow=id(body.escrow_id)
            const {rows}=await client.query("SELECT amount,released_at FROM escrows WHERE id=$1 AND client_id=$2 AND talent_id=$3 AND status='released' FOR SHARE",[escrow,a.employer_id,a.talent_id])
            if(!rows.length||Number(rows[0].amount)<a.terms.salary||!rows[0].released_at)throw fail(400,'Link a completed escrow between these parties covering the agreed monthly salary.')
            const released=employmentToday(new Date(rows[0].released_at))
            if(paidOn!==released)throw fail(400,'Use the escrow release date as the payment date.')
            const {rows:used}=await client.query('SELECT id FROM employment_salary_periods WHERE escrow_id=$1 AND id<>COALESCE($2::uuid,gen_random_uuid())',[escrow,prev?.id||null])
            if(used.length)throw fail(409,'That escrow is already linked to a salary period.')
          }
          const due=salaryDueOn(month,a.terms.due_day,a.terms.start_on)
          const {rows}=await client.query(`INSERT INTO employment_salary_periods(agreement_id,month,due_on,paid_on,method,escrow_id,note)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(agreement_id,month) DO UPDATE
            SET paid_on=EXCLUDED.paid_on,method=EXCLUDED.method,escrow_id=EXCLUDED.escrow_id,note=EXCLUDED.note,
              status='reported',revision=employment_salary_periods.revision+1,reported_at=NOW()
            RETURNING id,revision`,[a.id,month,due,paidOn,body.method,escrow,note])
          periodId=rows[0].id
          // Commission is charged for successful tracking services, not
          // for the act of moving money outside ChombuTar. Fee disclosure
          // must be acknowledged on the exact server-calculated amount.
          const trackingPrices=await salaryTrackingPrices(client.query.bind(client))
          let trackingFee=0
          if(trackingPrices){
            const quote=fixedSalaryQuote(trackingPrices,body.method)
            if(body.accept_tracking_fee!==true||Number(body.expected_tracking_fee)!==quote.eachParty)
              throw fail(409,'Review and accept the monthly tracking fee for each participant.')
            const paid=await collectTrackingSide(client,{
              periodId,side:'client',payerId:a.employer_id,fee:quote.eachParty,
            })
            trackingFee=paid.fee
          }else{
            // Compatibility only until the new Admin migration is applied.
            const {rows:billingTable}=await client.query("SELECT to_regclass('billing_charge_events') AS registered")
            if(billingTable[0]?.registered){
              const quote=salaryTrackingQuote(Number(a.terms.salary),body.method)
              if(body.accept_tracking_fee!==true||Number(body.expected_tracking_fee)!==quote.trackingFee)
                throw fail(409,'Review and accept the disclosed tracking fee before reporting.')
              const {rows:existing}=await client.query(`SELECT id,status FROM billing_charge_events
                WHERE kind='salary_tracking' AND source_id=$1 FOR UPDATE`,[periodId])
              if(existing[0]?.status==='charged')throw fail(409,'Tracking fee already paid for this month.')
              const reference=`salary:${periodId}:${rows[0].revision}`
              await debitWallet(client,{userId:a.employer_id,amount:quote.trackingFee,type:'billing_charge',reference})
              if(existing.length)await client.query(`UPDATE billing_charge_events SET amount=$2,reference=$3,
                status='charged',refunded_at=NULL,created_at=NOW() WHERE id=$1`,
                [existing[0].id,quote.trackingFee,reference])
              else await client.query(`INSERT INTO billing_charge_events(user_id,kind,source_id,amount,reference)
                VALUES($1,'salary_tracking',$2,$3,$4)`,
                [a.employer_id,periodId,quote.trackingFee,reference])
              trackingFee=quote.trackingFee
            }
          }
          summary=`Employer reports ${month} salary paid. Talent confirmation needed.`
          metadata={period_id:periodId,month,paid_on:paidOn,method:body.method,escrow_id:escrow,note,revision:rows[0].revision,tracking_fee:trackingFee};break
        }
        case 'employment_pay_tracking':{
          requireTalent()
          const {rows:periods}=await client.query(`SELECT * FROM employment_salary_periods
            WHERE id=$1 AND agreement_id=$2 FOR UPDATE`,[id(body.period_id),a.id])
          const period=periods[0]
          if(!period||period.status!=='confirmed')throw fail(409,'Confirm receipt of this salary month before paying for Work Pass evidence.')
          const trackingPrices=await salaryTrackingPrices(client.query.bind(client))
          if(!trackingPrices)throw fail(503,'Apply the Dual-role Billing migration in Admin.')
          const {rows:clientContributions}=await client.query(`SELECT amount,status FROM salary_tracking_contributions
            WHERE period_id=$1 AND side='client' FOR SHARE`,[period.id])
          const clientFee=clientContributions[0]
          if(!clientFee||clientFee.status!=='paid')throw fail(409,'Client must pay their monthly tracking fee first.')
          if(body.accept_tracking_fee!==true||Number(body.expected_tracking_fee)!==clientFee.amount)
            throw fail(409,'Review and accept your fixed monthly tracking fee.')
          const receipt=await collectTrackingSide(client,{
            periodId:period.id,side:'talent',payerId:a.talent_id,fee:clientFee.amount,
          })
          periodId=period.id
          summary=`Talent paid the ${period.month} salary tracking fee. Two-sided proof may now appear on Work Pass.`
          metadata={period_id:period.id,amount:receipt.fee,side:'talent'};break
        }
        case 'employment_confirm':case 'employment_dispute':{
          requireTalent()
          const {rows}=await client.query('SELECT *,paid_on::text FROM employment_salary_periods WHERE id=$1 AND agreement_id=$2 FOR UPDATE',[id(body.period_id),a.id])
          const period=rows[0]
          if(!period)throw fail(404,'Salary record not found.')
          if(period.status!=='reported'||body.expected_revision!==period.revision)throw fail(409,'The salary record changed. Review the latest report.')
          periodId=period.id
          if(body.action==='employment_confirm'){
            const received=date(body.received_on,'receipt date')
            if(received<period.paid_on||received>employmentToday())throw fail(400,'Receipt date must be between the reported payment date and today.')
            await client.query("UPDATE employment_salary_periods SET status='confirmed',confirmed_at=NOW(),received_on=$2,revision=revision+1 WHERE id=$1",[period.id,received])
            summary=`Talent confirmed receipt of ${period.month} salary.`;metadata={period_id:period.id,received_on:received,revision:period.revision+1}
          }else{
            const note=text(body.note,1000,'Non-receipt explanation')
            await client.query("UPDATE employment_salary_periods SET status='disputed',note=$2,revision=revision+1 WHERE id=$1",[period.id,note])
            // If either participant has paid, return both tracking fees
            // before marking this period ineligible for Work Pass evidence.
            const prices=await salaryTrackingPrices(client.query.bind(client))
            if(prices)await refundTrackingSides(client,period.id)
            else{
              const {rows:feeStorage}=await client.query("SELECT to_regclass('billing_charge_events') AS registered")
              const {rows:charges}=feeStorage[0]?.registered
                ? await client.query(`SELECT * FROM billing_charge_events WHERE kind='salary_tracking'
                    AND source_id=$1 AND status='charged' FOR UPDATE`,[period.id]):{rows:[]}
              if(charges.length){
                await creditWallet(client,{userId:a.employer_id,amount:charges[0].amount,
                  type:'billing_refund',reference:'refund:'+charges[0].reference})
                await client.query(`UPDATE billing_charge_events SET status='refunded',refunded_at=NOW()
                  WHERE id=$1`,[charges[0].id])
              }
            }
            summary=`Talent reports ${period.month} salary not received in full.`;metadata={period_id:period.id,note,revision:period.revision+1}
          }
          break
        }
        case 'employment_message':{
          if(!['pending','active','ended'].includes(a.status))throw fail(403,'Messaging is available for invited or accepted agreements.')
          await assertNotBlocked(client,a)
          const {rows:count}=await client.query("SELECT COUNT(*)::int AS n FROM employment_messages WHERE sender_id=$1 AND kind='message' AND created_at>NOW()-INTERVAL '1 hour'",[userId])
          if(count[0].n>=60)throw fail(429,'Message rate limit reached.')
          summary=text(body.text,2000,'Message')
          if(body.reply_to_id){const {rows}=await client.query("SELECT 1 FROM employment_messages WHERE id=$1 AND agreement_id=$2 AND kind='message'",[id(body.reply_to_id),a.id]);if(!rows.length)throw fail(400,'Reply must refer to a message in this agreement.')}
          break
        }
        case 'employment_read':{
          const {rows}=await client.query('SELECT id FROM employment_messages WHERE id=$1 AND agreement_id=$2',[id(body.through_id),a.id])
          if(!rows.length)throw fail(400,'Message does not belong to this agreement.')
          await client.query(`UPDATE employment_messages SET read_at=COALESCE(read_at,NOW()) WHERE agreement_id=$1 AND sender_id<>$2
            AND (created_at,id)<=(SELECT created_at,id FROM employment_messages WHERE id=$3 AND agreement_id=$1)`,[a.id,userId,body.through_id]);break
        }
      }
    }
    result={agreement_id:a.id,...(periodId?{period_id:periodId}:{})}
    if(body.action!=='employment_read'){
      await client.query('INSERT INTO employment_events(agreement_id,actor_id,action,metadata) VALUES($1,$2,$3,$4::jsonb)',[a.id,userId,body.action,JSON.stringify(metadata)])
      await client.query('UPDATE employment_agreements SET updated_at=NOW() WHERE id=$1',[a.id])
      // Draft edits are private to the employer. Persist notification and message in
      // the same transaction, then release the connection before push dispatch.
      if(!['employment_create','employment_revise'].includes(body.action)&&!(body.action==='employment_withdraw'&&a.status==='draft')){
        await client.query('INSERT INTO employment_messages(agreement_id,sender_id,kind,body,reply_to_id) VALUES($1,$2,$3,$4,$5)',[a.id,userId,body.action==='employment_message'?'message':'event',summary,body.action==='employment_message'?body.reply_to_id||null:null])
        const notification=await notifyUserWithQuery(client.query.bind(client),{userId:userId===a.employer_id?a.talent_id:a.employer_id,type:body.action.startsWith('employment_report')||['employment_confirm','employment_dispute'].includes(body.action)?'salary_update':'employment_update',title:'Employment update',body:'Open your private employment conversation to review an update.',linkUrl:'/inbox?employment='+a.id,metadata:{agreement_id:a.id}})
        if(notification)notifications.push(notification)
      }
      await client.query('INSERT INTO employment_commands(actor_id,command_id,request_hash,result) VALUES($1,$2,$3,$4::jsonb)',[userId,command,hash,JSON.stringify(result)])
    }
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK').catch(()=>{});if(error.code==='23505')throw fail(409,'This payment or request is already recorded. Refresh to review it.');throw error}
  finally{client.release()}
  await dispatchStoredNotifications(notifications).catch(()=>{})
  return result
}

export async function publicEmploymentSummary(userId){
  if(!await ready())return null
  const today=employmentToday()
  const {rows}=await query(`SELECT
    EXISTS(SELECT 1 FROM employment_agreements WHERE talent_id=$1 AND publish_status=TRUE AND status='active' AND terms->>'start_on'<=$2) AS employed,
    (SELECT COUNT(*)::int FROM employment_salary_periods p JOIN employment_agreements a ON a.id=p.agreement_id WHERE a.talent_id=$1 AND a.publish_status=TRUE AND p.status='confirmed') AS confirmed_months
    `,[userId,today])
  return rows[0]
}
