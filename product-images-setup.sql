-- Run this once in Supabase Dashboard > SQL Editor for All Items Stock & Expiry Tracker.
-- Adds persistent image URLs to product records and creates a public-read image bucket.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 6291456, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 6291456,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Product images upload own folder') THEN
    CREATE POLICY "Product images upload own folder"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Product images update own folder') THEN
    CREATE POLICY "Product images update own folder"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Product images delete own folder') THEN
    CREATE POLICY "Product images delete own folder"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
