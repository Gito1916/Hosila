import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { v4 as uuidv4 } from 'uuid';
import type { Service, PaymentMethod, ServiceOrderStatus } from '@/types';
import {
    X,
    Loader2,
    Plus,
    Minus,
    ShoppingCart,
    Trash2,
    DoorOpen,
    CreditCard,
    FileText,
    AlertTriangle,
    User,
} from 'lucide-react';
import { RestaurantReceiptView, RestaurantInvoiceView } from './RestaurantReceipt';
import { getHotel } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';
import { taxApi } from '@/lib/apiClient';

export interface CartItem {
    service: Service;
    quantity: number;
    notes?: string;
}

type ServiceMode = 'room_tab' | 'walk_in';

interface RestaurantCartProps {
    cart: CartItem[];
    onUpdateQuantity: (serviceId: string, quantity: number) => void;
    onRemoveItem: (serviceId: string) => void;
    onClearCart: () => void;
    onClose?: () => void;
    onSuccess: () => void;
    isSidebar?: boolean; // New prop to control rendering mode
}

export function RestaurantCart({
    cart,
    onUpdateQuantity,
    onRemoveItem,
    onClearCart,
    onClose,
    onSuccess,
    isSidebar = false,
}: RestaurantCartProps) {
    const user = useAuthStore((state) => state.user);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Service mode
    const [mode, setMode] = useState<ServiceMode>('room_tab');

    // Room tab mode state
    const [selectedBookingId, setSelectedBookingId] = useState<string>('');

    // Walk-in mode state
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [customerName, setCustomerName] = useState('');

    // Invoice/Receipt state
    const [showInvoice, setShowInvoice] = useState(false);
    const [receiptData, setReceiptData] = useState<{
        items: { name: string; quantity: number; price: number; total: number }[];
        totalInfo: { subtotal: number; tax: number; total: number };
        paymentInfo?: { method: string; amount: number; date: Date };
        customerInfo?: string;
        receiptNumber?: string;
    } | null>(null);

    // Confirmation modal state
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [guestBalance, setGuestBalance] = useState(0);
    const [creditLimitWarning, setCreditLimitWarning] = useState(false);

    // Get hotel settings for fallback tax rate and credit limit
    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });
    const fallbackTaxRate = hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0;
    const creditLimitEnabled = hotel?.settings?.credit_limit_enabled ?? false;
    const creditLimitAmount = hotel?.settings?.credit_limit_amount ?? 50000;

    // Tax breakdown state from FastAPI
    const [scAmount, setScAmount] = useState(0);
    const [vatAmount, setVatAmount] = useState(0);
    const [tdlAmount, setTdlAmount] = useState(0);
    const [cartTotal, setCartTotal] = useState(0);

    // Get active bookings
    const { data: activeBookings } = useQuery({ queryKey: ['bookings', 'status', 'active'], queryFn: async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active'); return data ?? []; } });

    const { data: bookingDetails } = useQuery({
        queryKey: ['bookingDetails', activeBookings], queryFn: async () => {
            if (!activeBookings) return [];

            const details = await Promise.all(
                activeBookings.map(async (booking) => {
                    const room = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', booking.room_id).single(); return data; })();
                    const guest = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', booking.guest_id).single(); return data; })();
                    return {
                        bookingId: booking.id,
                        roomNumber: room?.room_number ?? 'Unknown',
                        guestName: guest?.name ?? 'Unknown',
                    };
                })
            );

            return details;
        }, enabled: !!activeBookings
    });

    // Calculate subtotal
    const subtotal = cart.reduce((sum, item) => sum + item.service.price * item.quantity, 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Fetch tax breakdown from FastAPI whenever subtotal changes
    const fetchTaxBreakdown = useCallback(async (amount: number) => {
        if (amount <= 0) {
            setScAmount(0);
            setVatAmount(0);
            setTdlAmount(0);
            setCartTotal(0);
            return;
        }
        try {
            const breakdown = await taxApi.calculate(amount, 'restaurant');
            // Coerce Pydantic Decimal strings to numbers
            setScAmount(Number(breakdown.service_charge.amount));
            setVatAmount(Number(breakdown.vat.amount));
            setTdlAmount(Number(breakdown.tdl.amount));
            setCartTotal(Number(breakdown.total));
        } catch {
            // Fallback to local single-rate calculation
            const tax = Math.round(amount * (fallbackTaxRate / 100) * 100) / 100;
            setScAmount(0);
            setVatAmount(tax);
            setTdlAmount(0);
            setCartTotal(Math.round((amount + tax) * 100) / 100);
        }
    }, [fallbackTaxRate]);

    useEffect(() => {
        fetchTaxBreakdown(subtotal);
    }, [subtotal, fetchTaxBreakdown]);

    const taxAmount = scAmount + vatAmount + tdlAmount;

    const handleCheckout = async () => {
        if (!user) return;

        // For room tab mode, show confirmation modal first
        if (mode === 'room_tab') {
            if (!selectedBookingId) {
                setError('Please select a room');
                return;
            }

            // Calculate guest's current balance
            try {
                const { calculateFolio } = await import('@/utils/folio');
                const folio = await calculateFolio(selectedBookingId);
                const currentBalance = folio?.balance ?? 0;
                setGuestBalance(currentBalance);

                // Check credit limit
                if (creditLimitEnabled && (currentBalance + cartTotal) > creditLimitAmount) {
                    setCreditLimitWarning(true);
                } else {
                    setCreditLimitWarning(false);
                }

                // Show confirmation modal
                setShowConfirmation(true);
                return;
            } catch (err) {
                console.error('Error calculating balance:', err);
                // Continue without balance if error
                setShowConfirmation(true);
                return;
            }
        }

        // For walk-in, proceed directly
        await processOrder();
    };

    const processOrder = async () => {
        if (!user) return;

        setIsSubmitting(true);
        setError(null);
        setShowConfirmation(false);

        try {
            const hotelId = await getHotelId();
            const now = new Date();

            // Generate Order Number: DDMMYYYY-XX
            const today = new Date();
            const dateStr = String(today.getDate()).padStart(2, '0') +
                String(today.getMonth() + 1).padStart(2, '0') +
                String(today.getFullYear());

            const allOrders = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('service_orders').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            const todayOrderNumbers = allOrders
                .filter(o => o.order_number?.startsWith(dateStr))
                .map(o => o.order_number!)
                .filter((v, i, a) => a.indexOf(v) === i);
            const nextSeq = todayOrderNumbers.length + 1;
            const orderNumber = `${dateStr}-${String(nextSeq).padStart(2, '0')}`;

            if (mode === 'room_tab') {
                if (!selectedBookingId) {
                    setError('Please select a room');
                    setIsSubmitting(false);
                    return;
                }

                // Add all items to room tab as service orders
                for (const item of cart) {
                    const order = {
                        id: uuidv4(),
                        hotel_id: hotelId,
                        booking_id: selectedBookingId,
                        service_id: item.service.id,
                        quantity: item.quantity,
                        unit_price: item.service.price,
                        total_price: item.service.price * item.quantity,
                        status: 'pending' as ServiceOrderStatus,
                        notes: item.notes,
                        order_number: orderNumber,
                        ordered_at: now,
                        created_by: user.id,
                        created_at: now,
                    };
                    await (async () => { const sb = requireSupabase(); await sb.from('service_orders').insert(order); })();

                    // Decrement inventory for beverages (items with inv_ prefix)
                    if (item.service.id.startsWith('inv_')) {
                        const inventoryId = item.service.id.replace('inv_', '');
                        const inventoryItem = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('inventory_items').select('*').eq('id', inventoryId).single(); return data; })();
                        if (inventoryItem) {
                            const newStock = Math.max(0, inventoryItem.current_stock - item.quantity);
                            await (async () => {
                                const sb = requireSupabase();
                                await sb.from('inventory_items').update({
                                    current_stock: newStock,
                                    updated_at: now,
                                }).eq('id', inventoryId);
                                // Record movement for reporting
                                await sb.from('inventory_movements').insert({
                                    id: uuidv4(),
                                    hotel_id: hotelId,
                                    item_id: inventoryId,
                                    movement_type: 'deduct',
                                    quantity: item.quantity,
                                    source: 'restaurant',
                                    reason: `Restaurant order ${orderNumber}`,
                                    balance_after: newStock,
                                    performed_by: user.id,
                                    movement_time: now,
                                });
                            })();
                        }
                    }
                }

                // === ACCOUNTING v2: Create restaurant charge on guest folio ===
                const { createCharge } = await import('@/db/accounting');
                const booking = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('bookings').select('*').eq('id', selectedBookingId).single(); return data; })();
                const room = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', booking?.room_id ?? '').single(); return data; })();
                const itemSummary = cart.map(i => `${i.service.name} x${i.quantity}`).join(', ');

                await createCharge({
                    guest_id: booking?.guest_id,
                    booking_id: selectedBookingId,
                    department: 'restaurant',
                    description: `Room ${room?.room_number ?? '?'} Tab: ${itemSummary}`,
                    gross_amount: subtotal,
                    tax_rate: fallbackTaxRate,
                    reference_id: orderNumber,
                    reference_type: 'service_order',
                    charge_date: now,
                });

                // Update booking balance
                const { getBookingBalance } = await import('@/db/accounting');
                const balance = await getBookingBalance(selectedBookingId);
                await (async () => {
                    const sb = requireSupabase(); await sb.from('bookings').update({
                        total_charged: balance.totalCharges,
                        balance: balance.balance,
                        updated_at: now,
                    }).eq('id', selectedBookingId);
                })();

                onClearCart();
                // Invalidate queries so UI updates immediately
                queryClient.invalidateQueries({ queryKey: ['groupedOrders'] });
                queryClient.invalidateQueries({ queryKey: ['pendingOrders'] });
                queryClient.invalidateQueries({ queryKey: ['bookings'] });
                queryClient.invalidateQueries({ queryKey: ['bookingDetails'] });
                onSuccess();
            } else {
                // Walk-in: Create service orders
                for (const item of cart) {
                    const order = {
                        id: uuidv4(),
                        hotel_id: hotelId,
                        booking_id: 'walk-in',
                        service_id: item.service.id,
                        quantity: item.quantity,
                        unit_price: item.service.price,
                        total_price: item.service.price * item.quantity,
                        status: 'delivered' as ServiceOrderStatus,
                        notes: customerName ? `Walk-in: ${customerName}` : 'Walk-in order',
                        order_number: orderNumber,
                        ordered_at: now,
                        delivered_at: now,
                        created_by: user.id,
                        created_at: now,
                    };
                    await (async () => { const sb = requireSupabase(); await sb.from('service_orders').insert(order); })();

                    // Decrement inventory for beverages (items with inv_ prefix)
                    if (item.service.id.startsWith('inv_')) {
                        const inventoryId = item.service.id.replace('inv_', '');
                        const inventoryItem = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('inventory_items').select('*').eq('id', inventoryId).single(); return data; })();
                        if (inventoryItem) {
                            const newStock = Math.max(0, inventoryItem.current_stock - item.quantity);
                            await (async () => {
                                const sb = requireSupabase();
                                await sb.from('inventory_items').update({
                                    current_stock: newStock,
                                    updated_at: now,
                                }).eq('id', inventoryId);
                                // Record movement for reporting
                                await sb.from('inventory_movements').insert({
                                    id: uuidv4(),
                                    hotel_id: hotelId,
                                    item_id: inventoryId,
                                    movement_type: 'deduct',
                                    quantity: item.quantity,
                                    source: 'restaurant',
                                    reason: `Restaurant order ${orderNumber}`,
                                    balance_after: newStock,
                                    performed_by: user.id,
                                    movement_time: now,
                                });
                            })();
                        }
                    }
                }

                // === ACCOUNTING v2: Create charge + immediate payment for walk-in ===
                const { createCharge, createPaymentWithAllocation } = await import('@/db/accounting');
                const itemSummary = cart.map(i => `${i.service.name} x${i.quantity}`).join(', ');
                const walkInDescription = customerName
                    ? `Walk-in (${customerName}): ${itemSummary}`
                    : `Walk-in: ${itemSummary}`;

                // Create the restaurant charge (revenue recognition)
                await createCharge({
                    department: 'restaurant',
                    description: walkInDescription,
                    gross_amount: subtotal,
                    tax_rate: fallbackTaxRate,
                    reference_id: orderNumber,
                    reference_type: 'service_order',
                    charge_date: now,
                });

                // Create immediate payment (walk-in is paid at point of sale)
                await createPaymentWithAllocation({
                    amount: cartTotal,
                    payment_method: paymentMethod,
                    received_by: user.id,
                    notes: walkInDescription,
                });

                // Prepare Receipt Data with order number
                const receipt = {
                    items: cart.map(item => ({
                        name: item.service.name,
                        quantity: item.quantity,
                        price: item.service.price,
                        total: item.service.price * item.quantity
                    })),
                    totalInfo: {
                        subtotal,
                        tax: taxAmount,
                        total: cartTotal
                    },
                    paymentInfo: {
                        method: paymentMethod,
                        amount: cartTotal,
                        date: now
                    },
                    customerInfo: customerName || 'Walk-in Guest',
                    receiptNumber: orderNumber
                };

                setReceiptData(receipt);
                onClearCart();
                // Invalidate queries so UI updates immediately
                queryClient.invalidateQueries({ queryKey: ['groupedOrders'] });
                queryClient.invalidateQueries({ queryKey: ['pendingOrders'] });
                queryClient.invalidateQueries({ queryKey: ['inventory_items'] });
                // Do NOT call onSuccess() yet, let user view/print receipt
            }

        } catch (err) {
            console.error('Error processing order:', err);
            setError(err instanceof Error ? err.message : 'Failed to process order');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Receipt View
    if (receiptData) {
        return (
            <RestaurantReceiptView
                items={receiptData.items}
                totalInfo={receiptData.totalInfo}
                paymentInfo={receiptData.paymentInfo}
                customerInfo={receiptData.customerInfo}
                receiptNumber={receiptData.receiptNumber}
                onClose={() => {
                    setReceiptData(null);
                    onSuccess();
                }}
                isSidebar={isSidebar}
            />
        );
    }

    // Invoice View
    if (showInvoice) {
        return (
            <RestaurantInvoiceView
                cart={cart}
                taxRate={fallbackTaxRate}
                subtotal={subtotal}
                taxAmount={taxAmount}
                total={cartTotal}
                mode={mode}
                customerName={customerName}
                roomDetails={mode === 'room_tab'
                    ? bookingDetails?.find(b => b.bookingId === selectedBookingId)
                        ? `Room ${bookingDetails.find(b => b.bookingId === selectedBookingId)?.roomNumber} - ${bookingDetails.find(b => b.bookingId === selectedBookingId)?.guestName}`
                        : 'Unknown Room'
                    : undefined
                }
                onClose={() => setShowInvoice(false)}
                isSidebar={isSidebar}
            />
        );
    }

    // Empty cart message
    if (cart.length === 0) {
        if (isSidebar) {
            return (
                <div className="card p-6 text-center">
                    <ShoppingCart size={48} className="mx-auto text-muted mb-4" />
                    <h3 className="text-lg font-bold text-heading mb-2">Cart is Empty</h3>
                    <p className="text-muted text-sm">Add items from the menu</p>
                </div>
            );
        }
        return (
            <div className="p-6 text-center">
                <ShoppingCart size={48} className="mx-auto text-muted mb-4" />
                <h2 className="text-xl font-bold text-heading mb-2">Cart is Empty</h2>
                <p className="text-muted mb-4">Add some items from the menu to get started.</p>
                {onClose && (
                    <button onClick={onClose} className="btn btn-primary">
                        Browse Menu
                    </button>
                )}
            </div>
        );
    }

    // Main cart content (works for both sidebar and modal)
    const cartContent = (
        <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <ShoppingCart size={20} className="text-primary-400" />
                    <h2 className={`font-bold text-heading ${isSidebar ? 'text-lg' : 'text-xl'}`}>
                        Cart ({itemCount} items)
                    </h2>
                </div>
                {onClose && !isSidebar && (
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Cart Items */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isSidebar ? 'max-h-[40vh]' : ''}`}>
                {error && (
                    <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {cart.map((item) => (
                    <div
                        key={item.service.id}
                        className="bg-surface-raised/50 rounded-lg p-3 flex items-center gap-3"
                    >
                        <div className="flex-1 min-w-0">
                            <p className="text-heading font-medium truncate">{item.service.name}</p>
                            <p className="text-sm text-muted">
                                ₦{item.service.price.toLocaleString()} each
                            </p>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => onUpdateQuantity(item.service.id, item.quantity - 1)}
                                className="w-7 h-7 rounded-full bg-surface-card hover:bg-surface-inset0 flex items-center justify-center text-heading"
                            >
                                <Minus size={12} />
                            </button>
                            <span className="text-heading font-bold w-6 text-center text-sm">{item.quantity}</span>
                            <button
                                onClick={() => onUpdateQuantity(item.service.id, item.quantity + 1)}
                                className="w-7 h-7 rounded-full bg-surface-card hover:bg-surface-inset0 flex items-center justify-center text-heading"
                            >
                                <Plus size={12} />
                            </button>
                        </div>

                        {/* Item Total */}
                        <div className="text-right min-w-[60px]">
                            <p className="text-heading font-bold text-sm">
                                ₦{(item.service.price * item.quantity).toLocaleString()}
                            </p>
                        </div>

                        {/* Remove */}
                        <button
                            onClick={() => onRemoveItem(item.service.id)}
                            className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Checkout Section */}
            <div className="border-t border-border p-4 space-y-4">
                {/* Mode Selector */}
                <div>
                    <label className="label">Order Type</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setMode('room_tab')}
                            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg font-medium text-sm transition-all ${mode === 'room_tab'
                                ? 'bg-primary-500 text-heading'
                                : 'bg-surface-raised/50 text-muted hover:text-heading hover:bg-surface-raised'
                                }`}
                        >
                            <DoorOpen size={16} />
                            Room Tab
                        </button>
                        <button
                            onClick={() => setMode('walk_in')}
                            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg font-medium text-sm transition-all ${mode === 'walk_in'
                                ? 'bg-primary-500 text-heading'
                                : 'bg-surface-raised/50 text-muted hover:text-heading hover:bg-surface-raised'
                                }`}
                        >
                            <CreditCard size={16} />
                            Pay Now
                        </button>
                    </div>
                </div>

                {/* Room Tab Mode */}
                {mode === 'room_tab' && (
                    <>
                        {bookingDetails?.length === 0 ? (
                            <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg text-amber-400 text-center text-sm">
                                No guests checked in. Use Pay Now for direct sales.
                            </div>
                        ) : (
                            <div>
                                <label className="label">Charge to Room</label>
                                <select
                                    value={selectedBookingId}
                                    onChange={(e) => setSelectedBookingId(e.target.value)}
                                    className="input"
                                >
                                    <option value="">Select a room...</option>
                                    {bookingDetails?.map((b) => (
                                        <option key={b.bookingId} value={b.bookingId}>
                                            Room {b.roomNumber} - {b.guestName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </>
                )}

                {/* Walk-in Mode */}
                {mode === 'walk_in' && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Customer (opt.)</label>
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                className="input"
                                placeholder="Walk-in"
                            />
                        </div>
                        <div>
                            <label className="label">Payment</label>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                                className="input"
                            >
                                <option value="cash">Cash</option>
                                <option value="transfer">Transfer</option>
                                <option value="pos">POS</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* Total with Tax */}
                <div className="bg-surface-raised/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted">Subtotal</span>
                        <span className="text-heading">₦{subtotal.toLocaleString()}</span>
                    </div>
                    {scAmount > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-muted">Service Charge</span>
                            <span className="text-heading">₦{scAmount.toLocaleString()}</span>
                        </div>
                    )}
                    {vatAmount > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-muted">VAT</span>
                            <span className="text-heading">₦{vatAmount.toLocaleString()}</span>
                        </div>
                    )}
                    {tdlAmount > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-muted">TDL</span>
                            <span className="text-heading">₦{tdlAmount.toLocaleString()}</span>
                        </div>
                    )}
                    <div className="border-t border-border-strong pt-1.5 flex justify-between">
                        <span className="text-muted font-medium">Total</span>
                        <span className={`font-bold text-heading ${isSidebar ? 'text-lg' : 'text-2xl'}`}>
                            ₦{cartTotal.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowInvoice(true)}
                        className="btn btn-secondary flex-shrink-0"
                        disabled={mode === 'room_tab' && !selectedBookingId}
                    >
                        <FileText size={16} />
                    </button>

                    <button
                        onClick={handleCheckout}
                        disabled={isSubmitting || (mode === 'room_tab' && (!selectedBookingId || bookingDetails?.length === 0))}
                        className="btn btn-primary flex-1"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={16} className="animate-spin mr-2" />
                                Processing...
                            </>
                        ) : mode === 'room_tab' ? (
                            'Add to Tab'
                        ) : (
                            <>
                                <CreditCard size={14} className="mr-1" />
                                Pay ₦{cartTotal.toLocaleString()}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </>
    );

    // Get selected booking details for confirmation
    const selectedBooking = bookingDetails?.find(b => b.bookingId === selectedBookingId);

    // Confirmation Modal
    const confirmationModal = showConfirmation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-md p-5 space-y-4 animate-scale-up">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-500/20 rounded-lg">
                        <User size={24} className="text-primary-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-heading">Confirm Guest Charge</h3>
                        <p className="text-sm text-muted">Verify guest details before charging</p>
                    </div>
                </div>

                {/* Guest Details */}
                <div className="bg-surface-raised/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted">Room</span>
                        <span className="text-heading font-medium">{selectedBooking?.roomNumber}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted">Guest Name</span>
                        <span className="text-heading font-medium">{selectedBooking?.guestName}</span>
                    </div>
                    <div className="border-t border-border-strong my-2" />
                    <div className="flex justify-between text-sm">
                        <span className="text-muted">Current Balance</span>
                        <span className={guestBalance > 0 ? 'text-amber-400 font-medium' : 'text-green-400 font-medium'}>
                            ₦{guestBalance.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted">This Order</span>
                        <span className="text-heading font-medium">₦{cartTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                        <span className="text-heading">New Balance</span>
                        <span className={creditLimitWarning ? 'text-red-400' : 'text-heading'}>
                            ₦{(guestBalance + cartTotal).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Credit Limit Warning */}
                {creditLimitWarning && (
                    <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg flex items-start gap-3">
                        <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="text-amber-400 font-semibold">Credit Limit Warning</p>
                            <p className="text-amber-300/80">
                                New balance will exceed ₦{creditLimitAmount.toLocaleString()} credit limit.
                                Consider collecting payment.
                            </p>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        onClick={() => setShowConfirmation(false)}
                        className="btn btn-secondary flex-1"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={processOrder}
                        disabled={isSubmitting}
                        className={`btn flex-1 ${creditLimitWarning ? 'bg-amber-600 hover:bg-amber-700' : 'btn-primary'}`}
                    >
                        {isSubmitting ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : creditLimitWarning ? (
                            'Proceed Anyway'
                        ) : (
                            'Confirm Charge'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    // Sidebar rendering (no modal wrapper)
    if (isSidebar) {
        return (
            <>
                <div className="card overflow-hidden flex flex-col">
                    {cartContent}
                </div>
                {confirmationModal}
            </>
        );
    }

    // Modal rendering (with backdrop) - for mobile bottom sheet
    return (
        <>
            <div className="flex flex-col h-full">
                {cartContent}
            </div>
            {confirmationModal}
        </>
    );
}
