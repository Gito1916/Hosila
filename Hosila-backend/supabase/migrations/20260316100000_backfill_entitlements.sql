-- Migration: Backfill new entitlement keys into existing hotel_subscriptions JSONB
-- These keys are needed by SQL helpers and RLS policies so they cannot rely
-- on a Python catalog fallback.
-- Uses jsonb || to merge — existing keys are preserved, new keys are added.

UPDATE hotel_subscriptions
SET feature_entitlements = feature_entitlements || '{
    "report_export": false,
    "guest_email_automation": false,
    "email_parsing": false,
    "website_hooking": false
}'::jsonb
WHERE plan_code = 'starter';

UPDATE hotel_subscriptions
SET feature_entitlements = feature_entitlements || '{
    "report_export": true,
    "guest_email_automation": true,
    "email_parsing": false,
    "website_hooking": false
}'::jsonb
WHERE plan_code = 'pro';

UPDATE hotel_subscriptions
SET feature_entitlements = feature_entitlements || '{
    "report_export": true,
    "guest_email_automation": true,
    "email_parsing": true,
    "website_hooking": true
}'::jsonb
WHERE plan_code = 'enterprise';
