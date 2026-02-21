import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { updateOrderStatus } from '@/db/services';
import type { ServiceOrderStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import {
    Clock,
    ChefHat,
    CheckCircle,
    XCircle,
    MapPin,
    User,
    Package,
    ChevronDown,
    ChevronRight,
    Minus,
    Plus,
    Trash2,
    PlusCircle,
    X,
    Search,
} from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { requireSupabase, getHotelId } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';

const statusConfig: Record<ServiceOrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
    pending: {
        label: 'New Order',
        color: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
        icon: <Clock size={14} />,
    },
    preparing: {
        label: 'Preparing',
        color: 'bg-primary-500/20 text-primary-400 border-primary-500/50',
        icon: <ChefHat size={14} />,
    },
    delivered: {
        label: 'Delivered',
        color: 'bg-status-available/20 text-status-available border-status-available/50',
        icon: <CheckCircle size={14} />,
    },
    cancelled: {
        label: 'Cancelled',
        color: 'bg-status-maintenance/20 text-status-maintenance border-status-maintenance/50',
        icon: <XCircle size={14} />,
    },
};

interface OrderItem {
    id: string;
    serviceName: string;
    serviceId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: ServiceOrderStatus;
    notes?: string;
}

interface GroupedOrder {
    orderNumber: string;
    bookingId: string;
    items: OrderItem[];
    roomNumber: string;
    guestName: string;
    staffName: string;
    orderedAt: Date;
    totalAmount: number;
    status: ServiceOrderStatus;
    isWalkIn: boolean;
}

// Calculate order-level status from items
function getOrderStatus(items: OrderItem[]): ServiceOrderStatus {
    const statuses = items.map(i => i.status);
    if (statuses.every(s => s === 'cancelled')) return 'cancelled';
    if (statuses.every(s => s === 'delivered' || s === 'cancelled')) return 'delivered';
    if (statuses.some(s => s === 'preparing')) return 'preparing';
    return 'pending';
}

// Recalculate derived fields on a GroupedOrder
function recalcOrder(order: GroupedOrder): GroupedOrder {
    return {
        ...order,
        totalAmount: order.items.filter(i => i.status !== 'cancelled').reduce((sum, i) => sum + i.totalPrice, 0),
        status: getOrderStatus(order.items),
    };
}

export function PendingOrders() {
    const user = useAuthStore((state) => state.user);
    const queryClient = useQueryClient();
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [addingToOrder, setAddingToOrder] = useState<string | null>(null); // orderNumber of order being added to
    const [addItemSearch, setAddItemSearch] = useState('');

    // ========================================================================
    // DATA: Batched queries (no N+1)
    // ========================================================================

    const { data: groupedOrders } = useQuery({
        queryKey: ['groupedOrders'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();

            // 1. Fetch all orders in one query
            const { data: allOrders } = await sb.from('service_orders').select('*').eq('hotel_id', hotelId);
            // Only show active orders — delivered/cancelled belong in Order History
            const orders = (allOrders ?? []).filter(o => o.status === 'pending' || o.status === 'preparing');

            // 2. Batch-fetch all needed services and inventory items
            const regularServiceIds = [...new Set(orders.filter(o => !o.service_id.startsWith('inv_')).map(o => o.service_id))];
            const inventoryIds = [...new Set(orders.filter(o => o.service_id.startsWith('inv_')).map(o => o.service_id.replace('inv_', '')))];

            const [servicesResult, inventoryResult] = await Promise.all([
                regularServiceIds.length > 0
                    ? sb.from('services').select('id, name').in('id', regularServiceIds)
                    : Promise.resolve({ data: [] }),
                inventoryIds.length > 0
                    ? sb.from('inventory_items').select('id, name').in('id', inventoryIds)
                    : Promise.resolve({ data: [] }),
            ]);

            const serviceMap = new Map((servicesResult.data ?? []).map(s => [s.id, s.name]));
            const inventoryMap = new Map((inventoryResult.data ?? []).map(s => [s.id, s.name]));

            // 3. Batch-fetch booking/room/guest data
            const bookingIds = [...new Set(orders.filter(o => o.booking_id && o.booking_id !== 'walk-in').map(o => o.booking_id))];
            let bookingMap = new Map<string, { room_number: string; guest_name: string }>();

            if (bookingIds.length > 0) {
                const { data: bookings } = await sb.from('bookings').select('id, room_id, guest_id').in('id', bookingIds);
                if (bookings && bookings.length > 0) {
                    const roomIds = [...new Set(bookings.map(b => b.room_id).filter(Boolean))];
                    const guestIds = [...new Set(bookings.map(b => b.guest_id).filter(Boolean))];

                    const [roomsResult, guestsResult] = await Promise.all([
                        roomIds.length > 0 ? sb.from('rooms').select('id, room_number').in('id', roomIds) : Promise.resolve({ data: [] }),
                        guestIds.length > 0 ? sb.from('guests').select('id, name').in('id', guestIds) : Promise.resolve({ data: [] }),
                    ]);

                    const roomMap = new Map((roomsResult.data ?? []).map(r => [r.id, r.room_number]));
                    const guestMap = new Map((guestsResult.data ?? []).map(g => [g.id, g.name]));

                    for (const booking of bookings) {
                        bookingMap.set(booking.id, {
                            room_number: roomMap.get(booking.room_id) ?? '?',
                            guest_name: guestMap.get(booking.guest_id) ?? 'Unknown',
                        });
                    }
                }
            }

            // 4. Enrich and group
            const groups = new Map<string, any[]>();
            for (const order of orders) {
                const key = order.order_number || `single-${order.id}`;
                if (!groups.has(key)) groups.set(key, []);

                const serviceName = order.service_id.startsWith('inv_')
                    ? inventoryMap.get(order.service_id.replace('inv_', '')) ?? 'Unknown Beverage'
                    : serviceMap.get(order.service_id) ?? 'Unknown';

                const bookingInfo = bookingMap.get(order.booking_id);

                groups.get(key)!.push({
                    ...order,
                    serviceName,
                    roomNumber: bookingInfo?.room_number ?? (order.booking_id === 'walk-in' ? 'Walk-in' : '?'),
                    guestName: bookingInfo?.guest_name ?? (order.booking_id === 'walk-in' ? 'Walk-in Guest' : 'Unknown'),
                    staffName: order.created_by_name ?? 'Staff',
                    isWalkIn: order.booking_id === 'walk-in',
                });
            }

            // 5. Convert to GroupedOrder array
            const result: GroupedOrder[] = [];
            for (const [orderNumber, items] of groups) {
                const first = items[0];
                const orderItems: OrderItem[] = items.map(i => ({
                    id: i.id,
                    serviceName: i.serviceName,
                    serviceId: i.service_id,
                    quantity: i.quantity,
                    unitPrice: i.unit_price,
                    totalPrice: i.total_price,
                    status: i.status,
                    notes: i.notes,
                }));

                result.push({
                    orderNumber,
                    bookingId: first.booking_id,
                    items: orderItems,
                    roomNumber: first.roomNumber,
                    guestName: first.guestName,
                    staffName: first.staffName,
                    orderedAt: first.ordered_at,
                    totalAmount: items.reduce((sum: number, i: any) => sum + i.total_price, 0),
                    status: getOrderStatus(orderItems),
                    isWalkIn: first.isWalkIn,
                });
            }

            return result.sort((a, b) => {
                const statusOrder = { pending: 0, preparing: 1, delivered: 2, cancelled: 3 };
                const statusDiff = statusOrder[a.status] - statusOrder[b.status];
                if (statusDiff !== 0) return statusDiff;
                return new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime();
            });
        },
        staleTime: Infinity,          // Only update via optimistic mutations or realtime push
        refetchOnWindowFocus: false,   // No phantom refetches when switching tabs
    });

    // ========================================================================
    // Available menu items (for "Add Item" feature)
    // ========================================================================

    const { data: foodServices } = useQuery({
        queryKey: ['services', 'food'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('services').select('*').eq('hotel_id', hotelId).eq('category', 'food').eq('is_active', true);
            return data ?? [];
        },
        staleTime: 5 * 60 * 1000,
        enabled: addingToOrder !== null, // Only fetch when add-item panel is open
    });

    const { data: inventoryBeverages } = useQuery({
        queryKey: ['inventory_items', 'beverages'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('inventory_items').select('*').eq('hotel_id', hotelId).eq('category', 'beverages').gt('current_stock', 0);
            return data ?? [];
        },
        staleTime: 5 * 60 * 1000,
        enabled: addingToOrder !== null,
    });

    const availableMenuItems = useMemo(() => {
        const foods: { id: string; name: string; price: number; category: string }[] = (foodServices ?? []).map(s => ({
            id: s.id, name: s.name, price: s.price, category: 'food',
        }));
        const drinks: { id: string; name: string; price: number; category: string }[] = (inventoryBeverages ?? []).map(item => ({
            id: `inv_${item.id}`, name: item.name, price: item.selling_price || item.unit_cost, category: 'beverage',
        }));
        return [...foods, ...drinks];
    }, [foodServices, inventoryBeverages]);

    const filteredMenuItems = useMemo(() => {
        if (!addItemSearch.trim()) return availableMenuItems;
        const q = addItemSearch.toLowerCase();
        return availableMenuItems.filter(i => i.name.toLowerCase().includes(q));
    }, [availableMenuItems, addItemSearch]);

    // ========================================================================
    // OPTIMISTIC HELPERS
    // ========================================================================

    const QUERY_KEY = ['groupedOrders'] as const;

    // Snapshot and cancel in-flight queries
    const optimisticSetup = useCallback(async () => {
        await queryClient.cancelQueries({ queryKey: QUERY_KEY });
        return queryClient.getQueryData<GroupedOrder[]>(QUERY_KEY);
    }, [queryClient]);

    // Rollback helper
    const rollback = useCallback((_err: unknown, _vars: unknown, context: { previousOrders?: GroupedOrder[] } | undefined) => {
        if (context?.previousOrders) {
            queryClient.setQueryData(QUERY_KEY, context.previousOrders);
        }
    }, [queryClient]);

    // Settle: re-sync from server (quietly, in background)
    const settle = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }, [queryClient]);

    // ========================================================================
    // MUTATION: Status change (optimistic)
    // ========================================================================

    const statusMutation = useMutation({
        mutationFn: async ({ order, newStatus }: { order: GroupedOrder; newStatus: ServiceOrderStatus }) => {
            if (!user) throw new Error('Not authenticated');
            for (const item of order.items) {
                if (item.status !== newStatus && item.status !== 'cancelled') {
                    await updateOrderStatus(item.id, newStatus, user.id);
                }
            }
        },
        onMutate: async ({ order, newStatus }) => {
            const previousOrders = await optimisticSetup();

            // Instantly update the cache
            queryClient.setQueryData<GroupedOrder[]>(QUERY_KEY, old =>
                (old ?? []).map(o => {
                    if (o.orderNumber !== order.orderNumber) return o;
                    return recalcOrder({
                        ...o,
                        items: o.items.map(item =>
                            item.status !== 'cancelled'
                                ? { ...item, status: newStatus }
                                : item
                        ),
                    });
                }).sort((a, b) => {
                    const statusOrder = { pending: 0, preparing: 1, delivered: 2, cancelled: 3 };
                    return statusOrder[a.status] - statusOrder[b.status] || new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime();
                })
            );

            return { previousOrders };
        },
        onError: rollback,
        onSettled: settle,
    });

    // ========================================================================
    // MUTATION: Cancel single item (optimistic)
    // ========================================================================

    const cancelItemMutation = useMutation({
        mutationFn: async ({ itemId }: { itemId: string }) => {
            if (!user) throw new Error('Not authenticated');
            await updateOrderStatus(itemId, 'cancelled', user.id);
        },
        onMutate: async ({ itemId }) => {
            const previousOrders = await optimisticSetup();

            queryClient.setQueryData<GroupedOrder[]>(QUERY_KEY, old =>
                (old ?? []).map(o => {
                    const hasItem = o.items.some(i => i.id === itemId);
                    if (!hasItem) return o;
                    return recalcOrder({
                        ...o,
                        items: o.items.map(item =>
                            item.id === itemId ? { ...item, status: 'cancelled' as ServiceOrderStatus } : item
                        ),
                    });
                })
            );

            return { previousOrders };
        },
        onError: rollback,
        onSettled: settle,
    });

    // ========================================================================
    // MUTATION: Quantity change (optimistic)
    // ========================================================================

    const quantityMutation = useMutation({
        mutationFn: async ({ item, order, delta }: { item: OrderItem; order: GroupedOrder; delta: number }) => {
            if (!user) throw new Error('Not authenticated');
            const newQty = item.quantity + delta;
            const newTotal = item.unitPrice * newQty;
            const oldTotal = item.unitPrice * item.quantity;
            const diff = newTotal - oldTotal;

            // Update service_order row
            const sb = requireSupabase();
            await sb.from('service_orders').update({
                quantity: newQty,
                total_price: newTotal,
            }).eq('id', item.id);

            // Accounting adjustments
            const { createCharge, createReversal } = await import('@/db/accounting');
            const hotelId = await getHotelId();
            const { data: hotel } = await sb.from('hotels').select('*').eq('id', hotelId).single();
            const taxRate = hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0;
            const now = new Date();

            if (diff > 0) {
                const grossDiff = Math.round(diff * (1 + taxRate / 100) * 100) / 100;
                const booking = !order.isWalkIn && order.bookingId
                    ? (await sb.from('bookings').select('guest_id').eq('id', order.bookingId).single()).data
                    : null;
                await createCharge({
                    guest_id: booking?.guest_id,
                    booking_id: order.isWalkIn ? undefined : order.bookingId,
                    department: 'restaurant',
                    description: `${item.serviceName} qty adjustment +${delta}`,
                    gross_amount: grossDiff,
                    tax_rate: taxRate,
                    reference_id: order.orderNumber,
                    reference_type: 'service_order',
                    charge_date: now,
                });
            } else if (diff < 0) {
                const charges = await (async () => {
                    const { data } = await sb.from('charges').select('*').eq('hotel_id', hotelId).eq('reference_id', order.orderNumber);
                    return data ?? [];
                })();
                const activeCharge = charges.find((c: any) => c.status === 'active');
                if (activeCharge) {
                    await createReversal(activeCharge.id, `Qty reduced: ${item.serviceName} -${Math.abs(delta)}`);
                    const activeItemsSubtotal = order.items
                        .filter(i => i.status !== 'cancelled')
                        .reduce((sum, i) => sum + (i.id === item.id ? newTotal : i.totalPrice), 0);
                    if (activeItemsSubtotal > 0) {
                        const grossTotal = Math.round(activeItemsSubtotal * (1 + taxRate / 100) * 100) / 100;
                        const booking = !order.isWalkIn && order.bookingId
                            ? (await sb.from('bookings').select('guest_id').eq('id', order.bookingId).single()).data
                            : null;
                        await createCharge({
                            guest_id: booking?.guest_id,
                            booking_id: order.isWalkIn ? undefined : order.bookingId,
                            department: 'restaurant',
                            description: `Adjusted order #${order.orderNumber}`,
                            gross_amount: grossTotal,
                            tax_rate: taxRate,
                            reference_id: order.orderNumber,
                            reference_type: 'service_order',
                            charge_date: now,
                        });
                    }
                }
            }

            // Sync booking balance
            if (!order.isWalkIn && order.bookingId) {
                const { getBookingBalance } = await import('@/db/accounting');
                const balance = await getBookingBalance(order.bookingId);
                await sb.from('bookings').update({
                    total_charged: balance.totalCharges,
                    balance: balance.balance,
                    updated_at: now,
                }).eq('id', order.bookingId);
            }
        },
        onMutate: async ({ item, delta }) => {
            const previousOrders = await optimisticSetup();
            const newQty = item.quantity + delta;
            const newTotal = item.unitPrice * newQty;

            queryClient.setQueryData<GroupedOrder[]>(QUERY_KEY, old =>
                (old ?? []).map(o => {
                    const hasItem = o.items.some(i => i.id === item.id);
                    if (!hasItem) return o;
                    return recalcOrder({
                        ...o,
                        items: o.items.map(i =>
                            i.id === item.id ? { ...i, quantity: newQty, totalPrice: newTotal } : i
                        ),
                    });
                })
            );

            return { previousOrders };
        },
        onError: rollback,
        onSettled: settle,
    });

    // ========================================================================
    // MUTATION: Add item to existing order (optimistic)
    // ========================================================================

    const addItemMutation = useMutation({
        mutationFn: async ({ order, menuItem }: { order: GroupedOrder; menuItem: { id: string; name: string; price: number } }) => {
            if (!user) throw new Error('Not authenticated');
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const now = new Date().toISOString();
            const newId = uuidv4();

            // Insert service_order row
            await sb.from('service_orders').insert({
                id: newId,
                hotel_id: hotelId,
                booking_id: order.bookingId,
                service_id: menuItem.id,
                quantity: 1,
                unit_price: menuItem.price,
                total_price: menuItem.price,
                status: order.status === 'delivered' ? 'pending' : order.status,
                notes: `Added to order #${order.orderNumber}`,
                order_number: order.orderNumber,
                ordered_at: now,
                created_by: user.id,
                created_by_name: user.name,
                created_at: now,
            });

            // Accounting: add charge for the new item
            const { createCharge } = await import('@/db/accounting');
            const { data: hotel } = await sb.from('hotels').select('*').eq('id', hotelId).single();
            const taxRate = hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0;
            const grossAmount = Math.round(menuItem.price * (1 + taxRate / 100) * 100) / 100;

            const booking = !order.isWalkIn && order.bookingId
                ? (await sb.from('bookings').select('guest_id').eq('id', order.bookingId).single()).data
                : null;

            await createCharge({
                guest_id: booking?.guest_id,
                booking_id: order.isWalkIn ? undefined : order.bookingId,
                department: 'restaurant',
                description: `${menuItem.name} (added to #${order.orderNumber})`,
                gross_amount: grossAmount,
                tax_rate: taxRate,
                reference_id: order.orderNumber,
                reference_type: 'service_order',
                charge_date: new Date(),
            });

            // Decrement inventory for beverages
            if (menuItem.id.startsWith('inv_')) {
                const inventoryId = menuItem.id.replace('inv_', '');
                const { data: invItem } = await sb.from('inventory_items').select('current_stock').eq('id', inventoryId).single();
                if (invItem) {
                    await sb.from('inventory_items').update({
                        current_stock: Math.max(0, invItem.current_stock - 1),
                        updated_at: now,
                    }).eq('id', inventoryId);
                }
            }

            // Sync booking balance
            if (!order.isWalkIn && order.bookingId) {
                const { getBookingBalance } = await import('@/db/accounting');
                const balance = await getBookingBalance(order.bookingId);
                await sb.from('bookings').update({
                    total_charged: balance.totalCharges,
                    balance: balance.balance,
                    updated_at: now,
                }).eq('id', order.bookingId);
            }

            return { newId, menuItem };
        },
        onMutate: async ({ order, menuItem }) => {
            const previousOrders = await optimisticSetup();
            const tempId = `temp-${Date.now()}`;

            queryClient.setQueryData<GroupedOrder[]>(QUERY_KEY, old =>
                (old ?? []).map(o => {
                    if (o.orderNumber !== order.orderNumber) return o;
                    return recalcOrder({
                        ...o,
                        items: [...o.items, {
                            id: tempId,
                            serviceName: menuItem.name,
                            serviceId: menuItem.id,
                            quantity: 1,
                            unitPrice: menuItem.price,
                            totalPrice: menuItem.price,
                            status: (order.status === 'delivered' ? 'pending' : order.status) as ServiceOrderStatus,
                        }],
                    });
                })
            );

            return { previousOrders };
        },
        onError: rollback,
        onSettled: settle,
    });

    // ========================================================================
    // UI HANDLERS
    // ========================================================================

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

    const pendingCount = groupedOrders?.filter(o => o.status === 'pending').length ?? 0;
    const preparingCount = groupedOrders?.filter(o => o.status === 'preparing').length ?? 0;
    const deliveredCount = groupedOrders?.filter(o => o.status === 'delivered').length ?? 0;

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-3 border-l-4 border-amber-500">
                    <p className="text-sm text-slate-400">New Orders</p>
                    <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
                </div>
                <div className="card p-3 border-l-4 border-primary-500">
                    <p className="text-sm text-slate-400">Preparing</p>
                    <p className="text-2xl font-bold text-primary-400">{preparingCount}</p>
                </div>
                <div className="card p-3 border-l-4 border-status-available">
                    <p className="text-sm text-slate-400">Delivered Today</p>
                    <p className="text-2xl font-bold text-status-available">{deliveredCount}</p>
                </div>
                <div className="card p-3">
                    <p className="text-sm text-slate-400">Total Tickets</p>
                    <p className="text-2xl font-bold text-white">{groupedOrders?.length ?? 0}</p>
                </div>
            </div>

            {/* Orders List */}
            {!groupedOrders || groupedOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <Package size={48} className="mx-auto mb-3 opacity-50" />
                    <p>No orders yet</p>
                    <p className="text-sm text-slate-500 mt-1">Orders will appear here as kitchen tickets</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {groupedOrders.map((order) => {
                        const config = statusConfig[order.status];
                        const isExpanded = expandedOrders.has(order.orderNumber);
                        const isStatusLoading = statusMutation.isPending && (statusMutation.variables as any)?.order?.orderNumber === order.orderNumber;
                        const isEditable = order.status === 'pending' || order.status === 'preparing';
                        const isAddingItem = addingToOrder === order.orderNumber;

                        return (
                            <div
                                key={order.orderNumber}
                                className={`bg-slate-800 border rounded-xl overflow-hidden transition-all ${config.color.split(' ')[0]} border-slate-700`}
                            >
                                {/* Order Header */}
                                <div
                                    onClick={() => toggleExpand(order.orderNumber)}
                                    className="p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="text-slate-400 mt-1">
                                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-white font-bold font-mono">
                                                        #{order.orderNumber.split('-')[1] || order.orderNumber}
                                                    </h3>
                                                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
                                                        {config.icon}
                                                        {config.label}
                                                    </span>
                                                    <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">
                                                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                                    <MapPin size={14} />
                                                    <span>{order.isWalkIn ? 'Walk-in' : `Room ${order.roomNumber}`}</span>
                                                    <span>•</span>
                                                    <span>{order.guestName}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={10} />
                                                        {formatDistanceToNow(new Date(order.orderedAt), { addSuffix: true })}
                                                    </span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <User size={10} />
                                                        {order.staffName}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right side - Total & Actions */}
                                        <div className="text-right" onClick={(e) => e.stopPropagation()}>
                                            <p className="text-lg font-bold text-white mb-2">
                                                ₦{order.totalAmount.toLocaleString()}
                                            </p>

                                            {order.status === 'pending' && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => statusMutation.mutate({ order, newStatus: 'preparing' })}
                                                        disabled={isStatusLoading}
                                                        className="btn btn-primary text-sm py-1 px-3 disabled:opacity-50"
                                                    >
                                                        Start Order
                                                    </button>
                                                    <button
                                                        onClick={() => statusMutation.mutate({ order, newStatus: 'cancelled' })}
                                                        disabled={isStatusLoading}
                                                        className="btn btn-secondary text-sm py-1 px-3 disabled:opacity-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            )}

                                            {order.status === 'preparing' && (
                                                <button
                                                    onClick={() => statusMutation.mutate({ order, newStatus: 'delivered' })}
                                                    disabled={isStatusLoading}
                                                    className="btn btn-success text-sm py-1 px-3 disabled:opacity-50"
                                                >
                                                    Mark Ready
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Items List */}
                                {
                                    isExpanded && (
                                        <div className="border-t border-slate-700 bg-slate-900/50 p-4">
                                            <div className="space-y-2">
                                                {order.items.map((item) => {
                                                    const isItemMutating = (quantityMutation.isPending && (quantityMutation.variables as any)?.item?.id === item.id)
                                                        || (cancelItemMutation.isPending && (cancelItemMutation.variables as any)?.itemId === item.id);

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className={`flex items-center justify-between py-2 px-3 rounded-lg transition-all ${item.status === 'cancelled' ? 'bg-red-900/20 opacity-50 line-through' : 'bg-slate-800/50'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-primary-400 font-bold text-sm w-8">
                                                                    ×{item.quantity}
                                                                </span>
                                                                <div>
                                                                    <p className="text-white font-medium">{item.serviceName}</p>
                                                                    {item.notes && (
                                                                        <p className="text-xs text-slate-500 italic">"{item.notes}"</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-slate-400 font-medium mr-2">
                                                                    ₦{item.totalPrice.toLocaleString()}
                                                                </span>

                                                                {isEditable && item.status !== 'cancelled' && (
                                                                    <div className="flex items-center gap-1">
                                                                        <button
                                                                            onClick={() => quantityMutation.mutate({ item, order, delta: -1 })}
                                                                            disabled={isItemMutating || item.quantity <= 1}
                                                                            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-30 transition-colors"
                                                                            title="Decrease quantity"
                                                                        >
                                                                            <Minus size={12} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => quantityMutation.mutate({ item, order, delta: 1 })}
                                                                            disabled={isItemMutating}
                                                                            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-30 transition-colors"
                                                                            title="Increase quantity"
                                                                        >
                                                                            <Plus size={12} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => cancelItemMutation.mutate({ itemId: item.id })}
                                                                            disabled={isItemMutating}
                                                                            className="w-7 h-7 flex items-center justify-center rounded bg-red-500/20 hover:bg-red-500/40 text-red-400 disabled:opacity-30 transition-colors ml-1"
                                                                            title="Cancel item"
                                                                        >
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Add Item Section */}
                                            {isEditable && (
                                                <div className="mt-3 pt-3 border-t border-slate-700">
                                                    {!isAddingItem ? (
                                                        <button
                                                            onClick={() => { setAddingToOrder(order.orderNumber); setAddItemSearch(''); }}
                                                            className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
                                                        >
                                                            <PlusCircle size={16} />
                                                            Add item to this order
                                                        </button>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative flex-1">
                                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Search menu items..."
                                                                        value={addItemSearch}
                                                                        onChange={(e) => setAddItemSearch(e.target.value)}
                                                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                                                                        autoFocus
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => setAddingToOrder(null)}
                                                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg bg-slate-800/50 p-2">
                                                                {filteredMenuItems.length === 0 ? (
                                                                    <p className="text-sm text-slate-500 text-center py-4">No items found</p>
                                                                ) : (
                                                                    filteredMenuItems.map(menuItem => (
                                                                        <button
                                                                            key={menuItem.id}
                                                                            onClick={() => {
                                                                                addItemMutation.mutate({ order, menuItem });
                                                                                setAddingToOrder(null);
                                                                            }}
                                                                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
                                                                        >
                                                                            <div>
                                                                                <p className="text-sm text-white font-medium">{menuItem.name}</p>
                                                                                <p className="text-xs text-slate-500 capitalize">{menuItem.category}</p>
                                                                            </div>
                                                                            <span className="text-sm text-primary-400 font-medium">₦{menuItem.price.toLocaleString()}</span>
                                                                        </button>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Order Total */}
                                            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-700">
                                                <span className="text-slate-400 font-medium">Order Total</span>
                                                <span className="text-white font-bold text-lg">
                                                    ₦{order.totalAmount.toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                }
                            </div>
                        );
                    })}
                </div>
            )
            }
        </div >
    );
}
