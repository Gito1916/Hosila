-- Walk-in payments don't have a booking, so booking_id must be nullable
ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN booking_id SET DEFAULT NULL;
