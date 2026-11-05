-- Explicitly authorized TEST-DATA adjustment on 5 November 2026.
-- Scope is the two reviewed, already completed deals below. No future,
-- unfinished, refunded, or other subscriber deals can enter this batch.
BEGIN;
CREATE TABLE IF NOT EXISTS test_completed_commission_deductions (
  escrow_id UUID PRIMARY KEY REFERENCES escrows(id) ON DELETE RESTRICT,
  wallet_transaction_id UUID NOT NULL UNIQUE,
  fee_event_id UUID NOT NULL UNIQUE,
  gross_amount INTEGER NOT NULL,
  fee_amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  original_fee_bps INTEGER,
  payout_transaction_ids JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE gig_fee_events ADD COLUMN IF NOT EXISTS origin TEXT;
DO $$
DECLARE
  deal RECORD;
  paid BIGINT;
  payout_count INTEGER;
  payout_ids JSONB;
  fee INTEGER;
  previous_balance INTEGER;
  next_balance INTEGER;
  transaction_id UUID;
  event_id UUID;
BEGIN
  -- Lock the complete batch, then wallets in a stable order, before any debit.
  PERFORM id FROM escrows WHERE id IN (
    '85d022a2-6b94-45ef-8d87-8055492e3d2d','8739fa2c-4270-4715-9ee8-0ba1844de275'
  ) ORDER BY id FOR UPDATE;
  IF (SELECT COUNT(*) FROM escrows WHERE id IN (
    '85d022a2-6b94-45ef-8d87-8055492e3d2d','8739fa2c-4270-4715-9ee8-0ba1844de275'
  ))<>2 THEN RAISE EXCEPTION 'The reviewed test deals are absent; no deductions applied.'; END IF;
  PERFORM user_id FROM wallets WHERE user_id IN (
    SELECT talent_id FROM escrows WHERE id IN (
      '85d022a2-6b94-45ef-8d87-8055492e3d2d','8739fa2c-4270-4715-9ee8-0ba1844de275'
    )
  ) ORDER BY user_id FOR UPDATE;

  FOR deal IN
    SELECT e.*,reviewed.expected_amount FROM escrows e JOIN (VALUES
      ('85d022a2-6b94-45ef-8d87-8055492e3d2d'::uuid,500000),
      ('8739fa2c-4270-4715-9ee8-0ba1844de275'::uuid,58000)
    ) AS reviewed(id,expected_amount) ON reviewed.id=e.id ORDER BY e.id
  LOOP
    IF EXISTS(SELECT 1 FROM test_completed_commission_deductions WHERE escrow_id=deal.id) THEN CONTINUE; END IF;
    IF deal.status<>'released' OR deal.work_status<>'completed'
      OR deal.amount<>deal.expected_amount OR COALESCE(deal.currency,'NGN')<>'NGN'
      OR COALESCE(deal.gig_fee_bps,0)<>0 THEN
      RAISE EXCEPTION 'Reviewed test deal changed; no deductions applied. Deal %, status %, work %, amount %, currency %, fee bps %.',
        deal.id,deal.status,deal.work_status,deal.amount,deal.currency,deal.gig_fee_bps;
    END IF;
    -- Receipts from any other path already account for this deal. Never charge twice.
    IF EXISTS(SELECT 1 FROM gig_fee_events WHERE escrow_id=deal.id) THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM wallet_transactions WHERE escrow_id=deal.id
      AND user_id=deal.client_id AND type='escrow_fund' AND status='success' AND amount=deal.amount) THEN
      RAISE EXCEPTION 'Test deal funding evidence is missing. Deal %.',deal.id;
    END IF;
    SELECT COALESCE(SUM(amount::bigint),0),COUNT(*)::int,jsonb_agg(id ORDER BY created_at,id)
      INTO paid,payout_count,payout_ids FROM wallet_transactions
      WHERE escrow_id=deal.id AND user_id=deal.talent_id
        AND type IN ('escrow_start','escrow_release') AND status='success';
    IF paid<>deal.amount OR payout_count<>(CASE WHEN deal.start_released_amount>0 THEN 2 ELSE 1 END)
      OR NOT EXISTS(SELECT 1 FROM wallet_transactions WHERE escrow_id=deal.id
        AND user_id=deal.talent_id AND type='escrow_release' AND status='success'
        AND amount=deal.amount-deal.start_released_amount) THEN
      RAISE EXCEPTION 'Full fee-free test payout could not be verified. Deal %, gross %, stored start %, paid %, payout records %.',
        deal.id,deal.amount,deal.start_released_amount,paid,payout_count;
    END IF;
    fee:=((deal.amount::bigint*500+5000)/10000)::int;
    SELECT balance INTO previous_balance FROM wallets WHERE user_id=deal.talent_id;
    IF previous_balance IS NULL OR previous_balance<fee THEN
      RAISE EXCEPTION 'Insufficient test wallet balance; entire batch rolled back.';
    END IF;
    UPDATE wallets SET balance=balance-fee,updated_at=NOW()
      WHERE user_id=deal.talent_id AND balance>=fee RETURNING balance INTO next_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'Test wallet changed; entire batch rolled back.'; END IF;
    INSERT INTO wallet_transactions(user_id,type,amount,balance_after,status,reference,escrow_id)
      VALUES(deal.talent_id,'billing_charge',fee,next_balance,'success',
        'test-completed-commission:'||deal.id::text,deal.id) RETURNING id INTO transaction_id;
    INSERT INTO gig_fee_events(escrow_id,stage,gross_released,fee_amount,rate_bps,source_transaction_id,origin)
      VALUES(deal.id,'completion',deal.amount,fee,500,transaction_id,'historical_test') RETURNING id INTO event_id;
    INSERT INTO test_completed_commission_deductions(escrow_id,wallet_transaction_id,fee_event_id,
      gross_amount,fee_amount,balance_before,balance_after,original_fee_bps,payout_transaction_ids)
      VALUES(deal.id,transaction_id,event_id,deal.amount,fee,previous_balance,next_balance,deal.gig_fee_bps,payout_ids);
  END LOOP;
END $$;
COMMIT;
