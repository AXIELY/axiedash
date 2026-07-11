/*
# Security Hardening P0-001: Remove Critical Unrestricted Write Policies

## Summary
Removes 13 RLS policies that allow any authenticated user to INSERT or UPDATE
sensitive financial, economy, audit, and game-settings tables without ownership
or admin checks.  All legitimate writes to these tables happen exclusively inside
SECURITY DEFINER RPCs (perform_spin, claim_daily_login, approve_commerce_payment,
etc.) which bypass RLS by design — the client-side INSERT/UPDATE policies were
therefore purely attack surface with no legitimate use.

## Tables Modified

### Audit / Economy (write policies removed — RPC-only going forward)
- commerce_events: DROP unrestricted INSERT (ce_insert)
- economy_logs: DROP unrestricted INSERT
- point_transactions: DROP unrestricted INSERT
- coupon_usages: DROP unrestricted INSERT + UPDATE

### Game mechanics (write policies removed — RPC-only going forward)
- game_attempts: DROP unrestricted INSERT
- free_plays: DROP unrestricted UPDATE

### Admin-only settings (write policies replaced with admin check)
- wheel_game_settings: INSERT/UPDATE now require is_admin()
- magic_chest_settings: INSERT/UPDATE now require is_admin()

### Game rooms (ownership/admin checks added)
- game_rooms INSERT: WITH CHECK (auth.uid() IS NOT NULL) — room must be created
  by a real authenticated session (no owner column on table, keep minimal check)
- game_rooms UPDATE: restricted to admin — client game flow does not need to
  directly UPDATE rooms (perform_spin RPC handles state transitions)

## Security Model
- Sensitive writes: SECURITY DEFINER RPCs only (bypass RLS by design)
- Settings writes: admins only via is_admin()
- No client can forge economy events, point credits, or audit logs
*/

-- ============================================================
-- COMMERCE EVENTS — remove unrestricted INSERT
-- (events written only inside SECURITY DEFINER RPCs)
-- ============================================================
DROP POLICY IF EXISTS "ce_insert" ON public.commerce_events;

-- ============================================================
-- ECONOMY LOGS — remove unrestricted INSERT
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert economy logs" ON public.economy_logs;

-- ============================================================
-- POINT TRANSACTIONS — remove unrestricted INSERT
-- ============================================================
DROP POLICY IF EXISTS "System can insert transactions" ON public.point_transactions;

-- ============================================================
-- COUPON USAGES — remove unrestricted INSERT + UPDATE
-- ============================================================
DROP POLICY IF EXISTS "System can insert coupon usages" ON public.coupon_usages;
DROP POLICY IF EXISTS "System can update coupon usages"  ON public.coupon_usages;

-- ============================================================
-- GAME ATTEMPTS — remove unrestricted INSERT
-- ============================================================
DROP POLICY IF EXISTS "System can insert attempts" ON public.game_attempts;

-- ============================================================
-- FREE PLAYS — remove unrestricted UPDATE
-- ============================================================
DROP POLICY IF EXISTS "System can update free plays" ON public.free_plays;

-- ============================================================
-- WHEEL GAME SETTINGS — restrict INSERT/UPDATE to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert wheel settings" ON public.wheel_game_settings;
DROP POLICY IF EXISTS "Authenticated users can update wheel settings" ON public.wheel_game_settings;

CREATE POLICY "Admins can insert wheel settings"
  ON public.wheel_game_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update wheel settings"
  ON public.wheel_game_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- MAGIC CHEST SETTINGS — restrict INSERT/UPDATE to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert magic chest settings" ON public.magic_chest_settings;
DROP POLICY IF EXISTS "Authenticated can update magic chest settings" ON public.magic_chest_settings;

CREATE POLICY "Admins can insert magic chest settings"
  ON public.magic_chest_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update magic chest settings"
  ON public.magic_chest_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- GAME ROOMS — tighten INSERT (require auth session), restrict UPDATE to admins
-- game_rooms has no owner/user_id column so we cannot enforce per-user ownership;
-- UPDATE is restricted to admins since the perform_spin RPC (SECURITY DEFINER)
-- handles all room state transitions and bypasses RLS.
-- ============================================================
DROP POLICY IF EXISTS "Users can create game rooms"  ON public.game_rooms;
DROP POLICY IF EXISTS "System can update game rooms" ON public.game_rooms;

CREATE POLICY "Authenticated users can create game rooms"
  ON public.game_rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update game rooms"
  ON public.game_rooms FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
