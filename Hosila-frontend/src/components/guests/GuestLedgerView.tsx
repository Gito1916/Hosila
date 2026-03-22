import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { calculateFolio, formatCurrency, type FolioCalculations } from '@/utils/folio';
import { recordPayment, extendNightStay, extendShortRest } from '@/db/bookings';
import { emailApi } from '@/lib/apiClient';
import { issueAmenity, getUnresolvedReturnables } from '@/db/inventory';
import { createServiceCharge } from '@/db/services';
import { useIsRestricted } from '@/hooks/useSubscription';
import { createInvoiceFromBooking, createReceipt, getInvoiceByBooking } from '@/db/billing';
import { getGuestById } from '@/db/guests';
import { CheckoutReconciliation } from './CheckoutReconciliation';
import { toast } from '@/lib/errorMessages';
import type { Guest, Booking, Room, PaymentMethod } from '@/types';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
    User,
    Clock,
    Plus,
    Minus,
    Loader2,
    ShoppingBag,
    Car,
    Shirt,
    Sparkles,
    Utensils,
    LogOut,
    CreditCard,
    AlertTriangle,
    FileText,
    Send,
    Printer,
} from 'lucide-react';
import { InvoiceView } from '@/components/billing/InvoiceReceipt';
import { AmenitiesSelection, type AmenitySelection } from '@/components/rooms/AmenitiesSelection';
import { getHotel } from '@/db/settings';

interface GuestLedgerViewProps {
    guest: Guest;
    booking: Booking;
    room?: Room;
}

// Manual service categories
const manualServices = [
    { id: 'laundry', name: 'Laundry', icon: Shirt, defaultPrice: 2000 },
    { id: 'car_wash', name: 'Car Wash', icon: Car, defaultPrice: 3000 },
    { id: 'cleaning', name: 'Extra Cleaning', icon: Sparkles, defaultPrice: 1500 },
    { id: 'other', name: 'Other Service', icon: ShoppingBag, defaultPrice: 0 },
];

export function GuestLedgerView({ guest, booking, room }: GuestLedgerViewProps) {
    const user = useAuthStore((state) => state.user);
    const navigate = useNavigate();
    const isRestricted = useIsRestricted();
    const [folio, setFolio] = useState<FolioCalculations | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Modal states
    const [showPayment, setShowPayment] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

    const [showExtend, setShowExtend] = useState(false);
    const [extendUnits, setExtendUnits] = useState(1);
    const [extendRate, setExtendRate] = useState(0);

    const [showAddService, setShowAddService] = useState(false);
    const [selectedService, setSelectedService] = useState<string | null>(null);
    const [serviceAmount, setServiceAmount] = useState(0);
    const [serviceNotes, setServiceNotes] = useState('');
    const [serviceTaxable, setServiceTaxable] = useState(false);

    const [showAmenities, setShowAmenities] = useState(false);
    const [amenitySelections, setAmenitySelections] = useState<AmenitySelection[]>([]);

    // Invoice states
    const [showInvoiceMenu, setShowInvoiceMenu] = useState(false);
    const [showInvoice, setShowInvoice] = useState(false);
    const [currentInvoice, setCurrentInvoice] = useState<any>(null);
    const [isSendingInvoice, setIsSendingInvoice] = useState(false);

    // Checkout flow states
    const [showReconciliation, setShowReconciliation] = useState(false);

    // Get hotel settings for credit limit
    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });
    const creditLimitEnabled = hotel?.settings?.credit_limit_enabled ?? false;
    const creditLimitAmount = hotel?.settings?.credit_limit_amount ?? 50000;

    // Load folio
    const loadFolio = useCallback(async () => {
        if (booking) {
            const f = await calculateFolio(booking.id);
            setFolio(f);
        }
    }, [booking]);

    useEffect(() => {
        loadFolio();
    }, [loadFolio]);

    // Check if credit limit is exceeded
    const isOverCreditLimit = creditLimitEnabled && folio && folio.balance > creditLimitAmount;

    // Derived info
    const isShortRest = booking.booking_type === 'short_rest';

    // Default rate for extension
    useEffect(() => {
        if (room) {
            setExtendRate(isShortRest
                ? (room.short_rest_hourly_rate ?? room.night_rate * 0.15)
                : room.night_rate
            );
        }
    }, [room, isShortRest]);

    // Actions
    const handleRecordPayment = async () => {
        if (!user || paymentAmount <= 0) return;
        setIsLoading(true);
        try {
            await recordPayment(booking.id, paymentAmount, paymentMethod, user.id);
            setShowPayment(false);
            setPaymentAmount(0);
            await loadFolio();
        } catch (err) {
            toast.error('Payment recording failed', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExtendStay = async () => {
        if (!user || extendUnits <= 0 || extendRate <= 0) return;
        setIsLoading(true);
        try {
            if (isShortRest) {
                await extendShortRest(booking.id, extendUnits, extendRate * extendUnits, user.id);
            } else {
                await extendNightStay(booking.id, extendUnits, extendRate * extendUnits, user.id);
            }
            setShowExtend(false);
            setExtendUnits(1);
            await loadFolio();
        } catch (err) {
            toast.error('Failed to extend stay', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddService = async () => {
        if (!user || !selectedService || serviceAmount <= 0) return;
        setIsLoading(true);
        try {
            const svcTaxRate = serviceTaxable ? (hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0) : 0;
            await createServiceCharge({
                bookingId: booking.id,
                guestId: guest?.id,
                serviceId: selectedService,
                serviceName: manualServices.find(s => s.id === selectedService)?.name ?? 'Service',
                amount: serviceAmount,
                taxRate: svcTaxRate,
                notes: serviceNotes,
                createdBy: user.id,
            });
            setShowAddService(false);
            setSelectedService(null);
            setServiceAmount(0);
            setServiceNotes('');
            setServiceTaxable(false);
            await loadFolio();
        } catch (err) {
            toast.error('Failed to add service charge', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssueAmenities = async () => {
        if (!user || !room || amenitySelections.length === 0) return;
        setIsLoading(true);
        try {
            for (const amenity of amenitySelections) {
                await issueAmenity({
                    bookingId: booking.id,
                    roomId: room.id,
                    itemId: amenity.itemId,
                    quantity: amenity.quantity,
                    issuedBy: user.id,
                });
            }
            setShowAmenities(false);
            setAmenitySelections([]);
            await loadFolio();
        } catch (err) {
            toast.error('Failed to issue amenities', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAmenityChange = useCallback((selections: AmenitySelection[]) => {
        setAmenitySelections(selections);
    }, []);

    // ── Invoice handlers ──
    const handlePrepareInvoice = async () => {
        try {
            let invoice = await getInvoiceByBooking(booking.id);
            if (!invoice) {
                invoice = await createInvoiceFromBooking(booking.id, guest.name, guest.phone ?? undefined);
            }
            return invoice;
        } catch (err) {
            toast.error('Failed to generate invoice', err);
            return null;
        }
    };

    const handlePrintInvoice = async () => {
        setShowInvoiceMenu(false);
        const invoice = await handlePrepareInvoice();
        if (invoice) {
            setCurrentInvoice(invoice);
            setShowInvoice(true);
        }
    };

    const handleSendInvoice = async () => {
        setShowInvoiceMenu(false);
        if (!guest.email) {
            toast.error('Guest has no email address on file');
            return;
        }
        setIsSendingInvoice(true);
        try {
            // Check if guest emails feature is enabled
            const hotelData = await getHotel();
            if (!hotelData?.settings?.guest_emails_enabled) {
                toast.error('Guest email automation is disabled', 'Enable it in Settings → Advanced to send emails.');
                return;
            }
            await emailApi.sendCheckoutEmail(booking.id);
            toast.success(`Invoice sent to ${guest.email}`);
        } catch (err) {
            toast.error('Failed to send invoice', err);
        } finally {
            setIsSendingInvoice(false);
        }
    };

    // ── Multi-step checkout flow ──
    const handleCheckOut = async () => {
        if (!user || !folio) return;

        // Step 1: Balance check — offer option to pay or waive
        if (folio.balance > 0) {
            const proceed = confirm(
                `Guest has outstanding balance of ${formatCurrency(folio.balance)}.\n\n` +
                `Click OK to proceed with checkout anyway (balance will be waived).\n` +
                `Click Cancel to record payment first.`
            );
            if (!proceed) {
                setPaymentAmount(folio.balance);
                setShowPayment(true);
                return;
            }
        }

        // Step 2: Check for unreturned amenities
        try {
            const unresolvedReturnables = await getUnresolvedReturnables(booking.id);
            if (unresolvedReturnables.length > 0) {
                setShowReconciliation(true);
                return;
            }
        } catch {
            // If amenity check fails, proceed anyway
        }

        // Step 3: Final checkout
        await handleFinalCheckout();
    };

    const handleFinalCheckout = async () => {
        if (!user) return;
        setShowReconciliation(false);
        setIsLoading(true);
        try {
            // Auto-generate invoice
            const guestData = await getGuestById(guest.id);
            let invoice = await getInvoiceByBooking(booking.id);
            if (!invoice) {
                invoice = await createInvoiceFromBooking(
                    booking.id,
                    guestData?.name ?? guest.name,
                    guestData?.phone
                );
            }

            // Perform checkout
            const { checkOut } = await import('@/db/bookings');
            await checkOut(booking.id, user.id);

            // Auto-generate receipt if fully paid
            if (booking.total_paid > 0) {
                try {
                    await createReceipt(
                        'checkout-final',
                        invoice.id,
                        booking.id,
                        guestData?.name ?? guest.name,
                        booking.total_paid,
                        'cash'
                    );
                } catch {
                    // Receipt generation is non-critical
                }
            }

            toast.success('Checked out', 'Guest has been checked out and room released.');
            navigate('/bookings');
        } catch (err) {
            toast.error('Checkout failed', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (!folio) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 size={32} className="animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Credit Limit Warning Banner */}
            {isOverCreditLimit && (
                <div className="p-4 bg-amber-500/20 border border-amber-500/50 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={24} className="text-amber-400 flex-shrink-0" />
                    <div>
                        <p className="text-amber-400 font-semibold">Credit Limit Exceeded</p>
                        <p className="text-amber-300/80 text-sm">
                            Guest balance ({formatCurrency(folio.balance)}) exceeds the credit limit of {formatCurrency(creditLimitAmount)}.
                            Consider collecting payment before adding more charges.
                        </p>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="card p-5 bg-surface-card border border-border overflow-visible">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 overflow-visible">
                    {/* Left: Room & Guest Info */}
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-bold text-heading">Room {room?.room_number ?? '?'} Ledger</h1>
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-status-occupied/20 text-status-occupied border border-status-occupied/50">
                                ACTIVE
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-muted text-sm">
                            <span className="flex items-center gap-1">
                                <User size={14} /> Guest: <span className="text-heading font-medium">{guest.name}</span>
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock size={14} /> Check-out: <span className="text-heading font-medium">{format(new Date(booking.planned_checkout), 'MMM d, yyyy')}</span>
                            </span>
                        </div>
                    </div>

                    {/* Right: Balance & Actions */}
                    <div className="flex items-center gap-4 bg-surface-raised/30 p-3 rounded-xl border border-border overflow-visible">
                        <div className="text-right">
                            <p className="text-xs text-muted uppercase font-semibold">Outstanding</p>
                            <p className={`text-xl font-bold ${folio.balance > 0 ? 'text-status-dirty' : 'text-status-available'}`}>
                                {formatCurrency(folio.balance)}
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <button
                                onClick={() => {
                                    setPaymentAmount(folio.balance);
                                    setShowPayment(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
                            >
                                <CreditCard size={14} />
                                Take Payment
                            </button>
                            {/* Invoice Button with dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowInvoiceMenu(!showInvoiceMenu)}
                                    disabled={isSendingInvoice}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-card hover:bg-surface-raised text-heading border border-border transition-colors w-full"
                                >
                                    {isSendingInvoice ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                                    Invoice
                                </button>
                                {showInvoiceMenu && (
                                    <div className="absolute right-0 top-full mt-1 bg-surface-card border border-border rounded-lg shadow-xl z-50 overflow-hidden min-w-[150px]">
                                        <button
                                            onClick={handleSendInvoice}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-heading hover:bg-surface-raised transition-colors"
                                        >
                                            <Send size={13} className="text-blue-400" />
                                            Send to Email
                                        </button>
                                        <div className="h-px bg-border" />
                                        <button
                                            onClick={handlePrintInvoice}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-heading hover:bg-surface-raised transition-colors"
                                        >
                                            <Printer size={13} className="text-emerald-400" />
                                            Print Invoice
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Left Column: Transaction History Table */}
                <div className="lg:col-span-2 card p-0 overflow-hidden flex flex-col h-full">
                    <div className="p-4 border-b border-border bg-surface-card/50">
                        <h3 className="font-semibold text-heading">Transaction History</h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-surface-raised/50 text-muted uppercase text-xs">
                                <tr>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Description</th>
                                    <th className="p-3">Type</th>
                                    <th className="p-3 text-right">Amount</th>
                                    <th className="p-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {/* FIFO Charges */}
                                {folio.charges.map((charge) => (
                                    <tr key={charge.id} className="hover:bg-surface-card/50 transition-colors">
                                        <td className="p-3 text-muted whitespace-nowrap">
                                            {format(charge.date, 'MMM d, h:mm a')}
                                        </td>
                                        <td className="p-3 text-heading">
                                            {charge.description}
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase
                                                ${charge.type === 'room' ? 'bg-blue-500/20 text-blue-400' :
                                                    charge.type === 'restaurant' ? 'bg-orange-500/20 text-orange-400' :
                                                        'bg-purple-500/20 text-purple-400'}`}>
                                                {charge.type}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right font-medium text-heading">
                                            {formatCurrency(charge.amount)}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase
                                                ${charge.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                                                    charge.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-red-500/20 text-red-400'}`}>
                                                {charge.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}

                                {/* Payments */}
                                {folio.payments.map((payment) => (
                                    <tr key={payment.id} className="bg-green-500/5 hover:bg-green-500/10 transition-colors">
                                        <td className="p-3 text-muted whitespace-nowrap">
                                            {format(new Date(payment.payment_time), 'MMM d, h:mm a')}
                                        </td>
                                        <td className="p-3 text-heading italic">
                                            Payment Received ({payment.payment_method})
                                        </td>
                                        <td className="p-3">
                                            <span className="px-2 py-0.5 rounded text-xs font-medium uppercase bg-green-500/20 text-green-400">
                                                PAYMENT
                                            </span>
                                        </td>
                                        <td className="p-3 text-right font-bold text-green-400">
                                            -{formatCurrency(payment.amount)}
                                        </td>
                                        <td className="p-3 text-center text-muted">
                                            -
                                        </td>
                                    </tr>
                                ))}

                                {folio.charges.length === 0 && folio.payments.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted">
                                            No transactions yet
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Column: Sidebar Actions */}
                <div className="space-y-4">
                    {/* Guest Actions */}
                    <div className="card p-0 overflow-hidden">
                        <div className="p-3 border-b border-border bg-surface-card/50">
                            <h3 className="font-semibold text-heading text-sm uppercase">Guest Actions</h3>
                        </div>
                        <div className="p-3 flex flex-col gap-2">
                            <button
                                onClick={() => setShowExtend(true)}
                                className="btn btn-secondary justify-start text-left border-border hover:border-primary-500 hover:text-primary-400 group"
                            >
                                <Plus size={18} className="mr-2 text-muted group-hover:text-primary-500" />
                                Extend Stay
                            </button>
                            {!isRestricted && (
                                <>
                                    <button
                                        onClick={() => setShowAddService(true)}
                                        className="btn btn-secondary justify-start text-left border-border hover:border-purple-500 hover:text-purple-400 group"
                                    >
                                        <ShoppingBag size={18} className="mr-2 text-muted group-hover:text-purple-500" />
                                        Add Service
                                    </button>
                                    <button
                                        onClick={() => setShowAmenities(true)}
                                        className="btn btn-secondary justify-start text-left border-border hover:border-amber-500 hover:text-amber-400 group"
                                    >
                                        <Sparkles size={18} className="mr-2 text-muted group-hover:text-amber-500" />
                                        Issue Amenities
                                    </button>
                                    <button
                                        onClick={() => navigate('/restaurant')}
                                        className="btn btn-secondary justify-start text-left border-border hover:border-orange-500 hover:text-orange-400 group"
                                    >
                                        <Utensils size={18} className="mr-2 text-muted group-hover:text-orange-500" />
                                        Order Meals
                                    </button>
                                </>
                            )}
                            <hr className="border-border my-1" />
                            <button
                                onClick={handleCheckOut}
                                className="btn btn-secondary justify-start text-left border-border hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 group"
                            >
                                <LogOut size={18} className="mr-2 text-muted group-hover:text-red-500" />
                                Check Out Guest
                            </button>
                        </div>
                    </div>

                    {/* Room Info Summary */}
                    <div className="card p-4">
                        <h3 className="font-semibold text-heading text-sm uppercase mb-3 text-muted">Booking Summary</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-start">
                                <span className="text-muted">Room Charges</span>
                                <div className="text-right">
                                    <span className="text-heading block">{formatCurrency(folio.room_charges)}</span>
                                    {folio.room_tax > 0 && (
                                        <span className="text-xs text-muted block">Inc. {formatCurrency(folio.room_tax)} Tax</span>
                                    )}
                                </div>
                            </div>

                            {(folio.service_charges > 0 || folio.service_tax > 0) && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-muted">Service Charges</span>
                                        <span className="text-heading">{formatCurrency(folio.service_charges)}</span>
                                    </div>
                                    {folio.service_tax > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-muted">Service Breakdown</span>
                                            <div className="text-right text-xs text-muted">
                                                <span>Tax: {formatCurrency(folio.service_tax)}</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="border-t border-border pt-2 flex justify-between font-bold">
                                <span className="text-heading">Total</span>
                                <span className="text-heading">{formatCurrency(folio.total_charges)}</span>
                            </div>

                            <div className="flex justify-between">
                                <span className="text-muted">Total Paid</span>
                                <span className="text-green-400">{formatCurrency(folio.total_paid)}</span>
                            </div>
                            <div className="border-t border-border pt-2 flex justify-between font-bold">
                                <span className="text-heading">Balance</span>
                                <span className={folio.balance > 0 ? 'text-status-dirty' : 'text-status-available'}>
                                    {formatCurrency(folio.balance)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {/* Payment Modal */}
            {showPayment && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-card rounded-xl border border-border w-full max-w-sm p-4 space-y-4 animate-scale-up">
                        <h3 className="text-lg font-bold text-heading">Record Payment</h3>

                        <div>
                            <label className="label">Amount</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                <input
                                    type="number"
                                    value={paymentAmount || ''}
                                    onChange={(e) => setPaymentAmount(parseInt(e.target.value) || 0)}
                                    className="input pl-8"
                                    placeholder="0"
                                    autoFocus
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setPaymentAmount(folio.balance)}
                                className="text-xs text-primary-400 hover:text-primary-300 mt-1"
                            >
                                Pay full balance: ₦{folio.balance.toLocaleString()}
                            </button>
                        </div>

                        <div>
                            <label className="label">Payment Method</label>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                                className="input"
                            >
                                <option value="cash">Cash</option>
                                <option value="transfer">Bank Transfer</option>
                                <option value="pos">POS</option>
                            </select>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowPayment(false)}
                                className="btn btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRecordPayment}
                                disabled={isLoading || paymentAmount <= 0}
                                className="btn btn-primary flex-1 bg-green-600 hover:bg-green-700 border-none"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Confirm Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Extend Stay Modal */}
            {showExtend && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-card rounded-xl border border-border w-full max-w-sm p-4 space-y-4 animate-scale-up">
                        <h3 className="text-lg font-bold text-heading">Extend Stay</h3>

                        <div>
                            <label className="label">{isShortRest ? 'Additional Hours' : 'Additional Nights'}</label>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setExtendUnits(Math.max(1, extendUnits - 1))}
                                    className="btn btn-secondary px-3"
                                >
                                    <Minus size={16} />
                                </button>
                                <span className="text-2xl font-bold text-heading flex-1 text-center">
                                    {extendUnits}
                                </span>
                                <button
                                    onClick={() => setExtendUnits(extendUnits + 1)}
                                    className="btn btn-primary px-3"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="label">Rate per {isShortRest ? 'hour' : 'night'}</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                <input
                                    type="number"
                                    value={extendRate || ''}
                                    onChange={(e) => setExtendRate(parseInt(e.target.value) || 0)}
                                    className="input pl-8"
                                />
                            </div>
                        </div>

                        <div className="bg-surface-raised/50 rounded-lg p-3 text-center">
                            <p className="text-sm text-muted">Total Extension Cost</p>
                            <p className="text-xl font-bold text-heading">
                                ₦{(extendUnits * extendRate).toLocaleString()}
                            </p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowExtend(false)}
                                className="btn btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleExtendStay}
                                disabled={isLoading || extendUnits <= 0 || extendRate <= 0}
                                className="btn btn-primary flex-1"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Extend'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Service Modal */}
            {showAddService && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-card rounded-xl border border-border w-full max-w-sm p-4 space-y-4 animate-scale-up">
                        <h3 className="text-lg font-bold text-heading">Add Service Charge</h3>

                        <div className="grid grid-cols-2 gap-2">
                            {manualServices.map(svc => (
                                <button
                                    key={svc.id}
                                    onClick={() => {
                                        setSelectedService(svc.id);
                                        if (svc.defaultPrice > 0) setServiceAmount(svc.defaultPrice);
                                    }}
                                    className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-colors ${selectedService === svc.id
                                        ? 'border-primary-500 bg-primary-500/20'
                                        : 'border-border hover:border-border-strong'
                                        }`}
                                >
                                    <svc.icon size={20} className="text-muted" />
                                    <span className="text-sm text-heading">{svc.name}</span>
                                </button>
                            ))}
                        </div>

                        <div>
                            <label className="label">Amount</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₦</span>
                                <input
                                    type="number"
                                    value={serviceAmount || ''}
                                    onChange={(e) => setServiceAmount(parseInt(e.target.value) || 0)}
                                    className="input pl-8"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Taxable Toggle */}
                        {(() => {
                            const svcTaxRate = hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0;
                            const svcTaxAmount = serviceTaxable && svcTaxRate > 0 ? Math.round(serviceAmount * (svcTaxRate / 100) * 100) / 100 : 0;
                            const svcTotal = Math.round((serviceAmount + svcTaxAmount) * 100) / 100;
                            return (
                                <>
                                    <div className="flex items-center justify-between bg-surface-raised/50 rounded-lg p-3">
                                        <div>
                                            <label className="text-sm text-heading font-medium">Taxable</label>
                                            <p className="text-xs text-muted">
                                                {svcTaxRate > 0 ? `Add ${svcTaxRate}% tax` : 'No tax rate configured'}
                                            </p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={serviceTaxable}
                                                onChange={(e) => setServiceTaxable(e.target.checked)}
                                                disabled={svcTaxRate <= 0}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-border-strong peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 peer-disabled:opacity-50"></div>
                                        </label>
                                    </div>
                                    {/* Tax Preview */}
                                    {serviceTaxable && svcTaxRate > 0 && serviceAmount > 0 && (
                                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted">Base Amount</span>
                                                <span className="text-heading">₦{serviceAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-amber-400">Tax ({svcTaxRate}%)</span>
                                                <span className="text-amber-400">₦{svcTaxAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm font-bold border-t border-amber-500/30 pt-1">
                                                <span className="text-heading">Total</span>
                                                <span className="text-heading">₦{svcTotal.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                        <div>
                            <label className="label">Notes (optional)</label>
                            <input
                                type="text"
                                value={serviceNotes}
                                onChange={(e) => setServiceNotes(e.target.value)}
                                className="input"
                                placeholder="Additional details..."
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setShowAddService(false);
                                    setSelectedService(null);
                                    setServiceAmount(0);
                                    setServiceNotes('');
                                    setServiceTaxable(false);
                                }}
                                className="btn btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddService}
                                disabled={isLoading || !selectedService || serviceAmount <= 0}
                                className="btn btn-primary flex-1"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Add Charge'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Amenities Modal */}
            {showAmenities && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-card rounded-xl border border-border w-full max-w-md p-4 space-y-4 max-h-[80vh] overflow-y-auto animate-scale-up">
                        <h3 className="text-lg font-bold text-heading">Issue Amenities</h3>

                        <AmenitiesSelection onSelectionChange={handleAmenityChange} />

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setShowAmenities(false);
                                    setAmenitySelections([]);
                                }}
                                className="btn btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleIssueAmenities}
                                disabled={isLoading || amenitySelections.length === 0}
                                className="btn btn-primary flex-1"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Issue Items'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Checkout Reconciliation Modal */}
            {showReconciliation && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg p-4 space-y-4 max-h-[80vh] overflow-y-auto animate-scale-up">
                        <h3 className="text-lg font-bold text-heading">Return Amenities Before Checkout</h3>
                        <p className="text-sm text-muted">Please confirm the status of items issued to this guest.</p>
                        <CheckoutReconciliation
                            bookingId={booking.id}
                            performedBy={user?.id ?? ''}
                            onComplete={handleFinalCheckout}
                            onCancel={() => setShowReconciliation(false)}
                        />
                    </div>
                </div>
            )}

            {/* Invoice Print Modal */}
            {showInvoice && currentInvoice && (
                <InvoiceView
                    invoice={currentInvoice}
                    onClose={() => {
                        setShowInvoice(false);
                        setCurrentInvoice(null);
                    }}
                />
            )}
        </div>
    );
}
