/*
# Security Hardening P0-002: Revoke anon Role Grants on Sensitive Tables

## Summary
Supabase grants all privileges on public tables to anon and authenticated by
default when tables are created.  RLS provides the row-level enforcement but
the column-level privilege grants still expose the table to any anon-key caller
even when every RLS policy is scoped to `authenticated`.

This migration revokes ALL privileges on sensitive financial, admin, and
game-mechanics tables from the `anon` role.  The tables are only queried by
authenticated sessions; anon (unauthenticated) users have no business accessing
them.

Additionally, for certain tables the authenticated role is given only the minimum
required privileges (SELECT on read-only catalog tables, no DELETE on settings, etc.)

## Tables — anon ALL privileges revoked
admins, admin_logs,
commerce_orders, commerce_order_items, commerce_events, commerce_settings,
coupon_usages,
economy_logs,
free_plays,
fulfillment_cases, fulfillment_threads, fulfillment_messages,
fulfillment_unread, fulfillment_case_events,
game_attempts, game_logs, game_rooms,
magic_chest_settings,
payment_requests, payment_proofs, payment_approvals,
payment_destinations, payment_logs, payment_review_claims,
payment_verification,
point_transactions,
rejection_reasons,
reward_grants,
users,
wheel_game_settings

## Rollback note
To restore: GRANT ALL ON TABLE <name> TO anon;
(Not recommended — RLS must be correct before re-granting)
*/

-- ============================================================
-- Revoke ALL from anon on sensitive tables
-- ============================================================
REVOKE ALL ON TABLE public.admins                   FROM anon;
REVOKE ALL ON TABLE public.admin_logs               FROM anon;
REVOKE ALL ON TABLE public.commerce_orders          FROM anon;
REVOKE ALL ON TABLE public.commerce_order_items     FROM anon;
REVOKE ALL ON TABLE public.commerce_events          FROM anon;
REVOKE ALL ON TABLE public.commerce_settings        FROM anon;
REVOKE ALL ON TABLE public.coupon_usages            FROM anon;
REVOKE ALL ON TABLE public.economy_logs             FROM anon;
REVOKE ALL ON TABLE public.free_plays               FROM anon;
REVOKE ALL ON TABLE public.fulfillment_cases        FROM anon;
REVOKE ALL ON TABLE public.fulfillment_threads      FROM anon;
REVOKE ALL ON TABLE public.fulfillment_messages     FROM anon;
REVOKE ALL ON TABLE public.fulfillment_unread       FROM anon;
REVOKE ALL ON TABLE public.fulfillment_case_events  FROM anon;
REVOKE ALL ON TABLE public.game_attempts            FROM anon;
REVOKE ALL ON TABLE public.game_logs                FROM anon;
REVOKE ALL ON TABLE public.game_rooms               FROM anon;
REVOKE ALL ON TABLE public.magic_chest_settings     FROM anon;
REVOKE ALL ON TABLE public.payment_requests         FROM anon;
REVOKE ALL ON TABLE public.payment_proofs           FROM anon;
REVOKE ALL ON TABLE public.payment_approvals        FROM anon;
REVOKE ALL ON TABLE public.payment_destinations     FROM anon;
REVOKE ALL ON TABLE public.payment_review_claims    FROM anon;
REVOKE ALL ON TABLE public.point_transactions       FROM anon;
REVOKE ALL ON TABLE public.rejection_reasons        FROM anon;
REVOKE ALL ON TABLE public.reward_grants            FROM anon;
REVOKE ALL ON TABLE public.users                    FROM anon;
REVOKE ALL ON TABLE public.wheel_game_settings      FROM anon;

-- payment_logs and payment_verification — revoke if tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_logs') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.payment_logs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_verification') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.payment_verification FROM anon';
  END IF;
END $$;

-- ============================================================
-- Tighten authenticated grants on settings tables
-- (authenticated only needs SELECT to read; INSERT/UPDATE handled via policies
--  and admins already have those via RLS; revoke DELETE from non-admin tables
--  that should never be deleted client-side)
-- ============================================================

-- wheel_game_settings: revoke DELETE from authenticated (no delete policy exists)
REVOKE DELETE ON TABLE public.wheel_game_settings FROM authenticated;

-- magic_chest_settings: revoke DELETE from authenticated
REVOKE DELETE ON TABLE public.magic_chest_settings FROM authenticated;

-- commerce_events: revoke all write access from authenticated
-- (written only inside SECURITY DEFINER RPCs)
REVOKE INSERT, UPDATE, DELETE ON TABLE public.commerce_events FROM authenticated;

-- economy_logs: revoke INSERT/UPDATE/DELETE from authenticated
REVOKE INSERT, UPDATE, DELETE ON TABLE public.economy_logs FROM authenticated;

-- point_transactions: revoke INSERT/UPDATE/DELETE from authenticated
REVOKE INSERT, UPDATE, DELETE ON TABLE public.point_transactions FROM authenticated;

-- coupon_usages: revoke INSERT/UPDATE/DELETE from authenticated
REVOKE INSERT, UPDATE, DELETE ON TABLE public.coupon_usages FROM authenticated;

-- game_attempts: revoke INSERT/UPDATE/DELETE from authenticated
REVOKE INSERT, UPDATE, DELETE ON TABLE public.game_attempts FROM authenticated;

-- free_plays: revoke UPDATE/DELETE from authenticated
REVOKE UPDATE, DELETE ON TABLE public.free_plays FROM authenticated;

-- ============================================================
-- payment_destinations: users need SELECT (to see active destinations for payment form)
-- but authenticated should not INSERT/UPDATE/DELETE — that's admin-only via RLS.
-- The RLS policy already enforces is_commerce_admin() for writes.
-- Revoke write grants from authenticated just for defense-in-depth.
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_destinations FROM authenticated;
-- Re-grant SELECT only (in case above revoke removed it)
GRANT SELECT ON TABLE public.payment_destinations TO authenticated;

-- ============================================================
-- rejection_reasons: authenticated needs SELECT to populate dropdown
-- (already have RLS: admins can manage, users can read active ones)
-- Revoke write grants from authenticated; admin writes via RPC
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON TABLE public.rejection_reasons FROM authenticated;
GRANT SELECT ON TABLE public.rejection_reasons TO authenticated;
