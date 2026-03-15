import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, ChevronLeft, Check, Loader2, Copy, Settings, Mail, Link2, Monitor, ShieldAlert, UserPlus } from 'lucide-react';
import { updateHotel } from '@/db/settings';
import { seedDatabase } from '@/utils/seedData';
import { isCloudAvailable, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { requireSupabase, getHotelId, clearHotelIdCache } from '@/lib/api';

type Step = 'welcome' | 'account' | 'hotel' | 'complete' | 'connect';

interface OnboardingWizardProps {
    onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState<Step>('welcome');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Account form (new setup)
    const [accountEmail, setAccountEmail] = useState('');
    const [accountPassword, setAccountPassword] = useState('');
    const [accountError, setAccountError] = useState('');

    // Hotel form (new setup)
    const [hotelName, setHotelName] = useState('');
    const [hotelAddress, setHotelAddress] = useState('');
    const [hotelPhone, setHotelPhone] = useState('');
    const [hotelEmail, setHotelEmail] = useState('');
    const [hotelError, setHotelError] = useState('');

    // Connect existing hotel
    const [connectEmail, setConnectEmail] = useState('');
    const [connectPassword, setConnectPassword] = useState('');
    const [connectError, setConnectError] = useState('');
    const [connectSuccess, setConnectSuccess] = useState(false);
    const [syncProgress, setSyncProgress] = useState('');
    const [copied, setCopied] = useState(false);

    const { loginCloud, autoLoginAsAdmin } = useAuthStore();
    const cloudAvailable = isCloudAvailable();

    // =========================================================================
    // New Hotel: Step 1 — Create cloud account (Supabase auth.signUp)
    // =========================================================================
    const handleCreateAccount = async () => {
        if (!accountEmail || !accountEmail.includes('@')) {
            setAccountError('Please enter a valid email address');
            return;
        }
        if (!accountPassword || accountPassword.length < 8) {
            setAccountError('Password must be at least 8 characters');
            return;
        }

        setIsSubmitting(true);
        setAccountError('');

        try {
            if (!supabase) {
                setAccountError('Cloud service is not configured. Check your Supabase settings.');
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email: accountEmail,
                password: accountPassword,
            });

            if (error) {
                setAccountError(error.message);
                return;
            }

            if (!data.user) {
                setAccountError('Account creation failed. Please try again.');
                return;
            }

            // Pre-fill org email with account email
            if (!hotelEmail) {
                setHotelEmail(accountEmail);
            }

            // Move to hotel details step (user is now authenticated)
            setCurrentStep('hotel');
        } catch (err: any) {
            console.error('Account creation error:', err);
            setAccountError(err?.message || 'Failed to create account. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // =========================================================================
    // New Hotel: Step 2 — Save hotel info (user is already authenticated)
    // =========================================================================
    const handleSaveHotel = async () => {
        if (!hotelName.trim()) return;
        setIsSubmitting(true);
        setHotelError('');
        try {
            // Clear any cached hotel ID from a previous attempt
            clearHotelIdCache();

            // Seed the database — creates hotel + admin user in Supabase
            await seedDatabase();

            // Update hotel with user-provided details
            await updateHotel({
                name: hotelName,
                address: hotelAddress,
                phone: hotelPhone,
                email: hotelEmail,
            });

            setCurrentStep('complete');
        } catch (err: any) {
            console.error('Error saving hotel:', err);
            setHotelError(err?.message || 'Failed to save hotel. Check your connection and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // =========================================================================
    // Connect Existing: Login to Supabase → verify org data exists
    // =========================================================================
    const handleConnectExisting = async () => {
        if (!connectEmail || !connectEmail.includes('@')) {
            setConnectError('Please enter a valid email address');
            return;
        }
        if (!connectPassword || connectPassword.length < 8) {
            setConnectError('Password must be at least 8 characters');
            return;
        }

        setIsSubmitting(true);
        setConnectError('');
        setSyncProgress('Signing in to cloud...');

        try {
            // Step 1: Login to Supabase cloud account
            const loggedIn = await loginCloud(connectEmail, connectPassword);
            if (!loggedIn) {
                const storeError = useAuthStore.getState().cloudError;
                setConnectError(storeError || 'Invalid email or password.');
                setIsSubmitting(false);
                setSyncProgress('');
                return;
            }

            // Step 2: Verify hotel data exists
            setSyncProgress('Verifying hotel data...');
            clearHotelIdCache();
            const hotelId = await getHotelId();
            const sb = requireSupabase();

            const { data: hotel } = await sb
                .from('hotels')
                .select('*')
                .eq('id', hotelId)
                .single();

            if (!hotel) {
                setConnectError('No hotel found for this account. Make sure you are using the correct credentials.');
                setIsSubmitting(false);
                setSyncProgress('');
                return;
            }

            // Step 3: Verify users exist
            setSyncProgress('Checking staff accounts...');
            const { count: users } = await sb
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('hotel_id', hotel.id);

            if (users === 0) {
                setConnectError('Hotel connected but no staff accounts found. Create users on the primary device first.');
                setIsSubmitting(false);
                setSyncProgress('');
                return;
            }

            // Step 4: Mark onboarding complete
            setSyncProgress('Finalizing setup...');
            await updateHotel({
                settings: {
                    ...hotel.settings!,
                    onboarding_complete: true,
                },
            });

            setSyncProgress('');
            setConnectSuccess(true);
        } catch (err: any) {
            setConnectError(err?.message || 'Failed to connect to hotel');
            setSyncProgress('');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    // =========================================================================
    // Connect Existing: Go to login page
    // =========================================================================
    const handleGoToLogin = () => {
        onComplete();
        navigate('/login');
    };

    // =========================================================================
    // New Org: Complete → auto-login as admin
    // =========================================================================
    const handleComplete = async () => {
        setIsSubmitting(true);
        try {
            // Auto-login as admin FIRST — before marking onboarding complete.
            await autoLoginAsAdmin();

            const hId = await getHotelId();
            const { data: hotel } = await requireSupabase()
                .from('hotels')
                .select('*')
                .eq('id', hId)
                .single();

            if (hotel) {
                await updateHotel({
                    settings: {
                        ...hotel.settings!,
                        onboarding_complete: true,
                    },
                });
            }

            // Fire-and-forget welcome email — do not block onboarding
            import('@/lib/apiClient').then(({ emailApi }) => {
                emailApi.sendWelcomeEmail().catch(() => {
                    // Silently ignore — email is best-effort
                });
            });

            onComplete();
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyEmail = async () => {
        try {
            await navigator.clipboard.writeText(accountEmail);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = accountEmail;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Progress dots
    const isConnectFlow = currentStep === 'connect';
    const newFlowSteps: Step[] = ['welcome', 'account', 'hotel', 'complete'];
    const connectFlowSteps: Step[] = ['welcome', 'connect', 'complete'];
    const activeSteps = isConnectFlow || connectSuccess ? connectFlowSteps : newFlowSteps;

    const getStepIndex = (step: Step) => {
        if (step === 'connect') return 1;
        return newFlowSteps.indexOf(step);
    };

    return (
        <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
            <div className="w-full max-w-lg">
                {/* Progress indicator */}
                {currentStep !== 'welcome' && (
                    <div className="flex items-center justify-center gap-2 mb-8">
                        {activeSteps.map((_, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${i < getStepIndex(currentStep) ? 'bg-status-available' :
                                    i === getStepIndex(currentStep) ? 'bg-primary-500' : 'bg-surface-raised'
                                    }`} />
                                {i < activeSteps.length - 1 && (
                                    <div className={`w-12 h-0.5 ${i < getStepIndex(currentStep) ? 'bg-status-available' : 'bg-surface-raised'
                                        }`} />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="bg-surface-card rounded-2xl border border-border overflow-hidden">
                    {/* Welcome — Choose new or connect */}
                    {currentStep === 'welcome' && (
                        <div className="p-6">
                            <div className="text-center mb-8">
                                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <img src="/Hosila-icon-logo.png" alt="Hosila" className="w-16 h-16 rounded-xl" />
                                </div>
                                <h2 className="text-2xl font-bold text-heading">Welcome to Hosila</h2>
                                <p className="text-muted mt-2">How would you like to get started?</p>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => setCurrentStep('account')}
                                    className="w-full p-5 rounded-xl border-2 border-border hover:border-primary-500 hover:bg-primary-500/5 text-left transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-primary-500/20 rounded-full flex items-center justify-center shrink-0 group-hover:bg-primary-500/30 transition-colors">
                                            <Building2 size={24} className="text-primary-400" />
                                        </div>
                                        <div>
                                            <p className="text-heading font-semibold text-lg">Create New Hotel</p>
                                            <p className="text-sm text-muted">First time using Hosila? Set up your hotel.</p>
                                        </div>
                                        <ChevronRight size={20} className="text-muted ml-auto shrink-0" />
                                    </div>
                                </button>

                                <button
                                    onClick={() => setCurrentStep('connect')}
                                    disabled={!cloudAvailable}
                                    className={`w-full p-5 rounded-xl border-2 border-border hover:border-cyan-500 hover:bg-cyan-500/5 text-left transition-all group ${!cloudAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-cyan-500/20 rounded-full flex items-center justify-center shrink-0 group-hover:bg-cyan-500/30 transition-colors">
                                            <Link2 size={24} className="text-cyan-400" />
                                        </div>
                                        <div>
                                            <p className="text-heading font-semibold text-lg">Connect to Hotel</p>
                                            <p className="text-sm text-muted">Already set up? Join an existing hotel.</p>
                                        </div>
                                        <ChevronRight size={20} className="text-muted ml-auto shrink-0" />
                                    </div>
                                </button>

                                {!cloudAvailable && (
                                    <p className="text-xs text-muted text-center mt-2">
                                        Cloud sync not configured. Add Supabase credentials to connect to an existing hotel.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step: Create Account (new setup) */}
                    {currentStep === 'account' && (
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <UserPlus size={32} className="text-primary-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-heading">Create Your Account</h2>
                                <p className="text-muted mt-2">
                                    This account secures your hotel data in the cloud
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="label">Email Address *</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                                        <input
                                            type="email"
                                            value={accountEmail}
                                            onChange={(e) => setAccountEmail(e.target.value)}
                                            className="input pl-10"
                                            placeholder="hotel@gmail.com"
                                            autoFocus
                                        />
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                        Use the same email and password to connect other devices later.
                                    </p>
                                </div>
                                <div>
                                    <label className="label">Password *</label>
                                    <input
                                        type="password"
                                        value={accountPassword}
                                        onChange={(e) => setAccountPassword(e.target.value)}
                                        className="input"
                                        placeholder="Minimum 8 characters"
                                        minLength={8}
                                    />
                                </div>

                                {accountError && (
                                    <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                        {accountError}
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 flex gap-3">
                                <button
                                    onClick={() => setCurrentStep('welcome')}
                                    className="btn btn-secondary flex items-center justify-center gap-2"
                                >
                                    <ChevronLeft size={18} />
                                    Back
                                </button>
                                <button
                                    onClick={handleCreateAccount}
                                    disabled={isSubmitting || !accountEmail || !accountPassword || accountPassword.length < 8}
                                    className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            Creating Account...
                                        </>
                                    ) : (
                                        <>
                                            Create Account
                                            <ChevronRight size={18} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step: Hotel Info (new setup — user is now authenticated) */}
                    {currentStep === 'hotel' && (
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <img src="/Hosila-icon-logo.png" alt="Hosila" className="w-12 h-12 rounded-xl" />
                                </div>
                                <h2 className="text-2xl font-bold text-heading">Hotel Details</h2>
                                <p className="text-muted mt-2">Tell us about your hotel</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="label">Hotel Name *</label>
                                    <input
                                        value={hotelName}
                                        onChange={(e) => setHotelName(e.target.value)}
                                        className="input"
                                        placeholder="e.g., Grand Palace Hotel"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="label">Address</label>
                                    <input
                                        value={hotelAddress}
                                        onChange={(e) => setHotelAddress(e.target.value)}
                                        className="input"
                                        placeholder="e.g., 123 Main Street, Lagos"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="label">Phone</label>
                                        <input
                                            value={hotelPhone}
                                            onChange={(e) => setHotelPhone(e.target.value)}
                                            className="input"
                                            placeholder="+234 800 000 0000"
                                        />
                                    </div>
                                    <div>
                                        <label className="label">Email</label>
                                        <input
                                            value={hotelEmail}
                                            onChange={(e) => setHotelEmail(e.target.value)}
                                            className="input"
                                            placeholder="info@hotel.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            {hotelError && (
                                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                    {hotelError}
                                </div>
                            )}
                            <div className="mt-6 flex gap-3">
                                <button
                                    onClick={() => setCurrentStep('account')}
                                    className="btn btn-secondary flex items-center justify-center gap-2"
                                >
                                    <ChevronLeft size={18} />
                                    Back
                                </button>
                                <button
                                    onClick={handleSaveHotel}
                                    disabled={!hotelName.trim() || isSubmitting}
                                    className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : (
                                        <>
                                            Continue
                                            <ChevronRight size={18} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Connect to Existing Org */}
                    {currentStep === 'connect' && (
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Monitor size={32} className="text-cyan-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-heading">Connect to Hotel</h2>
                                <p className="text-muted mt-2">Enter the cloud account details from the hotel's account</p>
                            </div>

                            {!connectSuccess ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="label">Cloud Account Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                                            <input
                                                type="email"
                                                value={connectEmail}
                                                onChange={(e) => setConnectEmail(e.target.value)}
                                                className="input pl-10"
                                                placeholder="hotel@gmail.com"
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label">Password</label>
                                        <input
                                            type="password"
                                            value={connectPassword}
                                            onChange={(e) => setConnectPassword(e.target.value)}
                                            className="input"
                                            placeholder="Enter password"
                                        />
                                    </div>

                                    {connectError && (
                                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                            {connectError}
                                        </div>
                                    )}

                                    {syncProgress && (
                                        <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm">
                                            <Loader2 size={16} className="animate-spin shrink-0" />
                                            {syncProgress}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleConnectExisting}
                                        disabled={isSubmitting || !connectEmail || !connectPassword}
                                        className="btn btn-primary w-full"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                Connecting...
                                            </>
                                        ) : (
                                            <>
                                                <Link2 size={18} />
                                                Connect
                                            </>
                                        )}
                                    </button>

                                    <p className="text-xs text-muted text-center">
                                        Ask the hotel administrator for the cloud email and password.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center space-y-4">
                                    <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                                        <Check size={24} className="text-emerald-400" />
                                    </div>
                                    <p className="text-heading font-medium text-lg">Connected Successfully!</p>
                                    <p className="text-sm text-muted">
                                        Your device is now linked to the hotel. You can sign in with your staff account.
                                    </p>
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-400">
                                        ☁️ Connected to: <code className="text-emerald-300">{connectEmail}</code>
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 flex gap-3">
                                <button
                                    onClick={() => {
                                        setCurrentStep('welcome');
                                        setConnectError('');
                                        setSyncProgress('');
                                    }}
                                    className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
                                    disabled={isSubmitting}
                                >
                                    <ChevronLeft size={18} />
                                    Back
                                </button>
                                {connectSuccess && (
                                    <button
                                        onClick={handleGoToLogin}
                                        className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                                    >
                                        Sign In
                                        <ChevronRight size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step: Complete */}
                    {currentStep === 'complete' && (
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-status-available/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check size={32} className="text-status-available" />
                                </div>
                                <h2 className="text-2xl font-bold text-heading">You're All Set!</h2>
                                <p className="text-muted mt-2">
                                    {`${hotelName || 'Your hotel'} is ready to use`}
                                </p>
                            </div>

                            {/* Password change reminder */}
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
                                <div className="flex items-start gap-3">
                                    <ShieldAlert size={20} className="text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-amber-400 font-medium text-sm">Default Password Active</p>
                                        <p className="text-muted text-xs mt-1">
                                            You'll be signed in as <strong className="text-heading">Admin</strong> with the default password <code className="text-amber-300">Change1Me!</code>.
                                            You will be prompted to change it on first login.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Cloud account info */}
                            <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-3 mb-4 text-sm">
                                <p className="text-primary-400 font-medium">☁️ Cloud Account</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <code className="text-primary-300 text-xs flex-1">{accountEmail}</code>
                                    <button
                                        onClick={handleCopyEmail}
                                        className="btn btn-secondary text-xs px-2 py-1"
                                    >
                                        <Copy size={14} />
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <p className="text-xs text-muted mt-2">
                                    Use this email + password to connect other devices.
                                </p>
                            </div>

                            <div className="bg-surface-raised/50 rounded-lg p-4 mb-6">
                                <h3 className="text-heading font-medium mb-3 flex items-center gap-2">
                                    <Settings size={16} className="text-primary-400" />
                                    Next Steps
                                </h3>
                                <ul className="text-sm text-muted space-y-2">
                                    <li className="flex items-start gap-2">
                                        <span className="text-primary-400 mt-0.5">→</span>
                                        Go to <strong className="text-heading">Settings → Room Types</strong> to configure room types
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-primary-400 mt-0.5">→</span>
                                        Go to <strong className="text-heading">Settings → Rooms</strong> to add your rooms
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-primary-400 mt-0.5">→</span>
                                        Go to <strong className="text-heading">Settings → Users</strong> to add staff accounts
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-primary-400 mt-0.5">→</span>
                                        Go to <strong className="text-heading">Settings → Restaurant</strong> to set up the menu
                                    </li>
                                </ul>
                            </div>

                            <button
                                onClick={handleComplete}
                                disabled={isSubmitting}
                                className="btn btn-primary w-full"
                            >
                                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Go to Dashboard'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
