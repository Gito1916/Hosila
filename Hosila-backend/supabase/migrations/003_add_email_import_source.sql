-- ============================================================================
-- Migration 003: Update reservations source CHECK constraint
-- Adds 'email-import' as a valid reservation source
-- ============================================================================

-- Drop the old CHECK constraint and add updated one
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_source_check 
    CHECK (source IN ('walk-in', 'phone', 'booking.com', 'airbnb', 'direct', 'email-import'));
