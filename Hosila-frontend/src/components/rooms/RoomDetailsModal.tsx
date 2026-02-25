import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCountdown } from '@/hooks/useCountdown';
import { useQuery } from '@tanstack/react-query';
import { useServices, useInventoryItems, useHotel } from '@/hooks/useSupabaseData';
import { toast } from '@/lib/errorMessages';
import { checkOut, extendShortRest, extendNightStay, recordPayment, getBookingById } from '@/db/bookings';
import { getUnresolvedReturnables } from '@/db/inventory';
import { createInvoiceFromBooking, createReceipt, getInvoiceByBooking } from '@/db/billing';
import { updateRoomStatus } from '@/db/rooms';
import { getGuestById } from '@/db/guests';
import { requireSupabase } from '@/lib/api';
import { InvoiceView, ReceiptView } from '@/components/billing';
import { CheckoutReconciliation } from '@/components/guests/CheckoutReconciliation';
import type { Room, Booking, RoomStatus, Invoice, Receipt } from '@/types';
import { format } from 'date-fns';
import {
    X,
    Clock,
    User,
    CreditCard,
    Plus,
    CheckCircle,
    Sparkles,
    Wrench,
    Loader2,
    AlertTriangle,
    FileText,
    UtensilsCrossed,
} from 'lucide-react';

interface RoomWithBooking extends Room {
    activeBooking?: Booking;
    guestName?: string;
}

interface RoomDetailsModalProps {
    room: RoomWithBooking;
    onClose: () => void;
}

export function RoomDetailsModal({ room, onClose }: RoomDetailsModalProps) {
    const user = useAuthStore((state) => state.user);
    const [isLoading, setIsLoading] = useState(false);
    const [showPayment, setShowPayment] = useState(false);
    const [showExtend, setShowExtend] = useState(false);
    const [showReconciliation, setShowReconciliation] = useState(false);
    const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
    const [maintenanceReason, setMaintenanceReason] = useState('');
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'pos'>('cash');
    const [extendHours, setExtendHours] = useState(1);
    const [extendNights, setExtendNights] = useState(1);
    const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
    const [currentReceipt, setCurrentReceipt] = useState<Receipt | null>(null);

    const countdown = useCountdown(
        room.status === 'short_rest' && room.activeBooking
            ? new Date(room.activeBooking.planned_checkout)
            : null
    );

    // LIVE BOOKING DATA — replaces useLiveQuery with useQuery polling
    const { data: liveBooking } = useQuery({
        queryKey: ['booking', room.activeBooking?.id],
        queryFn: () => room.activeBooking ? getBookingById(room.activeBooking.id) : undefined,
        enabled: !!room.activeBooking?.id,
        refetchInterval: 3000,
    });

    const activeBooking = liveBooking ?? room.activeBooking;

    // Get guest info
    const { data: guest } = useQuery({
        queryKey: ['guest', activeBooking?.guest_id],
        queryFn: () => activeBooking ? getGuestById(activeBooking.guest_id) : undefined,
        enabled: !!activeBooking?.guest_id,
    });

    // Get payments for this booking
    const { data: payments } = useQuery({
        queryKey: ['booking-payments', activeBooking?.id],
        queryFn: async () => {
            if (!activeBooking) return [];
            const sb = requireSupabase();
            const { data } = await sb.from('payments').select('*').eq('booking_id', activeBooking.id).order('payment_time');
            return data ?? [];
        },
        enabled: !!activeBooking?.id,
        refetchInterval: 3000,
    });

    // Get service orders for this booking
    const { data: serviceOrders } = useQuery({
        queryKey: ['booking-service-orders', activeBooking?.id],
        queryFn: async () => {
            if (!activeBooking) return [];
            const sb = requireSupabase();
            const { data } = await sb.from('service_orders').select('*').eq('booking_id', activeBooking.id);
            return data ?? [];
        },
        enabled: !!activeBooking?.id,
    });

    // Get services and inventory items for names (centralized hooks with tiered caching)
    const { data: services } = useServices();
    const { data: inventoryItems } = useInventoryItems();

    // Create combined lookup map for services, inventory items, and extensions
    const serviceMap = new Map<string, { name: string }>([
        ...(services?.map(s => [s.id, { name: s.name }] as [string, { name: string }]) ?? []),
        ...(inventoryItems?.map(i => [`inv_${i.id}`, { name: i.name }] as [string, { name: string }]) ?? []),
        ['extension', { name: 'Room Stay Extension' }],
    ]);

    // Get hotel settings for tax calculation
    const { data: hotel } = useHotel();
    const accommodationTaxRate = hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0;
    const servicesTaxRate = hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0;

    // Calculate tax for folio display
    const servicesTotal = serviceOrders?.reduce((sum, o) => sum + o.total_price, 0) ?? 0;
    const roomTax = (activeBooking?.rate ?? 0) * (accommodationTaxRate / 100);
    const servicesTax = servicesTotal * (servicesTaxRate / 100);
    const totalTax = roomTax + servicesTax;
    const totalWithTax = (activeBooking?.rate ?? 0) + servicesTotal + totalTax;


    const handleStatusChange = async (newStatus: RoomStatus, reason?: string) => {
        if (!user) return;
        setIsLoading(true);
        try {
            await updateRoomStatus(room.id, newStatus);
            if (newStatus === 'maintenance' && reason) {
                const sb = requireSupabase();
                await sb.from('rooms').update({ maintenance_reason: reason }).eq('id', room.id);
            } else if (newStatus !== 'maintenance') {
                const sb = requireSupabase();
                await sb.from('rooms').update({ maintenance_reason: null }).eq('id', room.id);
            }
            onClose();
        } catch (err) {
            toast.error('Failed to update room status', err);
        } finally {
            setIsLoading(false);
        }
    };

    // View current invoice (generate if not exists)
    const handleViewInvoice = async () => {
        if (!room.activeBooking) return;
        setIsLoading(true);
        try {
            let invoice = await getInvoiceByBooking(room.activeBooking.id);

            if (!invoice) {
                const guestData = await getGuestById(room.activeBooking.guest_id);
                invoice = await createInvoiceFromBooking(
                    room.activeBooking.id,
                    guestData?.name ?? 'Guest',
                    guestData?.phone
                );
            }

            setCurrentInvoice(invoice);
        } catch (err) {
            toast.error('Failed to generate invoice', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial checkout - check for returnables first
    const handleInitiateCheckout = async () => {
        if (!user || !room.activeBooking) return;

        if (room.activeBooking.balance > 0) {
            const proceed = confirm(
                `Guest has outstanding balance of ₦${room.activeBooking.balance.toLocaleString()}.\n\n` +
                `Click OK to proceed with checkout anyway (balance will be waived).\n` +
                `Click Cancel to record payment first.`
            );
            if (!proceed) {
                setShowPayment(true);
                setPaymentAmount(room.activeBooking.balance);
                return;
            }
        }

        const unresolvedReturnables = await getUnresolvedReturnables(room.activeBooking.id);
        if (unresolvedReturnables.length > 0) {
            setShowReconciliation(true);
            return;
        }

        await handleFinalCheckout();
    };

    // Final checkout after reconciliation (or if no returnables)
    const handleFinalCheckout = async () => {
        if (!user || !room.activeBooking) return;

        setIsLoading(true);
        try {
            const guestData = await getGuestById(room.activeBooking.guest_id);

            let invoice = await getInvoiceByBooking(room.activeBooking.id);
            if (!invoice) {
                invoice = await createInvoiceFromBooking(
                    room.activeBooking.id,
                    guestData?.name ?? 'Guest',
                    guestData?.phone
                );
            }

            await checkOut(room.activeBooking.id, user.id);

            if (room.activeBooking.balance <= 0 && room.activeBooking.total_paid > 0) {
                const receipt = await createReceipt(
                    'checkout-final',
                    invoice.id,
                    room.activeBooking.id,
                    guestData?.name ?? 'Guest',
                    room.activeBooking.total_paid,
                    'cash'
                );
                setCurrentReceipt(receipt);
            } else {
                setCurrentInvoice(invoice);
            }
        } catch (err) {
            toast.error('Checkout failed', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecordPayment = async () => {
        if (!user || !room.activeBooking || paymentAmount <= 0) return;

        setIsLoading(true);
        try {
            const paymentId = await recordPayment(room.activeBooking.id, paymentAmount, paymentMethod, user.id);

            let invoice = await getInvoiceByBooking(room.activeBooking.id);

            const guestData = await getGuestById(room.activeBooking.guest_id);

            const receipt = await createReceipt(
                paymentId,
                invoice?.id,
                room.activeBooking.id,
                guestData?.name ?? 'Guest',
                paymentAmount,
                paymentMethod
            );

            setShowPayment(false);
            setPaymentAmount(0);
            setCurrentReceipt(receipt);
        } catch (err) {
            toast.error('Payment recording failed', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExtendShortRest = async () => {
        if (!user || !room.activeBooking) return;

        const additionalRate = (room.short_rest_hourly_rate ?? room.night_rate * 0.15) * extendHours;
        setIsLoading(true);
        try {
            await extendShortRest(room.activeBooking.id, extendHours, additionalRate, user.id);
            setShowExtend(false);
            setExtendHours(1);
        } catch (err) {
            toast.error('Failed to extend short rest', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExtendNightStay = async () => {
        if (!user || !room.activeBooking) return;

        const additionalRate = room.night_rate * extendNights;
        setIsLoading(true);
        try {
            await extendNightStay(room.activeBooking.id, extendNights, additionalRate, user.id);
            setShowExtend(false);
            setExtendNights(1);
        } catch (err) {
            toast.error('Failed to extend stay', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div>
                        <h2 className="text-xl font-bold text-heading">Room {room.room_number}</h2>
                        <p className="text-sm text-muted">{room.room_type}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Occupied/Short Rest - Show booking details */}
                    {(room.status === 'occupied' || room.status === 'short_rest') && room.activeBooking && (
                        <>
                            {/* Guest Info */}
                            <div className="card p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center">
                                        <User className="text-primary-400" size={20} />
                                    </div>
                                    <div>
                                        <p className="text-heading font-medium">{guest?.name ?? 'Guest'}</p>
                                        <p className="text-sm text-muted">{guest?.phone ?? 'No phone'}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="text-muted">Check-in</p>
                                        <p className="text-heading">{format(new Date(room.activeBooking.check_in_time), 'MMM d, h:mm a')}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted">Checkout</p>
                                        <p className="text-heading">{format(new Date(room.activeBooking.planned_checkout), 'MMM d, h:mm a')}</p>
                                    </div>
                                </div>

                                {/* Short rest countdown */}
                                {room.status === 'short_rest' && (
                                    <div className={`mt-3 p-3 rounded-lg ${countdown.isExpiringSoon || countdown.isExpired ? 'bg-status-dirty/20' : 'bg-status-shortRest/20'}`}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted">Time Remaining</span>
                                            <span className={`font-mono text-lg font-bold ${countdown.isExpiringSoon || countdown.isExpired ? 'text-status-dirty' : 'text-status-shortRest'}`}>
                                                {countdown.isExpired ? 'OVERTIME' : countdown.timeLeft}
                                            </span>
                                        </div>
                                        {countdown.isExpiringSoon && !countdown.isExpired && (
                                            <p className="text-xs text-status-dirty mt-1 flex items-center gap-1">
                                                <AlertTriangle size={12} /> Expiring soon
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Folio Summary */}
                            <div className="card p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-medium text-heading flex items-center gap-2">
                                        <CreditCard size={18} />
                                        Guest Folio
                                    </h3>
                                    <button
                                        onClick={handleViewInvoice}
                                        disabled={isLoading}
                                        className="btn btn-secondary text-xs py-1 px-2"
                                    >
                                        <FileText size={14} className="mr-1" />
                                        View Invoice
                                    </button>
                                </div>

                                {/* Charges breakdown */}
                                <div className="space-y-1 text-sm">
                                    {/* Room charge */}
                                    <div className="flex justify-between py-1">
                                        <span className="text-muted">
                                            Room {room.room_number} ({activeBooking?.booking_type === 'night' ? 'Night' : 'Short Rest'})
                                        </span>
                                        <span className="text-heading">₦{(activeBooking?.rate ?? 0).toLocaleString()}</span>
                                    </div>

                                    {/* Service orders with details */}
                                    {serviceOrders && serviceOrders.length > 0 && (
                                        <div className="border-t border-border/50 pt-2 mt-2">
                                            <p className="text-xs text-muted mb-1 flex items-center gap-1">
                                                <UtensilsCrossed size={12} />
                                                Services Ordered
                                            </p>
                                            {serviceOrders.map((order) => {
                                                const service = serviceMap.get(order.service_id);
                                                const displayName = order.service_id === 'extension' && order.notes
                                                    ? order.notes
                                                    : service?.name ?? 'Service';
                                                return (
                                                    <div key={order.id} className="flex justify-between py-1 text-xs">
                                                        <span className="text-muted">
                                                            {displayName} {order.service_id !== 'extension' && `× ${order.quantity}`}
                                                            {order.status !== 'delivered' && (
                                                                <span className="ml-1 text-amber-400">({order.status})</span>
                                                            )}
                                                        </span>
                                                        <span className="text-muted">₦{order.total_price.toLocaleString()}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Totals with Tax */}
                                    <div className="border-t border-border pt-2 mt-2 space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Subtotal</span>
                                            <span className="text-muted">₦{((activeBooking?.rate ?? 0) + servicesTotal).toLocaleString()}</span>
                                        </div>
                                        {totalTax > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted">Tax</span>
                                                <span className="text-muted">₦{totalTax.toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between font-medium">
                                            <span className="text-muted">Total (incl. tax)</span>
                                            <span className="text-heading">₦{totalWithTax.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted">Total Paid</span>
                                            <span className="text-status-available">₦{(activeBooking?.total_paid ?? 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-lg pt-1">
                                            <span className="text-heading">Balance Due</span>
                                            <span className={(totalWithTax - (activeBooking?.total_paid ?? 0)) > 0 ? 'text-status-dirty' : 'text-status-available'}>
                                                ₦{Math.max(0, totalWithTax - (activeBooking?.total_paid ?? 0)).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Payments history */}
                                {payments && payments.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-border">
                                        <p className="text-xs text-muted mb-2">Payment History</p>
                                        {payments.map((p) => (
                                            <div key={p.id} className="flex justify-between text-xs text-muted py-0.5">
                                                <span>{format(new Date(p.payment_time), 'MMM d, h:mm a')} • {p.payment_method}</span>
                                                <span className="text-status-available">₦{p.amount.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Payment Form */}
                            {showPayment && (
                                <div className="card p-4">
                                    <h3 className="font-medium text-heading mb-3">Record Payment</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="label">Amount</label>
                                            <input
                                                type="number"
                                                value={paymentAmount}
                                                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                                                className="input"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="label">Method</label>
                                            <select
                                                value={paymentMethod}
                                                onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'transfer' | 'pos')}
                                                className="input"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="transfer">Transfer</option>
                                                <option value="pos">POS</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowPayment(false)} className="btn btn-secondary flex-1">
                                                Cancel
                                            </button>
                                            <button onClick={handleRecordPayment} disabled={isLoading || paymentAmount <= 0} className="btn btn-primary flex-1">
                                                {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Extend Form - Short Rest */}
                            {showExtend && room.status === 'short_rest' && (
                                <div className="card p-4">
                                    <h3 className="font-medium text-heading mb-3">Extend Short Rest</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="label">Additional Hours</label>
                                            <select
                                                value={extendHours}
                                                onChange={(e) => setExtendHours(Number(e.target.value))}
                                                className="input"
                                            >
                                                {[1, 2, 3, 4, 5, 6].map((h) => (
                                                    <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="text-sm text-muted">
                                            Additional charge: ₦{((room.short_rest_hourly_rate ?? room.night_rate * 0.15) * extendHours).toLocaleString()}
                                        </p>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowExtend(false)} className="btn btn-secondary flex-1">
                                                Cancel
                                            </button>
                                            <button onClick={handleExtendShortRest} disabled={isLoading} className="btn btn-primary flex-1">
                                                {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Extend'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Extend Form - Night Stay */}
                            {showExtend && room.status === 'occupied' && (
                                <div className="card p-4">
                                    <h3 className="font-medium text-heading mb-3">Extend Stay</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="label">Additional Nights</label>
                                            <select
                                                value={extendNights}
                                                onChange={(e) => setExtendNights(Number(e.target.value))}
                                                className="input"
                                            >
                                                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                                                    <option key={n} value={n}>{n} night{n > 1 ? 's' : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="text-sm text-muted">
                                            Additional charge: ₦{(room.night_rate * extendNights).toLocaleString()}
                                        </p>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowExtend(false)} className="btn btn-secondary flex-1">
                                                Cancel
                                            </button>
                                            <button onClick={handleExtendNightStay} disabled={isLoading} className="btn btn-primary flex-1">
                                                {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Extend'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            {!showPayment && !showExtend && (
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => setShowPayment(true)} className="btn btn-secondary flex-1">
                                        <Plus size={16} className="mr-1" /> Payment
                                    </button>
                                    {(room.status === 'short_rest' || room.status === 'occupied') && (
                                        <button onClick={() => setShowExtend(true)} className="btn btn-secondary flex-1">
                                            <Clock size={16} className="mr-1" /> Extend
                                        </button>
                                    )}
                                    <button onClick={handleInitiateCheckout} disabled={isLoading} className="btn btn-primary flex-1">
                                        <CheckCircle size={16} className="mr-1" />
                                        {isLoading ? 'Processing...' : 'Check Out'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Dirty Room */}
                    {room.status === 'dirty' && (
                        <div className="space-y-4">
                            <div className="text-center py-6">
                                <Sparkles size={48} className="mx-auto text-status-dirty mb-3" />
                                <p className="text-heading font-medium">Room needs cleaning</p>
                                <p className="text-sm text-muted">Mark as available when cleaned</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowMaintenanceForm(true)}
                                    className="btn btn-secondary flex-1"
                                >
                                    <Wrench size={16} className="mr-1" /> Set Maintenance
                                </button>
                                <button
                                    onClick={() => handleStatusChange('available')}
                                    disabled={isLoading}
                                    className="btn btn-success flex-1"
                                >
                                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Mark as Clean'}
                                </button>
                            </div>
                            {/* Maintenance Form */}
                            {showMaintenanceForm && (
                                <div className="card p-4 border-amber-500/30 bg-amber-500/5">
                                    <h4 className="font-medium text-heading mb-3 flex items-center gap-2">
                                        <Wrench size={16} className="text-amber-400" />
                                        Set Room to Maintenance
                                    </h4>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="label">Reason for Maintenance</label>
                                            <input
                                                type="text"
                                                value={maintenanceReason}
                                                onChange={(e) => setMaintenanceReason(e.target.value)}
                                                placeholder="e.g., AC repair, plumbing issue..."
                                                className="input"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setShowMaintenanceForm(false); setMaintenanceReason(''); }}
                                                className="btn btn-secondary flex-1"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => handleStatusChange('maintenance', maintenanceReason)}
                                                disabled={isLoading}
                                                className="btn flex-1 bg-amber-500 hover:bg-amber-600 text-heading"
                                            >
                                                {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Confirm'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Maintenance */}
                    {room.status === 'maintenance' && (
                        <div className="space-y-4">
                            <div className="text-center py-6">
                                <Wrench size={48} className="mx-auto text-status-maintenance mb-3" />
                                <p className="text-heading font-medium">Room under maintenance</p>
                                {room.maintenance_reason && (
                                    <p className="text-sm text-amber-400 mt-2">
                                        🔧 {room.maintenance_reason}
                                    </p>
                                )}
                                <p className="text-sm text-muted mt-2">Mark as available when ready</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleStatusChange('dirty')} disabled={isLoading} className="btn btn-secondary flex-1">
                                    Mark Dirty
                                </button>
                                <button onClick={() => handleStatusChange('available')} disabled={isLoading} className="btn btn-success flex-1">
                                    Mark Available
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Checkout Reconciliation Modal */}
            {showReconciliation && room.activeBooking && user && (
                <CheckoutReconciliation
                    bookingId={room.activeBooking.id}
                    performedBy={user.id}
                    onComplete={async () => {
                        setShowReconciliation(false);
                        await handleFinalCheckout();
                    }}
                    onCancel={() => setShowReconciliation(false)}
                />
            )}

            {/* Invoice Modal */}
            {currentInvoice && (
                <InvoiceView
                    invoice={currentInvoice}
                    onClose={() => {
                        setCurrentInvoice(null);
                        onClose();
                    }}
                />
            )}

            {/* Receipt Modal */}
            {currentReceipt && (
                <ReceiptView
                    receipt={currentReceipt}
                    onClose={() => {
                        setCurrentReceipt(null);
                        onClose();
                    }}
                />
            )}
        </div>
    );
}
