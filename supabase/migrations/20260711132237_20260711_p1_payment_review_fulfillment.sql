/*
# Payment Review Fulfillment Integration

## Summary
Extends the fulfillment system to support PAYMENT_REVIEW cases — a new case source type
that enables two-way communication between admins and users during payment verification.

## Changes

### fulfillment_cases
- `reward_grant_id` made NULLABLE (was NOT NULL) — payment review cases don't have a reward grant
- Added `payment_request_id UUID UNIQUE` — links a case to a payment request (1:1 guarantee)

### payment_requests
- Added `needs_info_requested_at TIMESTAMPTZ` — when admin first requested info
- Added `needs_info_requested_by UUID` — admin user ID who made the request
- Added `needs_info_case_id UUID` — FK to fulfillment_cases for the conversation thread
- Added `resubmitted_at TIMESTAMPTZ` — when user last resubmitted docs
- Added `needs_info_resolved_at TIMESTAMPTZ` — when admin resolved the needs-info state

## Security
- New SELECT policy on fulfillment_cases: users can read cases where user_id = auth.uid()
  (the existing policy already covers GAME_PRIZE; extending it to cover PAYMENT_REVIEW too)
- No new insert/update policies for users — all writes go through SECURITY DEFINER RPCs

## Notes
1. The UNIQUE constraint on payment_request_id ensures at most ONE active case per payment
2. Making reward_grant_id nullable is backwards-compatible — existing GAME_PRIZE rows keep their values
3. All RPC logic uses SECURITY DEFINER so RLS on fulfillment_cases is bypassed for writes
*/

-- 1. Make reward_grant_id nullable on fulfillment_cases
ALTER TABLE fulfillment_cases
  ALTER COLUMN reward_grant_id DROP NOT NULL;

-- 2. Add payment_request_id to fulfillment_cases (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fulfillment_cases' AND column_name = 'payment_request_id'
  ) THEN
    ALTER TABLE fulfillment_cases ADD COLUMN payment_request_id UUID;
    ALTER TABLE fulfillment_cases ADD CONSTRAINT fulfillment_cases_payment_request_id_key UNIQUE (payment_request_id);
  END IF;
END $$;

-- 3. Add tracking columns to payment_requests (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_requests' AND column_name = 'needs_info_requested_at'
  ) THEN
    ALTER TABLE payment_requests ADD COLUMN needs_info_requested_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_requests' AND column_name = 'needs_info_requested_by'
  ) THEN
    ALTER TABLE payment_requests ADD COLUMN needs_info_requested_by UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_requests' AND column_name = 'needs_info_case_id'
  ) THEN
    ALTER TABLE payment_requests ADD COLUMN needs_info_case_id UUID REFERENCES fulfillment_cases(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_requests' AND column_name = 'resubmitted_at'
  ) THEN
    ALTER TABLE payment_requests ADD COLUMN resubmitted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_requests' AND column_name = 'needs_info_resolved_at'
  ) THEN
    ALTER TABLE payment_requests ADD COLUMN needs_info_resolved_at TIMESTAMPTZ;
  END IF;
END $$;

-- 4. Ensure users can read their own fulfillment cases (covers PAYMENT_REVIEW + GAME_PRIZE)
DROP POLICY IF EXISTS "users_read_own_fulfillment_cases" ON fulfillment_cases;
CREATE POLICY "users_read_own_fulfillment_cases" ON fulfillment_cases
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
