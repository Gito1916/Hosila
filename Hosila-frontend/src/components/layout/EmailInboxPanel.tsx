import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import {
    Mail,
    Inbox,
    Send,
    X,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Copy,
    Phone,
    ExternalLink,
    Loader2,
    RefreshCw,
    Clock,
    UserPlus,
} from 'lucide-react';
import {
    getImportLogs,
    getNeedsAttentionCount,
    type EmailImportLog,
} from '@/services/emailImportService';
import { emailApi, type EmailLog, ensureBackendAwake } from '@/lib/apiClient';
import { requireSupabase } from '@/lib/api';
import { getHotel } from '@/db/settings';

// =========================================================================
// Attention reason display helpers
// =========================================================================

const ATTENTION_REASONS: Record<string, { label: string; description: string; color: string }> = {
    NO_AVAILABILITY: {
        label: 'No Rooms Available',
        description: 'All rooms are occupied for the requested dates. Assign a room or contact the guest to adjust dates.',
        color: 'text-amber-400',
    },
    ROOM_TYPE_FULL: {
        label: 'Room Type Full',
        description: 'The requested room type is fully booked. Another room type may be available.',
        color: 'text-amber-400',
    },
    PARSE_PARTIAL: {
        label: 'Incomplete Data',
        description: 'Some booking details could not be extracted from the email. Review and complete manually.',
        color: 'text-orange-400',
    },
};

function getReasonInfo(reason: string | null) {
    return ATTENTION_REASONS[reason || ''] || {
        label: reason || 'Unknown',
        description: 'This import needs manual review.',
        color: 'text-amber-400',
    };
}

function getStatusConfig(status: string) {
    switch (status) {
        case 'imported':
            return { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Imported' };
        case 'imported_needs_attention':
            return { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Needs Attention' };
        case 'duplicate':
            return { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Duplicate' };
        case 'failed':
            return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' };
        case 'unrecognized':
            return { icon: Mail, color: 'text-muted', bg: 'bg-surface-card/50', label: 'Unknown' };
        default:
            return { icon: Mail, color: 'text-muted', bg: 'bg-surface-card/50', label: status };
    }
}

// =========================================================================
// Main Component
// =========================================================================

export function EmailInboxPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'inbox' | 'outbox'>('inbox');
    const panelRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Hotel settings — loaded directly
    const [emailImportEnabled, setEmailImportEnabled] = useState(false);
    useEffect(() => {
        getHotel().then(h => {
            if (h?.settings?.email_import_enabled) setEmailImportEnabled(true);
        }).catch(() => { });
    }, []);

    // Inbox state (email imports)
    const [importLogs, setImportLogs] = useState<EmailImportLog[]>([]);
    const [inboxLoading, setInboxLoading] = useState(false);
    const [attentionCount, setAttentionCount] = useState(0);

    // Outbox state (guest emails)
    const [outboxLogs, setOutboxLogs] = useState<EmailLog[]>([]);
    const [outboxLoading, setOutboxLoading] = useState(false);
    const [outboxTotal, setOutboxTotal] = useState(0);

    // Clipboard copy feedback
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Load attention count on mount
    useEffect(() => {
        if (emailImportEnabled) {
            getNeedsAttentionCount().then(setAttentionCount).catch(() => { });
        }
    }, [emailImportEnabled]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Load data when panel opens
    const handleOpen = useCallback(() => {
        const opening = !isOpen;
        setIsOpen(!isOpen);
        if (opening) {
            if (emailImportEnabled) {
                loadInbox();
            } else {
                setActiveTab('outbox');
            }
            loadOutbox();
        }
    }, [isOpen, emailImportEnabled]);

    async function loadInbox() {
        setInboxLoading(true);
        try {
            const logs = await getImportLogs(30);
            setImportLogs(logs);
            const count = await getNeedsAttentionCount();
            setAttentionCount(count);
        } catch (err) {
            console.error('Failed to load import logs:', err);
        } finally {
            setInboxLoading(false);
        }
    }

    async function loadOutbox() {
        setOutboxLoading(true);
        try {
            await ensureBackendAwake();
            const data = await emailApi.getLogs(1, 30);
            setOutboxLogs(data.logs);
            setOutboxTotal(data.total);
        } catch (err) {
            console.error('Failed to load outbox logs:', err);
        } finally {
            setOutboxLoading(false);
        }
    }

    function handleCopy(text: string, field: string) {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 1500);
        });
    }

    async function handleResolve(log: EmailImportLog) {
        // Navigate to reservations page, the reservation should appear as "pending" there
        if (log.reservation_id) {
            navigate(`/reservations?highlight=${log.reservation_id}`);
        } else {
            navigate('/reservations');
        }
        setIsOpen(false);
    }

    async function handleDismiss(log: EmailImportLog) {
        try {
            const sb = requireSupabase();
            // Update the import log status to 'imported' (resolved)
            await sb.from('email_import_logs')
                .update({ status: 'imported' })
                .eq('id', log.id);
            // If there's a linked reservation, clear needs_attention
            if (log.reservation_id) {
                await sb.from('reservations')
                    .update({ needs_attention: false })
                    .eq('id', log.reservation_id);
            }
            // Refresh
            await loadInbox();
        } catch (err) {
            console.error('Failed to dismiss:', err);
        }
    }

    const totalBadge = attentionCount;

    // =====================================================================
    // Email outbox status badge helper
    // =====================================================================

    function getOutboxStatusBadge(status: string) {
        switch (status) {
            case 'sent':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400"><CheckCircle size={10} /> Sent</span>;
            case 'failed':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400"><XCircle size={10} /> Failed</span>;
            case 'skipped':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400"><AlertTriangle size={10} /> Skipped</span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-inset/20 text-muted"><Clock size={10} /> Pending</span>;
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

    return (
        <div className="relative" ref={panelRef}>
            {/* Mail Button */}
            <button
                onClick={handleOpen}
                className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg transition-colors relative"
                aria-label="Email inbox"
                title="Email inbox"
            >
                <Mail size={20} />
                {totalBadge > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {totalBadge > 9 ? '9+' : totalBadge}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-[420px] bg-surface-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {/* Header with tabs */}
                    <div className="flex items-center border-b border-border">
                        {emailImportEnabled && (
                            <button
                                onClick={() => setActiveTab('inbox')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'inbox'
                                    ? 'border-primary-400 text-heading'
                                    : 'border-transparent text-muted hover:text-heading'
                                    }`}
                            >
                                <Inbox size={16} />
                                Inbox
                                {attentionCount > 0 && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full font-medium">
                                        {attentionCount}
                                    </span>
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => setActiveTab('outbox')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'outbox'
                                ? 'border-primary-400 text-heading'
                                : 'border-transparent text-muted hover:text-heading'
                                }`}
                        >
                            <Send size={16} />
                            Outbox
                            {outboxTotal > 0 && (
                                <span className="px-1.5 py-0.5 bg-surface-inset text-muted text-xs rounded-full">
                                    {outboxTotal}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 mr-1 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="max-h-[480px] overflow-y-auto">
                        {/* ── INBOX TAB ───────────────────────────── */}
                        {activeTab === 'inbox' && emailImportEnabled && (
                            <>
                                {/* Refresh button */}
                                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                                    <span className="text-xs text-muted">Email imports</span>
                                    <button
                                        onClick={loadInbox}
                                        disabled={inboxLoading}
                                        className="p-1 text-muted hover:text-heading rounded"
                                        title="Refresh"
                                    >
                                        <RefreshCw size={14} className={inboxLoading ? 'animate-spin' : ''} />
                                    </button>
                                </div>

                                {inboxLoading && importLogs.length === 0 ? (
                                    <div className="flex items-center justify-center h-32">
                                        <Loader2 className="animate-spin text-primary-400" size={24} />
                                    </div>
                                ) : importLogs.length === 0 ? (
                                    <div className="p-8 text-center text-muted">
                                        <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No email imports yet</p>
                                        <p className="text-xs mt-1">Imported reservations from OTA emails will appear here.</p>
                                    </div>
                                ) : (
                                    importLogs.map((log) => {
                                        const cfg = getStatusConfig(log.status);
                                        const StatusIcon = cfg.icon;
                                        const isNeedsAttention = log.status === 'imported_needs_attention';
                                        const reasonInfo = getReasonInfo(log.attention_reason);

                                        return (
                                            <div
                                                key={log.id}
                                                className={`p-3 border-b border-border/50 ${isNeedsAttention ? 'bg-amber-500/5 border-l-2 border-l-amber-400' : ''}`}
                                            >
                                                {/* Header row */}
                                                <div className="flex items-start gap-2">
                                                    <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
                                                        <StatusIcon size={14} className={cfg.color} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-heading truncate">
                                                                {log.guest_name || 'Unknown Guest'}
                                                            </span>
                                                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                                                                {cfg.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted">
                                                            <span className="capitalize">{log.source || 'Unknown'}</span>
                                                            {log.booking_ref && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>Ref: {log.booking_ref}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {log.check_in_date && log.check_out_date && (
                                                            <p className="text-xs text-muted mt-0.5">
                                                                {format(new Date(log.check_in_date), 'MMM d')} – {format(new Date(log.check_out_date), 'MMM d, yyyy')}
                                                                {log.requested_room_type && (
                                                                    <span className="ml-1.5">• {log.requested_room_type}</span>
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-muted whitespace-nowrap">
                                                        {formatDistanceToNow(new Date(log.scanned_at), { addSuffix: true })}
                                                    </span>
                                                </div>

                                                {/* Needs Attention: reason + actions */}
                                                {isNeedsAttention && (
                                                    <div className="mt-2 ml-8">
                                                        {/* Reason banner */}
                                                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 mb-2">
                                                            <p className={`text-xs font-medium ${reasonInfo.color}`}>
                                                                ⚠️ {reasonInfo.label}
                                                            </p>
                                                            <p className="text-xs text-muted mt-0.5">
                                                                {reasonInfo.description}
                                                            </p>
                                                        </div>

                                                        {/* Guest contact info */}
                                                        {(log.guest_email || log.guest_phone) && (
                                                            <div className="flex items-center gap-2 mb-2 text-xs">
                                                                <span className="text-muted">💡 Contact guest:</span>
                                                                {log.guest_email && (
                                                                    <button
                                                                        onClick={() => handleCopy(log.guest_email!, `email-${log.id}`)}
                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-raised rounded text-heading hover:bg-surface-inset transition-colors"
                                                                        title="Copy email"
                                                                    >
                                                                        <Mail size={10} />
                                                                        {log.guest_email}
                                                                        <Copy size={10} className="text-muted" />
                                                                        {copiedField === `email-${log.id}` && <span className="text-emerald-400">✓</span>}
                                                                    </button>
                                                                )}
                                                                {log.guest_phone && (
                                                                    <button
                                                                        onClick={() => handleCopy(log.guest_phone!, `phone-${log.id}`)}
                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-raised rounded text-heading hover:bg-surface-inset transition-colors"
                                                                        title="Copy phone"
                                                                    >
                                                                        <Phone size={10} />
                                                                        {log.guest_phone}
                                                                        <Copy size={10} className="text-muted" />
                                                                        {copiedField === `phone-${log.id}` && <span className="text-emerald-400">✓</span>}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Action buttons */}
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleResolve(log)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium rounded-lg transition-colors"
                                                            >
                                                                <UserPlus size={12} />
                                                                Assign Room & Confirm
                                                            </button>
                                                            <button
                                                                onClick={() => handleDismiss(log)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted hover:text-heading hover:bg-surface-raised rounded-lg transition-colors"
                                                            >
                                                                Dismiss
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Error message for failed imports */}
                                                {log.status === 'failed' && log.error_message && (
                                                    <p className="mt-1.5 ml-8 text-xs text-red-400">
                                                        {log.error_message}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </>
                        )}

                        {/* ── OUTBOX TAB ──────────────────────────── */}
                        {activeTab === 'outbox' && (
                            <>
                                {/* Refresh button */}
                                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                                    <span className="text-xs text-muted">Guest emails sent</span>
                                    <button
                                        onClick={loadOutbox}
                                        disabled={outboxLoading}
                                        className="p-1 text-muted hover:text-heading rounded"
                                        title="Refresh"
                                    >
                                        <RefreshCw size={14} className={outboxLoading ? 'animate-spin' : ''} />
                                    </button>
                                </div>

                                {outboxLoading && outboxLogs.length === 0 ? (
                                    <div className="flex items-center justify-center h-32">
                                        <Loader2 className="animate-spin text-primary-400" size={24} />
                                    </div>
                                ) : outboxLogs.length === 0 ? (
                                    <div className="p-8 text-center text-muted">
                                        <Send size={32} className="mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No emails sent yet</p>
                                        <p className="text-xs mt-1">
                                            Reservation confirmations, check-in, and check-out emails will appear here.
                                        </p>
                                    </div>
                                ) : (
                                    outboxLogs.map((log) => (
                                        <div key={log.id} className="p-3 border-b border-border/50 hover:bg-surface-raised/30 transition-colors">
                                            <div className="flex items-start gap-2">
                                                <div className={`p-1.5 rounded-lg ${log.status === 'sent' ? 'bg-emerald-500/10' :
                                                    log.status === 'failed' ? 'bg-red-500/10' : 'bg-surface-card/50'
                                                    }`}>
                                                    <Send size={14} className={
                                                        log.status === 'sent' ? 'text-emerald-400' :
                                                            log.status === 'failed' ? 'text-red-400' : 'text-muted'
                                                    } />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-heading truncate">
                                                            {log.guest_name || 'Guest'}
                                                        </span>
                                                        {getOutboxStatusBadge(log.status)}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted">
                                                        <span>{getEmailTypeLabel(log.email_type)}</span>
                                                        <span>•</span>
                                                        <span className="truncate">{log.recipient_email}</span>
                                                    </div>
                                                    {log.error_message && (
                                                        <p className="text-xs text-red-400 mt-0.5 truncate">
                                                            {log.error_message}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-muted whitespace-nowrap">
                                                    {formatDistanceToNow(new Date(log.sent_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-border px-3 py-2 flex items-center justify-between">
                        <button
                            onClick={() => {
                                navigate('/settings');
                                setIsOpen(false);
                            }}
                            className="text-xs text-muted hover:text-heading flex items-center gap-1 transition-colors"
                        >
                            <ExternalLink size={12} />
                            Email Settings
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
