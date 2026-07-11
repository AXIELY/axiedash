/*
  # Payment Proof Storage Bucket + RLS

  Creates the storage bucket for proof images and sets
  RLS policies so users can upload their own proofs and
  admins can read all.
*/

-- Create bucket (idempotent via DO block)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload into their own folder
CREATE POLICY "Users can upload their own proof images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: users can view their own proofs
CREATE POLICY "Users can view their own proof images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: admins can read all proofs
CREATE POLICY "Admins can view all proof images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );
