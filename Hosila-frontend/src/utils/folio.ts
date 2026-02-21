import type { GuestFolio, ServiceOrder } from '@/types';
import { requireSupabase, getHotelId } from '@/lib/api';

export interface ChargeItem {
    id: string;
    date: Date;
    description: string;
    type: 'room' | 'restaurant' | 'service';
    amount: number;
    status: 'paid' | 'partial' | 'unpaid';
    paidAmount: number;
    originalOrder?: ServiceOrder;
}

export interface FolioCalculations extends GuestFolio {
    charges: ChargeItem[];
}

// Calculate folio for a booking — ACCOUNTING v2: derives from charges + allocations tables
export async function calculateFolio(bookingId: string): Promise<FolioCalculations | null> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: booking } = await sb.from('bookings').select('*').eq('id', bookingId).single();
    if (!booking) return null;

    const { data: guest } = await sb.from('guests').select('*').eq('id', booking.guest_id).single();
    if (!guest) return null;

    const { data: room } = await sb.from('rooms').select('*').eq('id', booking.room_id).single();
    if (!room) return null;

    // Get service orders for legacy compatibility (some UI still references them)
    const { data: serviceOrders } = await sb.from('service_orders').select('*').eq('booking_id', bookingId);

    // Get payments for this booking
    const { data: payments } = await sb.from('payments').select('*').eq('booking_id', bookingId);

    // === ACCOUNTING v2: Read from charges + payment_allocations ===
    const { data: bookingCharges } = await sb.from('charges').select('*').eq('booking_id', bookingId);

    const { data: allAllocations } = await sb.from('payment_allocations').select('*').eq('hotel_id', hotelId);

    // Only include active/partially_refunded charges
    const activeCharges = (bookingCharges ?? []).filter(c =>
        c.status === 'active' || c.status === 'partially_refunded'
    );

    // Build ChargeItem list from charges table
    const chargeItems: ChargeItem[] = activeCharges
        .sort((a, b) => new Date(a.charge_date).getTime() - new Date(b.charge_date).getTime())
        .map(charge => {
            // Determine type from department
            let type: 'room' | 'restaurant' | 'service';
            if (charge.department === 'accommodation') type = 'room';
            else if (charge.department === 'restaurant') type = 'restaurant';
            else type = 'service';

            // Calculate how much has been allocated to this charge
            const allocations = (allAllocations ?? []).filter(
                a => a.charge_id === charge.id && a.status === 'active'
            );
            const paidAmount = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);

            let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
            if (paidAmount >= charge.gross_amount) status = 'paid';
            else if (paidAmount > 0) status = 'partial';

            // Find matching service order for legacy compatibility
            const matchingOrder = (serviceOrders ?? []).find(o =>
                (o.order_number && charge.reference_id === o.order_number) ||
                charge.reference_id === o.id
            );

            return {
                id: charge.id,
                date: new Date(charge.charge_date),
                description: charge.description,
                type,
                amount: charge.gross_amount,
                status,
                paidAmount,
                originalOrder: matchingOrder,
            };
        });

    // Calculate totals from charges
    const roomCharges = activeCharges
        .filter(c => c.department === 'accommodation')
        .reduce((sum, c) => sum + c.gross_amount, 0);
    const roomTax = activeCharges
        .filter(c => c.department === 'accommodation')
        .reduce((sum, c) => sum + c.tax_amount, 0);

    const serviceChargesAmount = activeCharges
        .filter(c => c.department !== 'accommodation')
        .reduce((sum, c) => sum + c.net_revenue, 0);
    const serviceTax = activeCharges
        .filter(c => c.department !== 'accommodation')
        .reduce((sum, c) => sum + c.tax_amount, 0);

    const totalCharges = activeCharges.reduce((sum, c) => sum + c.gross_amount, 0);
    const totalPaid = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);
    const balance = totalCharges - totalPaid;

    return {
        booking,
        guest,
        room,
        service_orders: serviceOrders ?? [],
        payments: payments ?? [],
        room_charges: roomCharges,
        room_tax: roomTax,
        service_charges: serviceChargesAmount,
        service_tax: serviceTax,
        total_charges: totalCharges,
        total_paid: totalPaid,
        balance,
        charges: chargeItems
    };
}

// Get all active folios (guests with active bookings)
export async function getActiveFolios(): Promise<GuestFolio[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();

    const { data: activeBookings } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('status', 'active');

    const folios: GuestFolio[] = [];

    for (const booking of (activeBookings ?? [])) {
        const folio = await calculateFolio(booking.id);
        if (folio) {
            folios.push(folio);
        }
    }

    return folios;
}

// Get folios with outstanding balance
export async function getFoliosWithBalance(): Promise<GuestFolio[]> {
    const folios = await getActiveFolios();
    return folios.filter(f => f.balance > 0);
}

// Get total outstanding balance
export async function getTotalOutstandingBalance(): Promise<number> {
    const folios = await getActiveFolios();
    return folios.reduce((sum, f) => sum + Math.max(0, f.balance), 0);
}

// Format currency for Nigeria
export function formatCurrency(amount: number): string {
    return `₦${amount.toLocaleString()}`;
}

// Generate receipt data using the new structure
export function generateReceiptData(folio: FolioCalculations) {
    return {
        header: {
            hotelName: 'HotelFlow',
            date: new Date().toLocaleDateString(),
            receiptNo: `INV-${folio.booking.id.slice(0, 8).toUpperCase()}`,
        },
        guest: {
            name: folio.guest.name,
            room: `Room ${folio.room.room_number}`,
        },
        items: folio.charges.map(c => ({
            description: c.description,
            amount: c.amount,
            status: c.status
        })),
        payments: folio.payments.map(p => ({
            method: p.payment_method.toUpperCase(),
            amount: p.amount,
            date: new Date(p.payment_time).toLocaleDateString(),
        })),
        totals: {
            charges: folio.total_charges,
            roomTax: folio.room_tax,
            serviceTax: folio.service_tax,
            totalTax: folio.room_tax + folio.service_tax,
            paid: folio.total_paid,
            balance: folio.balance,
        },
    };
}
