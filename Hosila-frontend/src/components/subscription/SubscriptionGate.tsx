/**
 * SubscriptionGate — route guard that shows an upgrade prompt
 * when the hotel lacks a specific feature entitlement.
 *
 * Usage:
 *   <SubscriptionGate feature="restaurant_pos">
 *     <RestaurantPage />
 *   </SubscriptionGate>
 */

import React from 'react';
import { useHasFeature, useIsRestricted } from '@/hooks/useSubscription';

interface SubscriptionGateProps {
    /** The feature_entitlements key to check */
    feature?: string;
    /** If true, block when hotel is in restricted mode */
    blockOnRestricted?: boolean;
    children: React.ReactNode;
}

const PLAN_LABELS: Record<string, string> = {
    restaurant_pos: 'Pro',
    inventory_tracking: 'Pro',
    report_export: 'Pro',
    guest_email_automation: 'Pro',
    email_parsing: 'Enterprise',
    website_hooking: 'Enterprise',
    multi_property: 'Enterprise',
    custom_integrations: 'Enterprise',
};

const FEATURE_LABELS: Record<string, string> = {
    restaurant_pos: 'Restaurant & POS',
    inventory_tracking: 'Inventory Management',
    report_export: 'Report Export',
    guest_email_automation: 'Guest Email Automation',
    email_parsing: 'Email Parsing & Import',
    website_hooking: 'Website Integration & API',
    multi_property: 'Multi-Property Management',
    custom_integrations: 'Custom Integrations',
};

export function SubscriptionGate({ feature, blockOnRestricted, children }: SubscriptionGateProps) {
    const hasFeature = useHasFeature(feature || '');
    const isRestricted = useIsRestricted();

    // If feature-gated and hotel lacks it
    if (feature && !hasFeature) {
        return <UpgradePrompt feature={feature} />;
    }

    // If restricted-mode blocked
    if (blockOnRestricted && isRestricted) {
        return <RestrictedPrompt />;
    }

    return <>{children}</>;
}

function UpgradePrompt({ feature }: { feature: string }) {
    const requiredPlan = PLAN_LABELS[feature] || 'a higher';
    const featureLabel = FEATURE_LABELS[feature] || feature;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '2rem',
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: '480px',
                padding: '3rem 2rem',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                color: '#fecaca',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem', color: '#fff' }}>
                    {featureLabel}
                </h2>
                <p style={{ margin: '0 0 1.5rem', opacity: 0.8, lineHeight: 1.6 }}>
                    This feature requires the <strong>{requiredPlan}</strong> plan.
                    Upgrade to unlock {featureLabel.toLowerCase()} and more.
                </p>
                <a
                    href="/settings"
                    style={{
                        display: 'inline-block',
                        padding: '0.75rem 2rem',
                        borderRadius: '8px',
                        background: '#dc2626',
                        color: '#fff',
                        textDecoration: 'none',
                        fontWeight: 600,
                        transition: 'background 0.2s',
                    }}
                >
                    View Plans
                </a>
            </div>
        </div>
    );
}

function RestrictedPrompt() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '2rem',
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: '480px',
                padding: '3rem 2rem',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                color: '#fecaca',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem', color: '#fff' }}>
                    Subscription Inactive
                </h2>
                <p style={{ margin: '0 0 1.5rem', opacity: 0.85, lineHeight: 1.6 }}>
                    Your subscription has expired. You can still manage active guests and process checkouts,
                    but this page is not available in restricted mode.
                </p>
                <a
                    href="/settings"
                    style={{
                        display: 'inline-block',
                        padding: '0.75rem 2rem',
                        borderRadius: '8px',
                        background: '#dc2626',
                        color: '#fff',
                        textDecoration: 'none',
                        fontWeight: 600,
                    }}
                >
                    Renew Subscription
                </a>
            </div>
        </div>
    );
}

export default SubscriptionGate;
