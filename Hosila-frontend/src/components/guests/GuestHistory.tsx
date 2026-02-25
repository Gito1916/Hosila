import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { History, Printer, User, UtensilsCrossed, ChevronDown, ChevronUp } from 'lucide-react';
import { getReceiptsByBooking } from '@/db/billing';
import { ReceiptView } from '@/components/billing/InvoiceReceipt';
import { toast } from '@/lib/errorMessages';
import type { Receipt, Booking } from '@/types';
import { getAllGuests } from '@/db/guests';
import { getAllRooms } from '@/db/rooms';
import { getAllServices } from '@/db/services';
import { getAllInventoryItems } from '@/db/inventory';
import { requireSupabase, getHotelId } from '@/lib/api';

export function GuestHistory() {
    const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
    const [currentReceipt, setCurrentReceipt] = useState<Receipt | null>(null);

    // Get bookings from last 30 days that are checked out
    const thirtyDaysAgo = subDays(new Date(), 30);

    const { data: recentBookings } = useQuery({
        queryKey: ['recentBookings'], queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data: bookings } = await sb
                .from('bookings')
                .select('*')
                .eq('hotel_id', hotelId)
                .eq('status', 'checked_out')
                .gte('check_out_time', thirtyDaysAgo.toISOString())
                .order('check_out_time', { ascending: false });

            return (bookings ?? []) as Booking[];
        }
    });

    // Get guests for these bookings
    const { data: guests } = useQuery({ queryKey: ['guests'], queryFn: getAllGuests });
    const guestMap = new Map(guests?.map(g => [g.id, g]) ?? []);

    // Get rooms for these bookings
    const { data: rooms } = useQuery({ queryKey: ['rooms'], queryFn: getAllRooms });
    const roomMap = new Map(rooms?.map(r => [r.id, r]) ?? []);

    // Get service orders for expanded booking
    const { data: serviceOrders } = useQuery({
        queryKey: ['serviceOrders', expandedBookingId], queryFn: async () => {
            if (!expandedBookingId) return [];
            return (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('service_orders').select('*').eq('hotel_id', hotelId).eq('booking_id', expandedBookingId); return data ?? []; })();
        }, enabled: !!expandedBookingId
    });

    // Get services and inventory items for naming (beverages have inv_ prefixed IDs)
    const { data: services } = useQuery({ queryKey: ['services'], queryFn: getAllServices });
    const { data: inventoryItems } = useQuery({ queryKey: ['inventory_items'], queryFn: getAllInventoryItems });

    // Combined lookup map for both services, inventory items, and extensions
    const serviceMap = new Map<string, { name: string }>([
        ...(services?.map(s => [s.id, { name: s.name }] as [string, { name: string }]) ?? []),
        ...(inventoryItems?.map(i => [`inv_${i.id}`, { name: i.name }] as [string, { name: string }]) ?? []),
        ['extension', { name: 'Room Stay Extension' }], // Special entry for stay extensions
    ]);

    const handlePrintReceipt = async (booking: Booking) => {
        // Get receipts for this booking
        const receipts = await getReceiptsByBooking(booking.id);
        if (receipts.length > 0) {
            // Use the most recent receipt
            const latestReceipt = receipts.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0];
            setCurrentReceipt(latestReceipt);
        } else {
            // No receipt found - show message
            toast.info('No receipt found', 'No receipt was generated for this booking.');
        }
    };

    if (!recentBookings || recentBookings.length === 0) {
        return (
            <div className="card p-8 text-center">
                <History size={48} className="mx-auto mb-4 text-muted opacity-50" />
                <p className="text-muted">No checkout history in the last 30 days</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-heading flex items-center gap-2">
                    <History size={20} />
                    Guest History (Last 30 Days)
                </h3>
                <span className="text-sm text-muted">{recentBookings.length} records</span>
            </div>

            <div className="space-y-2">
                {recentBookings.map((booking) => {
                    const guest = guestMap.get(booking.guest_id);
                    const room = roomMap.get(booking.room_id);
                    const isExpanded = expandedBookingId === booking.id;

                    return (
                        <div key={booking.id} className="card overflow-hidden">
                            {/* Main Row */}
                            <div
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-surface-raised transition-colors"
                                onClick={() => setExpandedBookingId(isExpanded ? null : booking.id)}
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    {/* Guest Avatar */}
                                    <div className="w-10 h-10 bg-surface-raised rounded-full flex items-center justify-center flex-shrink-0">
                                        <User size={20} className="text-muted" />
                                    </div>

                                    {/* Guest Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-heading font-medium truncate">{guest?.name ?? 'Unknown Guest'}</p>
                                        <div className="flex items-center gap-2 text-xs text-muted">
                                            <span>Room {room?.room_number ?? 'N/A'}</span>
                                            <span>•</span>
                                            <span>{format(new Date(booking.check_out_time!), 'MMM d, yyyy')}</span>
                                        </div>
                                    </div>

                                    {/* Amount */}
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-heading font-medium">₦{booking.total_charged?.toLocaleString() ?? 0}</p>
                                        <p className={`text-xs ${booking.balance > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                                            {booking.balance > 0 ? `₦${booking.balance.toLocaleString()} unpaid` : 'Paid'}
                                        </p>
                                    </div>
                                </div>

                                {/* Expand/Collapse */}
                                <div className="ml-4 text-muted">
                                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="px-4 pb-4 pt-2 border-t border-border">
                                    {/* Stay Details */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                                        <div>
                                            <p className="text-muted">Check-in</p>
                                            <p className="text-heading">{format(new Date(booking.check_in_time), 'MMM d, h:mm a')}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted">Check-out</p>
                                            <p className="text-heading">{format(new Date(booking.check_out_time!), 'MMM d, h:mm a')}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted">Total Paid</p>
                                            <p className="text-green-400">₦{booking.total_paid?.toLocaleString() ?? 0}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted">Booking Type</p>
                                            <p className="text-heading capitalize">{booking.booking_type.replace('_', ' ')}</p>
                                        </div>
                                    </div>

                                    {/* Service Orders */}
                                    {serviceOrders && serviceOrders.length > 0 && (
                                        <div className="mb-4">
                                            <p className="text-xs text-muted mb-2 flex items-center gap-1">
                                                <UtensilsCrossed size={12} />
                                                Items Ordered During Stay
                                            </p>
                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                {serviceOrders.map((order) => {
                                                    const service = serviceMap.get(order.service_id);
                                                    const displayName = order.service_id === 'extension' && order.notes
                                                        ? order.notes
                                                        : service?.name ?? 'Item';
                                                    return (
                                                        <div key={order.id} className="flex justify-between text-sm py-1 px-2 bg-surface-raised/50 rounded">
                                                            <span className="text-muted">
                                                                {displayName} {order.service_id !== 'extension' && `× ${order.quantity}`}
                                                            </span>
                                                            <span className="text-heading">₦{order.total_price.toLocaleString()}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePrintReceipt(booking);
                                        }}
                                        className="btn btn-secondary text-sm"
                                    >
                                        <Printer size={16} className="mr-2" />
                                        Reprint Receipt
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Receipt Modal */}
            {currentReceipt && (
                <ReceiptView
                    receipt={currentReceipt}
                    onClose={() => setCurrentReceipt(null)}
                />
            )}
        </div>
    );
}
