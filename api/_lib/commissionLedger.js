import {query,getClient} from './db.js'

const COMMISSION_READY_SQL=`SELECT
    to_regclass('gig_fee_events') IS NOT NULL AND to_regclass('gig_commission_adjustments') IS NOT NULL
    AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=current_schema()
      AND ((table_name='escrows' AND column_name IN ('gig_fee_bps','gig_fee_sealed'))
        OR (table_name IN ('gig_fee_events','gig_commission_adjustments')
          AND column_name IN ('source_transaction_id','reconciled_at'))))=6
    AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('gig_fee_events')
      AND conname='gig_fee_events_stage_check' AND pg_get_constraintdef(oid) LIKE '%sealed%') AS ready`

// Install only commission storage. Run before obtaining a booking row lock so
// schema locks cannot deadlock an in-flight settlement. Failure stops checkout.
export async function ensureCommissionLedger(){
  const {rows}=await query(COMMISSION_READY_SQL)
  if(rows[0]?.ready)return
  const client=await getClient()
  try{
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(176483,5)')
    // Another request may have installed it while this request waited. Avoid
    // repeating DDL once a concurrent payment can already hold booking locks.
    if((await client.query(COMMISSION_READY_SQL)).rows[0]?.ready){
      await client.query('COMMIT')
      return
    }
    await client.query(`ALTER TABLE escrows ADD COLUMN IF NOT EXISTS gig_fee_bps INTEGER
      CHECK(gig_fee_bps IS NULL OR gig_fee_bps BETWEEN 0 AND 10000);
      ALTER TABLE escrows ADD COLUMN IF NOT EXISTS gig_fee_sealed BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE TABLE IF NOT EXISTS gig_fee_events(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        escrow_id UUID NOT NULL REFERENCES escrows(id) ON DELETE RESTRICT,
        stage TEXT NOT NULL,
        gross_released INTEGER NOT NULL CHECK(gross_released>0),
        fee_amount INTEGER NOT NULL CHECK(fee_amount>=0 AND fee_amount<=gross_released),
        rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(escrow_id,stage));
      ALTER TABLE gig_fee_events DROP CONSTRAINT IF EXISTS gig_fee_events_stage_check;
      ALTER TABLE gig_fee_events ADD CONSTRAINT gig_fee_events_stage_check
        CHECK(stage IN ('sealed','start','completion','dispute_release'));
      CREATE INDEX IF NOT EXISTS idx_gig_fees_recent ON gig_fee_events(created_at DESC);
      CREATE TABLE IF NOT EXISTS gig_commission_adjustments(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        escrow_id UUID NOT NULL UNIQUE REFERENCES escrows(id) ON DELETE RESTRICT,
        refunded_gross INTEGER NOT NULL CHECK(refunded_gross>=0),
        commission_reversed INTEGER NOT NULL CHECK(commission_reversed>=0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      ALTER TABLE gig_fee_events ADD COLUMN IF NOT EXISTS source_transaction_id UUID;
      ALTER TABLE gig_fee_events ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
      ALTER TABLE gig_commission_adjustments ADD COLUMN IF NOT EXISTS source_transaction_id UUID;
      ALTER TABLE gig_commission_adjustments ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;`)
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

// Never debit a wallet or introduce fee terms on an old agreement. Recover a
// receipt only when stored fee terms AND a successful wallet transaction agree.
// Unknown/ambiguous historical payments remain unrecognized for Admin review.
export async function reconcileCommissionLedger(adminId){
  await ensureCommissionLedger()
  const client=await getClient()
  const evidence=`WITH evidence AS (
    SELECT escrow_id,user_id,type,COUNT(*) AS n,SUM(amount::bigint) AS amount,
      (array_agg(id ORDER BY created_at,id))[1] AS transaction_id,MIN(created_at) AS recorded_at
    FROM wallet_transactions WHERE status='success'
      AND type IN ('escrow_fund','escrow_start','escrow_release','refund')
    GROUP BY escrow_id,user_id,type
  )`
  const fullFee='((e.amount::bigint*e.gig_fee_bps+5000)/10000)'
  const startFee='((e.start_released_amount::bigint*e.gig_fee_bps+5000)/10000)'
  try{
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(176483,6)')
    // Serialize with payment/refund operations before taking a ledger snapshot.
    await client.query(`SELECT id FROM escrows WHERE gig_fee_bps>0
      AND status IN ('secured','released','refunded') ORDER BY id FOR UPDATE`)
    const sealed=await client.query(`${evidence}
      INSERT INTO gig_fee_events(escrow_id,stage,gross_released,fee_amount,rate_bps,created_at,source_transaction_id,reconciled_at)
      SELECT e.id,'sealed',e.amount,${fullFee}::int,e.gig_fee_bps,w.recorded_at,w.transaction_id,NOW()
      FROM escrows e JOIN evidence w ON w.escrow_id=e.id AND w.user_id=e.client_id AND w.type='escrow_fund'
      WHERE e.gig_fee_sealed=TRUE AND e.gig_fee_bps>0 AND ${fullFee}>0
        AND e.status IN ('secured','released','refunded') AND COALESCE(e.currency,'NGN')='NGN'
        AND w.n=1 AND w.amount=e.amount
        AND (e.start_released_amount=0 OR EXISTS(SELECT 1 FROM evidence p
          WHERE p.escrow_id=e.id AND p.user_id=e.talent_id AND p.type='escrow_start'
            AND p.n=1 AND p.amount=e.start_released_amount-${startFee}))
        AND (e.status<>'released' OR EXISTS(SELECT 1 FROM evidence p
          WHERE p.escrow_id=e.id AND p.user_id=e.talent_id AND p.type='escrow_release'
            AND p.n=1 AND p.amount=e.amount-e.start_released_amount-(${fullFee}-${startFee})))
        AND (e.status<>'refunded' OR EXISTS(SELECT 1 FROM evidence p
          WHERE p.escrow_id=e.id AND p.user_id=e.client_id AND p.type='refund'
            AND p.n=1 AND p.amount=e.amount-e.start_released_amount))
        AND NOT EXISTS(SELECT 1 FROM evidence p WHERE p.escrow_id=e.id AND p.user_id=e.talent_id
          AND ((p.type='escrow_start' AND (p.n<>1 OR p.amount<>e.start_released_amount-${startFee}))
            OR (p.type='escrow_release' AND (p.n<>1 OR p.amount<>e.amount-e.start_released_amount-(${fullFee}-${startFee})))))
        AND NOT EXISTS(SELECT 1 FROM gig_fee_events f WHERE f.escrow_id=e.id)
      ON CONFLICT(escrow_id,stage) DO NOTHING RETURNING id`)
    const releases=await client.query(`${evidence}, releases AS (
      SELECT e.*,w.transaction_id,w.recorded_at,w.amount AS paid_amount,w.n,
        CASE WHEN w.type='escrow_start' THEN 'start'
          WHEN EXISTS(SELECT 1 FROM booking_disputes d WHERE d.escrow_id=e.id AND d.status='released')
            THEN 'dispute_release' ELSE 'completion' END AS fee_stage,
        CASE WHEN w.type='escrow_start' THEN e.start_released_amount
          ELSE e.amount-e.start_released_amount END AS gross,
        CASE WHEN w.type='escrow_start' THEN ${startFee}
          ELSE ${fullFee}-${startFee} END AS fee
      FROM escrows e JOIN evidence w ON w.escrow_id=e.id AND w.user_id=e.talent_id
        AND w.type IN ('escrow_start','escrow_release')
      WHERE e.gig_fee_sealed=FALSE AND e.gig_fee_bps>0
        AND e.status IN ('secured','released','refunded') AND COALESCE(e.currency,'NGN')='NGN'
    ) INSERT INTO gig_fee_events(escrow_id,stage,gross_released,fee_amount,rate_bps,created_at,source_transaction_id,reconciled_at)
      SELECT r.id,r.fee_stage,r.gross,r.fee::int,r.gig_fee_bps,r.recorded_at,r.transaction_id,NOW()
      FROM releases r WHERE r.n=1 AND r.gross>0 AND r.fee>0 AND r.paid_amount=r.gross-r.fee
        AND NOT EXISTS(SELECT 1 FROM gig_fee_events f WHERE f.escrow_id=r.id
          AND (f.stage='sealed' OR (r.fee_stage='start' AND f.stage='start')
            OR (r.fee_stage<>'start' AND f.stage IN ('completion','dispute_release'))))
      ON CONFLICT(escrow_id,stage) DO NOTHING RETURNING id`)
    const refunds=await client.query(`${evidence}
      INSERT INTO gig_commission_adjustments(escrow_id,refunded_gross,commission_reversed,created_at,source_transaction_id,reconciled_at)
      SELECT e.id,(e.amount-e.start_released_amount),(${fullFee}-${startFee})::int,w.recorded_at,w.transaction_id,NOW()
      FROM escrows e JOIN evidence w ON w.escrow_id=e.id AND w.user_id=e.client_id AND w.type='refund'
      WHERE e.gig_fee_sealed=TRUE AND e.gig_fee_bps>0 AND e.status='refunded'
        AND COALESCE(e.currency,'NGN')='NGN' AND w.n=1 AND w.amount=e.amount-e.start_released_amount
        AND EXISTS(SELECT 1 FROM gig_fee_events f WHERE f.escrow_id=e.id AND f.stage='sealed'
          AND f.gross_released=e.amount AND f.fee_amount=${fullFee})
      ON CONFLICT(escrow_id) DO NOTHING RETURNING id`)
    const result={recovered_fees:sealed.rows.length+releases.rows.length,recovered_refunds:refunds.rows.length}
    if(result.recovered_fees||result.recovered_refunds)await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,metadata)
      VALUES($1,'reconcile_commissions','finance',$2::jsonb)`,[adminId,JSON.stringify(result)])
    await client.query('COMMIT')
    return result
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
