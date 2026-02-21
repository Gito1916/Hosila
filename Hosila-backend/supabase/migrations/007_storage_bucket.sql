-- Create the storage bucket for hotel assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('hotel-assets', 'hotel-assets', true)
ON CONFLICT (id) DO NOTHING;

-- RLS is already enabled on storage.objects, so we skip the ALTER TABLE command.

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can manage hotel assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can view hotel assets" ON storage.objects;

-- Policy: Allow authenticated users to upload/update/delete files in "hotel-assets"
CREATE POLICY "Authenticated users can manage hotel assets"
ON storage.objects
FOR ALL
TO authenticated
USING ( bucket_id = 'hotel-assets' )
WITH CHECK ( bucket_id = 'hotel-assets' );

-- Policy: Allow public access to view files
CREATE POLICY "Public can view hotel assets"
ON storage.objects
FOR SELECT
TO public
USING ( bucket_id = 'hotel-assets' );
