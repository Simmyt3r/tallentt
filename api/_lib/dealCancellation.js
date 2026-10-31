import {getClient} from './db.js'
import {bookingError,requireBookingId} from './bookingRules.js'
import {notifyUser} from './notifications.js'
import {emitMyDealsEvent} from './myDeals.js'

export async function cancelUnfundedDeal(userId,dealId,reason){
  requireBookingId(dealId)
  const note=String(reason||'').trim()
  if(note.length<5||note.length>500)throw bookingError(400,'Enter a cancellation reason (5–500 characters).')
  const client=await getClient()
  let record
  try{
    await client.query('BEGIN')
    const {rows}=await client.query(`SELECT id,client_id,talent_id,status,contacts_unlocked,
      checkout_locked_at,checkout_reference
      FROM escrows WHERE id=$1 FOR UPDATE`,[dealId])
    record=rows[0]
    if(!record||![record.client_id,record.talent_id].includes(userId))
      throw bookingError(404,'Deal not found.')
    if(record.status!=='not_funded')
      throw bookingError(409,'Funded or closed deals require the dispute and escrow settlement process. No unilateral cancellation is allowed.')
    if(record.checkout_locked_at||record.checkout_reference)
      throw bookingError(409,'Payment processing has started. Check the current payment state before requesting cancellation.')
    const {rows:installed}=await client.query("SELECT to_regclass('deal_cancellation_records') AS relation")
    if(!installed[0]?.relation)
      throw bookingError(503,'Apply the Deal Cancellation Records migration in Admin first.')
    await client.query("UPDATE escrows SET status='cancelled',contacts_unlocked=FALSE,messages_updated_at=NOW() WHERE id=$1",[dealId])
    await client.query(`INSERT INTO deal_cancellation_records(escrow_id,cancelled_by,reason) VALUES($1,$2,$3)`,[dealId,userId,note])
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
  const other=userId===record.client_id?record.talent_id:record.client_id
  await notifyUser({userId:other,type:'booking_cancelled',title:'Booking cancelled before funding',
    body:'The other party cancelled an unfunded booking. Open the deal history for its record.',
    linkUrl:`/deals/${dealId}`,metadata:{escrow_id:dealId}}).catch(()=>{})
  emitMyDealsEvent([record.client_id,record.talent_id],'booking_cancelled')
  return {ok:true,status:'cancelled'}
}
