/*
  # Add INSERT Policy to payment_verification Table

  1. Security Fix
    - Add missing INSERT policy for authenticated users
    - Users can only insert their own payment verification records
    - Prevents users from creating payments for other users

  2. Why This Fix
    - Current RLS policies only have SELECT and UPDATE
    - Missing INSERT policy blocks all payment creation attempts
    - Results in silent RLS violation (no error to client)
    - Users cannot submit payment proofs at all
*/

CREATE POLICY "Users can create their own payment verifications"
  ON payment_verification FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
