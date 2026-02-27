-- Add unique constraint on (hotel_id, invoice_number) to prevent duplicate invoice numbers
-- The application already handles collisions with retry logic, this is a safety net
ALTER TABLE invoices
  ADD CONSTRAINT invoices_hotel_id_invoice_number_key UNIQUE (hotel_id, invoice_number);
