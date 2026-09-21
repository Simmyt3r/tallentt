BEGIN;

CREATE TABLE IF NOT EXISTS live_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  category TEXT NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','starting','live','reconnecting','ended','failed')),
  provider TEXT NOT NULL DEFAULT 'cloudflare',
  provider_input_id TEXT,
  provider_status TEXT,
  playback_url TEXT,
  playback_dash_url TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_streams_status_created ON live_streams(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_streams_talent_created ON live_streams(talent_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_streams_provider_input ON live_streams(provider, provider_input_id) WHERE provider_input_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS live_gift_catalogue (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INT CHECK (amount IS NULL OR amount > 0),
  icon TEXT NOT NULL,
  animation TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  custom_amount BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  CHECK ((custom_amount = true AND amount IS NULL) OR (custom_amount = false AND amount IS NOT NULL))
);

INSERT INTO live_gift_catalogue (id,name,description,amount,icon,animation,active,custom_amount,sort_order) VALUES
 ('applause','Applause','A simple show of appreciation.',100,'👏','applause',true,false,10),
 ('encore','Encore','Encourage the Talent to keep going.',250,'🎟️','encore',true,false,20),
 ('spotlight','Spotlight','Put extra attention on the Talent.',500,'🔦','spotlight',true,false,30),
 ('creative-fuel','Creative Fuel','Help fund the next creative step.',1000,'🎨','creative-fuel',true,false,40),
 ('gear-boost','Gear Boost','Contribute toward better creative equipment.',2500,'📸','gear-boost',true,false,50),
 ('production-boost','Production Boost','Support production costs for stronger work.',5000,'🎬','production-boost',true,false,60),
 ('gig-support','Gig Support','Help cover practical costs around the next gig.',7500,'🧳','gig-support',true,false,70),
 ('studio-session','Studio Session','Contribute toward focused studio or rehearsal time.',10000,'🎧','studio-session',true,false,80),
 ('career-boost','Career Boost','A meaningful contribution toward career growth.',25000,'🚀','career-boost',true,false,90),
 ('headliner','Headliner','Premium recognition for major support.',50000,'🏆','headliner',true,false,100),
 ('talent-sponsor','Talent Sponsor','Choose a custom amount to directly support the Talent.',NULL,'🤝','talent-sponsor',true,true,110)
ON CONFLICT (id) DO UPDATE SET
 name=EXCLUDED.name, description=EXCLUDED.description, amount=EXCLUDED.amount, icon=EXCLUDED.icon,
 animation=EXCLUDED.animation, active=EXCLUDED.active, custom_amount=EXCLUDED.custom_amount, sort_order=EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS live_viewers (
  stream_id UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stream_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_live_viewers_active ON live_viewers(stream_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS live_stream_likes (
  stream_id UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stream_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_live_stream_likes_stream ON live_stream_likes(stream_id);

CREATE TABLE IF NOT EXISTS live_support_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  supporter_id UUID NOT NULL REFERENCES users(id),
  talent_id UUID NOT NULL REFERENCES users(id),
  gift_id TEXT NOT NULL REFERENCES live_gift_catalogue(id),
  gross_amount INT NOT NULL CHECK (gross_amount > 0),
  platform_fee INT NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  net_amount INT NOT NULL CHECK (net_amount >= 0),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (net_amount + platform_fee = gross_amount),
  CHECK (supporter_id <> talent_id),
  UNIQUE (supporter_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_live_support_stream_created ON live_support_transactions(stream_id, created_at DESC) WHERE status='success';
CREATE INDEX IF NOT EXISTS idx_live_support_talent_created ON live_support_transactions(talent_id, created_at DESC) WHERE status='success';

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
 'topup','escrow_fund','escrow_release','withdrawal','refund',
 'live_stake','live_stake_refund','live_prize','live_owner_share','live_bet_stake','live_bet_payout','live_bet_refund',
 'live_gift_sent','live_gift_earning','live_sponsor_rent','live_sponsor_rain',
 'live_support_sent','live_support_earning'
));

COMMIT;
