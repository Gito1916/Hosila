-- Function to automatically update hotel logo_url when a file is uploaded to storage
create or replace function public.handle_storage_logo_update()
returns trigger
security definer
language plpgsql
as $$
declare
  hotel_id uuid;
  project_url text := 'https://ywxsopiokkdytgsvyacg.supabase.co';
begin
  -- Only process uploads to the 'hotel-assets' bucket
  if new.bucket_id = 'hotel-assets' then
    -- Expected path format: "{hotel_id}/logo.{ext}"
    -- We prevent errors by wrapping the UUID cast in a block
    begin
        -- Extract the first part of the path as the hotel_id
        hotel_id := (split_part(new.name, '/', 1))::uuid;
        
        -- Check if the file is likely a logo (contains "logo.")
        -- This prevents updating if random files are uploaded to the folder
        if new.name ~ 'logo\.' then
            -- Construct the public URL
            -- Format: https://PROJECT_ID.supabase.co/storage/v1/object/public/BUCKET/PATH
            update public.hotels
            set logo_url = project_url || '/storage/v1/object/public/hotel-assets/' || new.name,
                updated_at = now()
            where id = hotel_id;
        end if;
    exception when others then
        -- Ignore errors if path doesn't start with a UUID (e.g. folder creation or invalid paths)
        -- raise warning 'Could not update logo_url for path: %', new.name;
    end;
  end if;
  return new;
end;
$$;

-- Drop existing triggers if they exist to avoid duplication
drop trigger if exists on_logo_upload on storage.objects;
drop trigger if exists on_logo_update on storage.objects;

-- Create trigger for INSERT (new uploads)
create trigger on_logo_upload
after insert on storage.objects
for each row execute function public.handle_storage_logo_update();

-- Create trigger for UPDATE (overwriting existing files with same name)
create trigger on_logo_update
after update on storage.objects
for each row execute function public.handle_storage_logo_update();
