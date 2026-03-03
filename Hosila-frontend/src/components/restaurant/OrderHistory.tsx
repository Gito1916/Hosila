import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    Receipt,
    Clock,
    CheckCircle,
    XCircle,
    DoorOpen,
    UtensilsCrossed,
    Printer,
    ChevronDown,
    ChevronRight,
    Package,
} from 'lucide-react';
import { useState } from 'react';
import { RestaurantReceiptView } from './RestaurantReceipt';
import { requireSupabase, getHotelId } from '@/lib/api';

interface OrderItem {
    name: string;
    quantity: number;
    price: number;
    total: number;
}

interface GroupedOrder {
    orderNumber: string;
    orderedAt: Date;
    items: OrderItem[];
    totalAmount: number;
    status: 'delivered' | 'cancelled' | 'pending';
    roomNumber: string | null;
    guestName: string | null;
    isWalkIn: boolean;
    paymentStatus?: 'paid' | 'partial' | 'unpaid';
    scAmount: number;
    vatAmount: number;
    tdlAmount: number;
}

export function OrderHistory() {
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [selectedReceipt, setSelectedReceipt] = useState<{
        items: OrderItem[];
        totalInfo: { subtotal: number; scAmount: number; vatAmount: number; tdlAmount: number; total: number };
        paymentInfo?: { method: string; amount: number; date: Date };
        customerInfo?: string;
        receiptNumber?: string;
    } | null>(null);

    // Get all orders grouped by order_number — show ALL statuses
    const { data: groupedOrders } = useQuery({
        queryKey: ['groupedOrders'], queryFn: async () => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const allOrders = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('service_orders').select('*').eq('hotel_id', hotelId); return data ?? []; })();

            // Show all orders from last 7 days (not just delivered/cancelled)
            const recentOrders = allOrders
                .filter(o => new Date(o.ordered_at) >= sevenDaysAgo)
                .sort((a, b) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime());

            // Group by order_number
            const orderGroups = new Map<string, typeof recentOrders>();
            for (const order of recentOrders) {
                const key = order.order_number || `legacy-${order.id}`;
                if (!orderGroups.has(key)) orderGroups.set(key, []);
                orderGroups.get(key)!.push(order);
            }

            // === ACCOUNTING v2: Derive payment status from charges + allocations ===
            const allCharges = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('charges').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            const allAllocations = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('payment_allocations').select('*').eq('hotel_id', hotelId); return data ?? []; })();

            const getPaymentStatusFromCharges = (orderNumber: string, isWalkIn: boolean): 'paid' | 'partial' | 'unpaid' => {
                if (isWalkIn) return 'paid'; // Walk-ins are always paid at POS

                const orderCharges = allCharges.filter(
                    c => c.reference_id === orderNumber && (c.status === 'active' || c.status === 'partially_refunded')
                );
                if (orderCharges.length === 0) return 'unpaid';

                let totalCharged = 0;
                let totalAllocated = 0;
                for (const charge of orderCharges) {
                    totalCharged += charge.gross_amount;
                    const allocations = allAllocations.filter(a => a.charge_id === charge.id && a.status === 'active');
                    totalAllocated += allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
                }

                if (totalAllocated >= totalCharged) return 'paid';
                if (totalAllocated > 0) return 'partial';
                return 'unpaid';
            };

            const enrichedGroups: GroupedOrder[] = [];

            for (const [orderNumber, orders] of orderGroups) {
                const firstOrder = orders[0];
                let roomNumber: string | null = null;
                let guestName: string | null = null;

                const isWalkIn = firstOrder.booking_id === 'walk-in';
                const paymentStatus = getPaymentStatusFromCharges(orderNumber, isWalkIn);

                if (!isWalkIn && firstOrder.booking_id) {
                    try {
                        const booking = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('bookings').select('*').eq('id', firstOrder.booking_id).single(); return data; })();
                        if (booking) {
                            const room = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', booking.room_id).single(); return data; })();
                            const guest = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', booking.guest_id).single(); return data; })();
                            roomNumber = room?.room_number ?? null;
                            guestName = guest?.name ?? null;
                        }
                    } catch (err) {
                        console.error('Error getting booking details:', err);
                    }
                }

                // Get service details
                const items: OrderItem[] = [];
                for (const order of orders) {
                    try {
                        let itemName = 'Unknown Item';
                        if (order.service_id.startsWith('inv_')) {
                            const inventoryId = order.service_id.replace('inv_', '');
                            const inventoryItem = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('inventory_items').select('*').eq('id', inventoryId).single(); return data; })();
                            itemName = inventoryItem?.name ?? 'Unknown Beverage';
                        } else {
                            const service = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('services').select('*').eq('id', order.service_id).single(); return data; })();
                            itemName = service?.name ?? 'Unknown Item';
                        }
                        items.push({
                            name: itemName,
                            quantity: order.quantity,
                            price: order.unit_price,
                            total: order.total_price,
                        });
                    } catch (err) {
                        items.push({ name: 'Item', quantity: 1, price: 0, total: 0 });
                    }
                }

                // Determine overall status from items
                const statuses = orders.map(o => o.status);
                let overallStatus: 'delivered' | 'cancelled' | 'pending' = 'pending';
                if (statuses.every(s => s === 'cancelled')) overallStatus = 'cancelled';
                else if (statuses.every(s => s === 'delivered' || s === 'cancelled')) overallStatus = 'delivered';

                const rawSubtotal = orders.reduce((sum, o) => sum + o.total_price, 0);

                // Read actual tax breakdown from charges table
                const orderCharge = allCharges.find(
                    c => c.reference_id === orderNumber && c.status !== 'cancelled'
                );
                const orderSC = orderCharge?.service_charge_amount ?? 0;
                const orderVAT = orderCharge?.vat_amount_v2 ?? 0;
                const orderTDL = orderCharge?.tdl_amount ?? 0;
                const orderTotalTax = orderSC + orderVAT + orderTDL;

                enrichedGroups.push({
                    orderNumber,
                    orderedAt: firstOrder.ordered_at,
                    items,
                    totalAmount: rawSubtotal + orderTotalTax,
                    status: overallStatus,
                    roomNumber,
                    guestName,
                    isWalkIn,
                    paymentStatus,
                    scAmount: orderSC,
                    vatAmount: orderVAT,
                    tdlAmount: orderTDL,
                });
            }

            return enrichedGroups;
        }
    });

    const toggleExpand = (orderNumber: string) => {
        setExpandedOrders(prev => {
            const next = new Set(prev);
            if (next.has(orderNumber)) {
                next.delete(orderNumber);
            } else {
                next.add(orderNumber);
            }
            return next;
        });
    };

    const handlePrintReceipt = (order: GroupedOrder) => {
        // Use actual tax amounts from the charge record
        const rawSubtotal = order.items.reduce((sum, item) => sum + item.total, 0);

        setSelectedReceipt({
            items: order.items,
            totalInfo: {
                subtotal: rawSubtotal,
                scAmount: order.scAmount,
                vatAmount: order.vatAmount,
                tdlAmount: order.tdlAmount,
                total: order.totalAmount,
            },
            paymentInfo: {
                method: order.isWalkIn ? 'Cash/POS' : 'Room Tab',
                amount: order.totalAmount,
                date: order.orderedAt,
            },
            customerInfo: order.isWalkIn
                ? 'Walk-in Guest'
                : order.roomNumber
                    ? `Room ${order.roomNumber}${order.guestName ? ` - ${order.guestName}` : ''}`
                    : 'Guest',
            receiptNumber: order.orderNumber,
        });
    };

    if (!groupedOrders || groupedOrders.length === 0) {
        return (
            <div className="text-center py-12">
                <Receipt size={48} className="mx-auto text-muted mb-4" />
                <h3 className="text-lg font-semibold text-muted mb-2">No Order History</h3>
                <p className="text-sm text-muted">Completed orders from the last 7 days will appear here.</p>
            </div>
        );
    }

    // Group by date for display
    const groupedByDate = groupedOrders.reduce((acc, order) => {
        const dateKey = format(new Date(order.orderedAt), 'yyyy-MM-dd');
        if (!acc[dateKey]) {
            acc[dateKey] = [];
        }
        acc[dateKey].push(order);
        return acc;
    }, {} as Record<string, GroupedOrder[]>);

    const totalRevenue = groupedOrders
        .filter(o => o.status === 'delivered')
        .reduce((sum, o) => sum + o.totalAmount, 0);

    const totalOrders = groupedOrders.filter(o => o.status === 'delivered').length;

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="card p-4 bg-gradient-to-r from-cyan-500/20 to-green-500/20 border-cyan-500/30">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted">Last 7 Days Revenue</p>
                        <p className="text-2xl font-bold text-heading">₦{totalRevenue.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted">Orders</p>
                        <p className="text-lg font-bold text-heading">{totalOrders}</p>
                    </div>
                </div>
            </div>

            {/* Orders by Date */}
            {Object.entries(groupedByDate).map(([dateKey, dayOrders]) => (
                <div key={dateKey}>
                    <h3 className="text-sm font-semibold text-muted mb-3">
                        {format(new Date(dateKey), 'EEEE, MMM d')}
                        <span className="text-muted ml-2">
                            ({dayOrders.length} order{dayOrders.length !== 1 ? 's' : ''})
                        </span>
                    </h3>
                    <div className="space-y-2">
                        {dayOrders.map(order => {
                            const isExpanded = expandedOrders.has(order.orderNumber);

                            return (
                                <div key={order.orderNumber} className="card overflow-hidden">
                                    {/* Order Header - Clickable to expand */}
                                    <div
                                        onClick={() => toggleExpand(order.orderNumber)}
                                        className="p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-raised transition-colors"
                                    >
                                        {/* Expand Icon */}
                                        <div className="text-muted">
                                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                        </div>

                                        {/* Status Icon */}
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${order.status === 'delivered'
                                            ? (order.paymentStatus === 'paid' ? 'bg-green-500/20' : 'bg-orange-500/20')
                                            : 'bg-red-500/20'
                                            }`}>
                                            <Package size={18} className={
                                                order.status === 'delivered'
                                                    ? (order.paymentStatus === 'paid' ? 'text-green-400' : 'text-orange-400')
                                                    : 'text-red-400'
                                            } />
                                        </div>

                                        {/* Order Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-heading font-bold font-mono">#{order.orderNumber}</p>
                                                <span className="text-xs text-muted bg-surface-raised px-2 py-0.5 rounded">
                                                    {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted">
                                                <Clock size={12} />
                                                <span>{format(new Date(order.orderedAt), 'h:mm a')}</span>
                                                <span>•</span>
                                                {order.isWalkIn ? (
                                                    <span>Walk-in</span>
                                                ) : (
                                                    <>
                                                        <DoorOpen size={12} />
                                                        <span>Room {order.roomNumber}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Total & Actions */}
                                        <div className="text-right flex flex-col items-end gap-1">
                                            <p className="text-heading font-bold text-lg">₦{order.totalAmount.toLocaleString()}</p>
                                            <div className="flex flex-col items-end text-xs gap-0.5">
                                                <div className={`flex items-center gap-1 ${order.status === 'delivered' ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                    {order.status === 'delivered' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                                    <span className="capitalize">{order.status}</span>
                                                </div>
                                                {order.status === 'delivered' && !order.isWalkIn && (
                                                    <div className={`flex items-center gap-1 font-bold ${order.paymentStatus === 'paid' ? 'text-green-400' :
                                                        order.paymentStatus === 'partial' ? 'text-yellow-400' : 'text-red-400'
                                                        }`}>
                                                        <span>{order.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Print Button */}
                                        {order.status === 'delivered' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintReceipt(order);
                                                }}
                                                className="p-2 bg-surface-raised hover:bg-surface-card rounded-lg text-muted transition-colors ml-2"
                                            >
                                                <Printer size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Expanded Items */}
                                    {isExpanded && (
                                        <div className="border-t border-border bg-surface-card/50">
                                            <div className="p-3 space-y-2">
                                                {order.items.map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-3 text-sm">
                                                        <div className={`w-8 h-8 rounded flex items-center justify-center bg-surface-raised`}>
                                                            <UtensilsCrossed size={14} className="text-muted" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <span className="text-heading">{item.name}</span>
                                                            {item.quantity > 1 && (
                                                                <span className="text-muted ml-1">×{item.quantity}</span>
                                                            )}
                                                        </div>
                                                        <span className="text-muted">₦{item.price.toLocaleString()}</span>
                                                        <span className="text-heading font-medium w-24 text-right">
                                                            ₦{item.total.toLocaleString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {selectedReceipt && (
                <RestaurantReceiptView
                    items={selectedReceipt.items}
                    totalInfo={selectedReceipt.totalInfo}
                    paymentInfo={selectedReceipt.paymentInfo}
                    customerInfo={selectedReceipt.customerInfo}
                    receiptNumber={selectedReceipt.receiptNumber}
                    onClose={() => setSelectedReceipt(null)}
                />
            )}
        </div>
    );
}
