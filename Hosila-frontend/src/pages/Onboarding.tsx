import { useNavigate } from 'react-router-dom';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

/**
 * Public onboarding page — shown when a new browser instance has no
 * existing Supabase session.  Users create a cloud account or connect
 * to an existing hotel here.  Once onboarding is complete, they are
 * redirected to the login page.
 */
export function OnboardingPage() {
    const navigate = useNavigate();

    const handleComplete = () => {
        navigate('/login', { replace: true });
    };

    return <OnboardingWizard onComplete={handleComplete} />;
}
