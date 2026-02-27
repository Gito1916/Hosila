
-- ============================================================
-- Fix double-taxed accommodation charges
-- Bug: checkIn() passed tax-inclusive totalWithTax as gross_amount
-- to createCharge(), which applied tax again.
-- Fix: recalculate from booking.rate (the pre-tax base).
-- ============================================================

-- Step 1: Fix charges
WITH corrections AS (
  SELECT
    c.id as charge_id,
    b.id as booking_id,
    b.rate as base_rate,
    b.total_paid,
    ts.service_charge_rate,
    ts.vat_rate,
    ts.tdl_rate,
    ts.service_charge_enabled,
    ts.vat_enabled,
    ts.tdl_enabled,
    CASE WHEN ts.service_charge_enabled THEN ROUND(b.rate * ts.service_charge_rate / 100, 2) ELSE 0 END as correct_sc,
    CASE WHEN ts.vat_enabled THEN ROUND(b.rate * ts.vat_rate / 100, 2) ELSE 0 END as correct_vat,
    CASE WHEN ts.tdl_enabled THEN ROUND(b.rate * ts.tdl_rate / 100, 2) ELSE 0 END as correct_tdl
  FROM bookings b
  JOIN charges c ON c.booking_id = b.id AND c.department = 'accommodation' AND c.status = 'active'
  JOIN tax_settings ts ON ts.hotel_id = b.hotel_id AND ts.department = 'accommodation'
  WHERE c.base_amount != b.rate
)
UPDATE charges SET
  base_amount = corrections.base_rate,
  net_revenue = corrections.base_rate,
  service_charge_amount = corrections.correct_sc,
  vat_amount_v2 = corrections.correct_vat,
  tdl_amount = corrections.correct_tdl,
  tax_amount = corrections.correct_sc + corrections.correct_vat + corrections.correct_tdl,
  gross_amount = corrections.base_rate + corrections.correct_sc + corrections.correct_vat + corrections.correct_tdl,
  tax_rate = COALESCE(
    CASE WHEN corrections.service_charge_enabled THEN corrections.service_charge_rate ELSE 0 END +
    CASE WHEN corrections.vat_enabled THEN corrections.vat_rate ELSE 0 END +
    CASE WHEN corrections.tdl_enabled THEN corrections.tdl_rate ELSE 0 END,
    0
  )
FROM corrections
WHERE charges.id = corrections.charge_id;

-- Step 2: Fix booking totals and balances
WITH correct_totals AS (
  SELECT
    b.id as booking_id,
    b.total_paid,
    (b.rate + 
      CASE WHEN ts.service_charge_enabled THEN ROUND(b.rate * ts.service_charge_rate / 100, 2) ELSE 0 END +
      CASE WHEN ts.vat_enabled THEN ROUND(b.rate * ts.vat_rate / 100, 2) ELSE 0 END +
      CASE WHEN ts.tdl_enabled THEN ROUND(b.rate * ts.tdl_rate / 100, 2) ELSE 0 END
    ) as correct_total
  FROM bookings b
  JOIN charges c ON c.booking_id = b.id AND c.department = 'accommodation' AND c.status = 'active'
  JOIN tax_settings ts ON ts.hotel_id = b.hotel_id AND ts.department = 'accommodation'
  WHERE b.total_charged != (
    b.rate + 
    CASE WHEN ts.service_charge_enabled THEN ROUND(b.rate * ts.service_charge_rate / 100, 2) ELSE 0 END +
    CASE WHEN ts.vat_enabled THEN ROUND(b.rate * ts.vat_rate / 100, 2) ELSE 0 END +
    CASE WHEN ts.tdl_enabled THEN ROUND(b.rate * ts.tdl_rate / 100, 2) ELSE 0 END
  )
)
UPDATE bookings SET
  total_charged = correct_totals.correct_total,
  balance = correct_totals.correct_total - correct_totals.total_paid,
  updated_at = NOW()
FROM correct_totals
WHERE bookings.id = correct_totals.booking_id;

-- Step 3: Fix journal entries
-- 3a: Fix Guest AR debit (account 1020)
UPDATE journal_entries SET
  amount = c_fix.correct_gross
FROM (
  SELECT
    c.id as charge_id,
    b.rate + 
      CASE WHEN ts.service_charge_enabled THEN ROUND(b.rate * ts.service_charge_rate / 100, 2) ELSE 0 END +
      CASE WHEN ts.vat_enabled THEN ROUND(b.rate * ts.vat_rate / 100, 2) ELSE 0 END +
      CASE WHEN ts.tdl_enabled THEN ROUND(b.rate * ts.tdl_rate / 100, 2) ELSE 0 END
    as correct_gross
  FROM bookings b
  JOIN charges c ON c.booking_id = b.id AND c.department = 'accommodation' AND c.status = 'active'
  JOIN tax_settings ts ON ts.hotel_id = b.hotel_id AND ts.department = 'accommodation'
) c_fix
WHERE journal_entries.reference_id = c_fix.charge_id::text
  AND journal_entries.account_code = '1020';

-- 3b: Fix Revenue credit (account 4010)
UPDATE journal_entries SET
  amount = b.rate
FROM bookings b
JOIN charges c ON c.booking_id = b.id AND c.department = 'accommodation' AND c.status = 'active'
WHERE journal_entries.reference_id = c.id::text
  AND journal_entries.account_code = '4010';

-- 3c: Fix Tax Payable credit (account 2010)
UPDATE journal_entries SET
  amount = c_fix.correct_tax
FROM (
  SELECT
    c.id as charge_id,
    CASE WHEN ts.service_charge_enabled THEN ROUND(b.rate * ts.service_charge_rate / 100, 2) ELSE 0 END +
    CASE WHEN ts.vat_enabled THEN ROUND(b.rate * ts.vat_rate / 100, 2) ELSE 0 END +
    CASE WHEN ts.tdl_enabled THEN ROUND(b.rate * ts.tdl_rate / 100, 2) ELSE 0 END
    as correct_tax
  FROM bookings b
  JOIN charges c ON c.booking_id = b.id AND c.department = 'accommodation' AND c.status = 'active'
  JOIN tax_settings ts ON ts.hotel_id = b.hotel_id AND ts.department = 'accommodation'
) c_fix
WHERE journal_entries.reference_id = c_fix.charge_id::text
  AND journal_entries.account_code = '2010';
