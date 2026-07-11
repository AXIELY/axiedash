-- Enable spin_v2 so the server-authoritative spin path runs,
-- which writes reward_grants and creates fulfillment cases for manual prizes.
UPDATE engagement_flags SET enabled = true WHERE flag = 'spin_v2';
