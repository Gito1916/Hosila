import { useState, useEffect } from 'react';
import {
    Mail,
    Send,
    Save,
    Loader2,
    ToggleLeft,
    ToggleRight,
    Globe,
    Shield,
    CheckCircle,
    XCircle,
    Palette,
    Megaphone,
    ChevronDown,
    ChevronUp,
    Clock,
    AlertTriangle,
} from 'lucide-react';
import { emailApi, type EmailSettings, type EmailLog } from '@/lib/apiClient';
import { ensureBackendAwake } from '@/lib/apiClient';

export function EmailSettingsPanel() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [logsExpanded, setLogsExpanded] = useState(false);

    // Settings state
    const [sendingMode, setSendingMode] = useState<'shared' | 'custom'>('shared');
    const [customDomain, setCustomDomain] = useState('');
    const [customSenderEmail, setCustomSenderEmail] = useState('');
    const [domainVerified, setDomainVerified] = useState(false);
    const [spfVerified, setSpfVerified] = useState(false);
    const [dkimVerified, setDkimVerified] = useState(false);
    const [dmarcVerified, setDmarcVerified] = useState(false);
    const [primaryColor, setPrimaryColor] = useState('#2563EB');
    const [promoEnabled, setPromoEnabled] = useState(false);
    const [promoTitle, setPromoTitle] = useState('');
    const [promoBody, setPromoBody] = useState('');
    const [customFooter, setCustomFooter] = useState('');
    const [sendReservation, setSendReservation] = useState(true);
    const [sendCheckin, setSendCheckin] = useState(true);
    const [sendCheckout, setSendCheckout] = useState(true);

    // Logs state
    const [logs, setLogs] = useState<EmailLog[]>([]);
    const [logsPage, setLogsPage] = useState(1);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsPages, setLogsPages] = useState(0);
    const [logsLoading, setLogsLoading] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        try {
            await ensureBackendAwake();
            const settings = await emailApi.getSettings();
            setSendingMode(settings.sending_mode);
            setCustomDomain(settings.custom_domain || '');
            setCustomSenderEmail(settings.custom_sender_email || '');
            setDomainVerified(settings.domain_verified);
            setSpfVerified(settings.spf_verified);
            setDkimVerified(settings.dkim_verified);
            setDmarcVerified(settings.dmarc_verified);
            setPrimaryColor(settings.primary_color);
            setPromoEnabled(settings.promo_enabled);
            setPromoTitle(settings.promo_title || '');
            setPromoBody(settings.promo_body || '');
            setCustomFooter(settings.custom_footer || '');
            setSendReservation(settings.send_reservation_email);
            setSendCheckin(settings.send_checkin_email);
            setSendCheckout(settings.send_checkout_email);
        } catch (err) {
            console.error('Error loading email settings:', err);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadLogs(page: number = 1) {
        setLogsLoading(true);
        try {
            const data = await emailApi.getLogs(page, 10);
            setLogs(data.logs);
            setLogsPage(data.page);
            setLogsTotal(data.total);
            setLogsPages(data.pages);
        } catch (err) {
            console.error('Error loading logs:', err);
        } finally {
            setLogsLoading(false);
        }
    }

    async function handleSave() {
        setIsSaving(true);
        setError('');
        try {
            await emailApi.updateSettings({
                sending_mode: sendingMode,
                custom_domain: customDomain || null,
                custom_sender_email: customSenderEmail || null,
                primary_color: primaryColor,
                promo_enabled: promoEnabled,
                promo_title: promoTitle || null,
                promo_body: promoBody || null,
                custom_footer: customFooter || null,
                send_reservation_email: sendReservation,
                send_checkin_email: sendCheckin,
                send_checkout_email: sendCheckout,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    }

    function handleExpandLogs() {
        if (!logsExpanded) {
            loadLogs();
        }
        setLogsExpanded(!logsExpanded);
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'sent':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400"><CheckCircle size={12} /> Sent</span>;
            case 'failed':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400"><XCircle size={12} /> Failed</span>;
            case 'skipped':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400"><AlertTriangle size={12} /> Skipped</span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400"><Clock size={12} /> Pending</span>;
        }
    }

    function getEmailTypeLabel(type: string) {
        switch (type) {
            case 'reservation_confirmation': return 'Reservation';
            case 'checkin_welcome': return 'Check-in';
            case 'checkout_receipt': return 'Check-out';
            default: return type;
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-32">
                <Loader2 className="animate-spin text-primary-400" size={24} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ── Sending Mode ─────────────────────────────────── */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Send size={18} />
                    Email Sending Mode
                </h3>

                <div className="space-y-3">
                    {/* Shared mode */}
                    <label
                        className={`block bg-slate-700/50 rounded-lg p-4 cursor-pointer border-2 transition-all ${sendingMode === 'shared' ? 'border-primary-400' : 'border-transparent'
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <input
                                type="radio"
                                value="shared"
                                checked={sendingMode === 'shared'}
                                onChange={() => setSendingMode('shared')}
                                className="mt-1"
                            />
                            <div>
                                <div className="flex items-center gap-2">
                                    <Globe size={16} className="text-primary-400" />
                                    <span className="text-white font-medium">Use Hosila Shared Email</span>
                                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-medium">Recommended</span>
                                </div>
                                <p className="text-sm text-slate-400 mt-1">
                                    Emails sent from <strong>notifications@hosila.app</strong> with your hotel name.
                                    Reply-to set to your hotel's email. No domain setup needed.
                                </p>
                            </div>
                        </div>
                    </label>

                    {/* Custom mode */}
                    <label
                        className={`block bg-slate-700/50 rounded-lg p-4 cursor-pointer border-2 transition-all ${sendingMode === 'custom' ? 'border-primary-400' : 'border-transparent'
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <input
                                type="radio"
                                value="custom"
                                checked={sendingMode === 'custom'}
                                onChange={() => setSendingMode('custom')}
                                className="mt-1"
                            />
                            <div>
                                <div className="flex items-center gap-2">
                                    <Shield size={16} className="text-amber-400" />
                                    <span className="text-white font-medium">Use My Hotel Domain</span>
                                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full font-medium">Pro Feature</span>
                                </div>
                                <p className="text-sm text-slate-400 mt-1">
                                    Emails sent from your own domain (e.g. reservations@grandhotel.com).
                                    Requires DNS verification.
                                </p>
                            </div>
                        </div>
                    </label>

                    {/* Custom domain fields */}
                    {sendingMode === 'custom' && (
                        <div className="bg-slate-700/30 rounded-lg p-4 ml-6 mt-2 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">Custom Domain</label>
                                <input
                                    type="text"
                                    value={customDomain}
                                    onChange={(e) => setCustomDomain(e.target.value)}
                                    placeholder="grandhotel.com"
                                    className="input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">Sender Email</label>
                                <input
                                    type="email"
                                    value={customSenderEmail}
                                    onChange={(e) => setCustomSenderEmail(e.target.value)}
                                    placeholder="reservations@grandhotel.com"
                                    className="input w-full"
                                />
                            </div>

                            {/* Verification Status */}
                            <div className="bg-slate-800/50 rounded-lg p-3">
                                <p className="text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">Domain Verification</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 text-sm">
                                        {domainVerified ? <CheckCircle size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-slate-500" />}
                                        <span className={domainVerified ? 'text-emerald-400' : 'text-slate-500'}>Domain</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        {spfVerified ? <CheckCircle size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-slate-500" />}
                                        <span className={spfVerified ? 'text-emerald-400' : 'text-slate-500'}>SPF</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        {dkimVerified ? <CheckCircle size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-slate-500" />}
                                        <span className={dkimVerified ? 'text-emerald-400' : 'text-slate-500'}>DKIM</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        {dmarcVerified ? <CheckCircle size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-slate-500" />}
                                        <span className={dmarcVerified ? 'text-emerald-400' : 'text-slate-500'}>DMARC</span>
                                    </div>
                                </div>
                                {!domainVerified && (
                                    <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                                        <AlertTriangle size={12} />
                                        Domain not verified. Emails will fallback to Hosila shared domain.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Auto-Send Toggles ───────────────────────────── */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Mail size={18} />
                    Automated Guest Emails
                </h3>

                <div className="space-y-4">
                    {/* Reservation confirmation */}
                    <div className="bg-slate-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-white font-medium">Reservation Confirmation</h4>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Auto-send when a new reservation is created
                                </p>
                            </div>
                            <button
                                onClick={() => setSendReservation(!sendReservation)}
                                className={`transition-colors ${sendReservation ? 'text-status-available' : 'text-slate-500'}`}
                            >
                                {sendReservation ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>
                    </div>

                    {/* Check-in welcome */}
                    <div className="bg-slate-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-white font-medium">Check-in Welcome Email</h4>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Auto-send when a guest checks in
                                </p>
                            </div>
                            <button
                                onClick={() => setSendCheckin(!sendCheckin)}
                                className={`transition-colors ${sendCheckin ? 'text-status-available' : 'text-slate-500'}`}
                            >
                                {sendCheckin ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>
                    </div>

                    {/* Check-out receipt */}
                    <div className="bg-slate-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-white font-medium">Check-out Receipt Email</h4>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Auto-send receipt with charges when a guest checks out
                                </p>
                            </div>
                            <button
                                onClick={() => setSendCheckout(!sendCheckout)}
                                className={`transition-colors ${sendCheckout ? 'text-status-available' : 'text-slate-500'}`}
                            >
                                {sendCheckout ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Branding ────────────────────────────────────── */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Palette size={18} />
                    Email Branding
                </h3>

                <div className="space-y-4">
                    {/* Primary Color */}
                    <div className="bg-slate-700/50 rounded-lg p-4">
                        <label className="block text-sm text-slate-300 mb-2">Brand Color (CTA buttons, accents)</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="w-10 h-10 rounded-lg border-2 border-slate-600 cursor-pointer"
                            />
                            <input
                                type="text"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="input w-28"
                                maxLength={7}
                            />
                            <div
                                className="w-6 h-6 rounded-full"
                                style={{ backgroundColor: primaryColor }}
                            />
                        </div>
                    </div>

                    {/* Custom Footer */}
                    <div className="bg-slate-700/50 rounded-lg p-4">
                        <label className="block text-sm text-slate-300 mb-2">Custom Footer Message (optional)</label>
                        <textarea
                            value={customFooter}
                            onChange={(e) => setCustomFooter(e.target.value)}
                            placeholder="Thank you for choosing Grand Palace Hotel..."
                            className="input w-full h-20 resize-y"
                        />
                    </div>
                </div>
            </div>

            {/* ── Promo Block ─────────────────────────────────── */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Megaphone size={18} />
                    Promotional Content
                </h3>

                <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h4 className="text-white font-medium">Include Promo Block in Emails</h4>
                            <p className="text-sm text-slate-400 mt-0.5">
                                Add a promotional section to guest emails
                            </p>
                        </div>
                        <button
                            onClick={() => setPromoEnabled(!promoEnabled)}
                            className={`transition-colors ${promoEnabled ? 'text-status-available' : 'text-slate-500'}`}
                        >
                            {promoEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                    </div>

                    {promoEnabled && (
                        <div className="space-y-3 mt-4 pt-3 border-t border-slate-600">
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">Promo Title</label>
                                <input
                                    type="text"
                                    value={promoTitle}
                                    onChange={(e) => setPromoTitle(e.target.value)}
                                    placeholder="Discover Our Spa Services"
                                    className="input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">Promo Description</label>
                                <textarea
                                    value={promoBody}
                                    onChange={(e) => setPromoBody(e.target.value)}
                                    placeholder="Enjoy 20% off on all spa treatments during your stay..."
                                    className="input w-full h-20 resize-y"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Save Button ─────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn btn-primary"
                >
                    {isSaving ? (
                        <>
                            <Loader2 size={16} className="animate-spin mr-2" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save size={16} className="mr-2" />
                            Save Email Settings
                        </>
                    )}
                </button>
                {saved && (
                    <span className="text-status-available text-sm flex items-center gap-1">
                        <CheckCircle size={14} /> Settings saved!
                    </span>
                )}
                {error && (
                    <span className="text-red-400 text-sm">{error}</span>
                )}
            </div>

            {/* ── Email Logs ──────────────────────────────────── */}
            <div className="card p-4">
                <button
                    onClick={handleExpandLogs}
                    className="flex items-center justify-between w-full"
                >
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <Mail size={18} />
                        Email Send History
                        {logsTotal > 0 && (
                            <span className="px-2 py-0.5 bg-slate-600 text-slate-300 text-xs rounded-full">{logsTotal}</span>
                        )}
                    </h3>
                    {logsExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </button>

                {logsExpanded && (
                    <div className="mt-4">
                        {logsLoading ? (
                            <div className="flex items-center justify-center h-20">
                                <Loader2 className="animate-spin text-primary-400" size={20} />
                            </div>
                        ) : logs.length > 0 ? (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-600">
                                                <th className="text-left text-slate-400 font-medium pb-2 pr-3">Type</th>
                                                <th className="text-left text-slate-400 font-medium pb-2 pr-3">Guest</th>
                                                <th className="text-left text-slate-400 font-medium pb-2 pr-3">To</th>
                                                <th className="text-left text-slate-400 font-medium pb-2 pr-3">Status</th>
                                                <th className="text-left text-slate-400 font-medium pb-2">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logs.map(log => (
                                                <tr key={log.id} className="border-b border-slate-700/50">
                                                    <td className="py-2 pr-3 text-slate-300">{getEmailTypeLabel(log.email_type)}</td>
                                                    <td className="py-2 pr-3 text-white">{log.guest_name || '—'}</td>
                                                    <td className="py-2 pr-3 text-slate-400 text-xs">{log.recipient_email}</td>
                                                    <td className="py-2 pr-3">{getStatusBadge(log.status)}</td>
                                                    <td className="py-2 text-slate-400 text-xs">
                                                        {new Date(log.sent_at).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {logsPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 mt-4">
                                        <button
                                            onClick={() => loadLogs(logsPage - 1)}
                                            disabled={logsPage <= 1}
                                            className="btn btn-sm text-xs px-3 py-1"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-slate-400">
                                            Page {logsPage} of {logsPages}
                                        </span>
                                        <button
                                            onClick={() => loadLogs(logsPage + 1)}
                                            disabled={logsPage >= logsPages}
                                            className="btn btn-sm text-xs px-3 py-1"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-8">
                                <Mail size={32} className="text-slate-600 mx-auto mb-2" />
                                <p className="text-slate-400 text-sm">No emails sent yet</p>
                                <p className="text-slate-500 text-xs mt-1">Emails will appear here as guests check in, check out, and make reservations.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
