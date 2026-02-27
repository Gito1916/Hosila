-- Enable btree_gist extension (required for exclusion constraints mixing equality + range)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping confirmed/pending reservations for the same room in the same hotel.
-- This is a database-level safety net that prevents double-booking even under race conditions.
-- The constraint uses a tstzrange (timestamp range) with the && (overlaps) operator.
-- Only active reservations (confirmed/pending) are checked; cancelled/checked_in are excluded.
ALTER TABLE reservations
ADD CONSTRAINT no_overlapping_reservations
EXCLUDE USING gist (
    hotel_id WITH =,
    room_id WITH =,
    tstzrange(check_in_date, check_out_date, '[)') WITH &&
)
WHERE (status IN ('confirmed', 'pending'));
