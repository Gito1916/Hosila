/**
 * Service operations — Supabase implementation
 * Replaces old Dexie-based service queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type { Service, ServiceOrder, ServiceCategory, ServiceOrderStatus } from '@/types';

// Get all services
export async function getAllServices(): Promise<Service[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('services').select('*').eq('hotel_id', hotelId).order('name');
    if (error) throw error;
    return data ?? [];
}

// Get services by category
export async function getServicesByCategory(category: ServiceCategory): Promise<Service[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('services').select('*').eq('hotel_id', hotelId).eq('category', category);
    if (error) throw error;
    return data ?? [];
}

// Get active services (available for ordering)
export async function getActiveServices(): Promise<Service[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('services').select('*').eq('hotel_id', hotelId).neq('is_active', false);
    if (error) throw error;
    return data ?? [];
}

// Get service by ID
export async function getServiceById(id: string): Promise<Service | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('services').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Create new service
export async function createService(data: {
    name: string;
    category: ServiceCategory;
    price: number;
    description?: string;
    isActive?: boolean;
    usesInventory?: boolean;
}): Promise<Service> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    const service = {
        id: uuidv4(),
        hotel_id: hotelId,
        name: data.name,
        category: data.category,
        price: data.price,
        description: data.description,
        uses_inventory: data.usesInventory ?? false,
        is_active: data.isActive ?? true,
        created_at: now,
        updated_at: now,
    };

    const { data: created, error } = await sb.from('services').insert(service).select().single();
    if (error) throw error;
    return created as Service;
}

// Update service
export async function updateService(id: string, data: Partial<Service>): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('services').update({
        ...data,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Delete service
export async function deleteService(id: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('services').delete().eq('id', id);
    if (error) throw error;
}

// Place service order (add to guest's tab)
export async function placeServiceOrder(data: {
    bookingId: string;
    serviceId: string;
    quantity: number;
    notes?: string;
    createdBy: string;
}): Promise<ServiceOrder> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();

    // Get the service to get price
    const service = await getServiceById(data.serviceId);
    if (!service) throw new Error('Service not found');

    // Get the booking to verify it's active
    const { data: booking, error: bErr } = await sb.from('bookings').select('*').eq('id', data.bookingId).single();
    if (bErr || !booking) throw new Error('Booking not found');
    if (booking.status !== 'active') throw new Error('Cannot add services to inactive booking');

    const totalPrice = service.price * data.quantity;

    const order = {
        id: uuidv4(),
        hotel_id: hotelId,
        booking_id: data.bookingId,
        service_id: data.serviceId,
        quantity: data.quantity,
        unit_price: service.price,
        total_price: totalPrice,
        status: 'pending',
        notes: data.notes,
        ordered_at: nowIso,
        created_by: data.createdBy,
        created_at: nowIso,
    };

    const { error: orderErr } = await sb.from('service_orders').insert(order);
    if (orderErr) throw orderErr;

    // Update booking total_charged
    await sb.from('bookings').update({
        total_charged: Number(booking.total_charged) + totalPrice,
        balance: Number(booking.balance) + totalPrice,
        updated_at: nowIso,
    }).eq('id', data.bookingId);

    // Auto-update existing invoice if one exists
    const { data: existingInvoice } = await sb.from('invoices')
        .select('*')
        .eq('booking_id', data.bookingId)
        .limit(1)
        .maybeSingle();

    if (existingInvoice) {
        // Recalculate invoice totals
        const { data: allOrders } = await sb.from('service_orders')
            .select('total_price')
            .eq('booking_id', data.bookingId);
        const servicesTotal = (allOrders ?? []).reduce((sum: number, o: any) => sum + Number(o.total_price), 0);

        const { data: hotel } = await sb.from('hotels').select('settings').limit(1).single();
        const accommodationTaxRate = Number(hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0);
        const servicesTaxRate = Number(hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0);

        const accommodationTax = Number(booking.rate) * (accommodationTaxRate / 100);
        const servicesTax = servicesTotal * (servicesTaxRate / 100);

        const newSubtotal = Number(booking.rate) + servicesTotal;
        const newTax = accommodationTax + servicesTax;
        const newTotal = newSubtotal + newTax;

        // Add new service to items
        const newItem = {
            description: `${service.name}${order.status !== 'delivered' ? ' (pending)' : ''}`,
            quantity: data.quantity,
            unit_price: service.price,
            total: totalPrice,
        };

        const updatedItems = [...(existingInvoice.items ?? []), newItem];

        // Get payments to determine status
        const { data: allPayments } = await sb.from('payments')
            .select('amount')
            .eq('booking_id', data.bookingId);
        const totalPaid = (allPayments ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

        let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
        if (totalPaid >= newTotal) status = 'paid';
        else if (totalPaid > 0) status = 'partial';

        await sb.from('invoices').update({
            items: updatedItems,
            subtotal: newSubtotal,
            tax: newTax,
            total: newTotal,
            status,
        }).eq('id', existingInvoice.id);
    }

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: data.createdBy,
        action: 'place_service_order',
        entity_type: 'service_order',
        entity_id: order.id,
        details: {
            service_name: service.name,
            quantity: data.quantity,
            total: totalPrice,
            booking_id: data.bookingId,
        },
        timestamp: nowIso,
    });

    return order as unknown as ServiceOrder;
}

// Update service order status
export async function updateOrderStatus(
    orderId: string,
    status: ServiceOrderStatus,
    userId: string
): Promise<void> {
    const sb = requireSupabase();
    const { data: order, error: fetchErr } = await sb.from('service_orders').select('*').eq('id', orderId).single();
    if (fetchErr || !order) throw new Error('Order not found');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = { status };

    if (status === 'delivered') {
        updates.delivered_at = new Date().toISOString();
    }

    // Handle cancellation — reverse the accounting charge
    if (status === 'cancelled') {
        const { createReversal, getBookingBalance } = await import('./accounting');

        // Find the charge linked to this order's order_number
        const { data: charges } = await sb.from('charges')
            .select('*')
            .eq('reference_id', order.order_number ?? orderId);

        const activeCharge = (charges ?? []).find((c: any) => c.status === 'active');
        if (activeCharge) {
            await createReversal(activeCharge.id, `Order #${order.order_number} cancelled`);
        }

        // Sync booking balance from accounting engine
        if (order.booking_id && order.booking_id !== 'walk-in') {
            const balance = await getBookingBalance(order.booking_id);
            await sb.from('bookings').update({
                total_charged: balance.totalCharges,
                balance: balance.balance,
                updated_at: new Date().toISOString(),
            }).eq('id', order.booking_id);
        }
    }

    await sb.from('service_orders').update(updates).eq('id', orderId);

    // Log audit
    const hotelId = await getHotelId();
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: userId,
        action: 'update_order_status',
        entity_type: 'service_order',
        entity_id: orderId,
        details: { new_status: status },
        timestamp: new Date().toISOString(),
    });
}

// Get orders for a booking
export async function getOrdersForBooking(bookingId: string): Promise<ServiceOrder[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('service_orders').select('*').eq('booking_id', bookingId);
    if (error) throw error;
    return data ?? [];
}

// Get pending orders
export async function getPendingOrders(): Promise<ServiceOrder[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('service_orders')
        .select('*')
        .eq('hotel_id', hotelId)
        .in('status', ['pending', 'preparing']);
    if (error) throw error;
    return data ?? [];
}

// Get service order with details
export async function getOrderWithDetails(orderId: string): Promise<{
    order: ServiceOrder;
    service: Service | undefined;
    booking: { room_number: string; guest_name: string } | undefined;
} | null> {
    const sb = requireSupabase();
    const { data: order, error } = await sb.from('service_orders').select('*').eq('id', orderId).single();
    if (error || !order) return null;

    const service = await getServiceById(order.service_id);

    let bookingDetails: { room_number: string; guest_name: string } | undefined;
    if (order.booking_id) {
        const { data: booking } = await sb.from('bookings').select('room_id, guest_id').eq('id', order.booking_id).single();
        if (booking) {
            const { data: room } = await sb.from('rooms').select('room_number').eq('id', booking.room_id).single();
            const { data: guest } = await sb.from('guests').select('name').eq('id', booking.guest_id).single();
            bookingDetails = {
                room_number: room?.room_number ?? 'Unknown',
                guest_name: guest?.name ?? 'Unknown',
            };
        }
    }

    return { order: order as ServiceOrder, service, booking: bookingDetails };
}

// Create a manual service charge (for ledger entries like laundry, car wash)
export async function createServiceCharge(data: {
    bookingId: string;
    guestId?: string;
    serviceId: string;
    serviceName: string;
    amount: number;
    taxRate?: number;
    notes?: string;
    createdBy: string;
}): Promise<ServiceOrder> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date();
    const nowIso = now.toISOString();

    // Tax calculation: amount is the base, total includes tax
    const taxRate = data.taxRate ?? 0;
    const taxAmount = taxRate > 0 ? Math.round(data.amount * (taxRate / 100) * 100) / 100 : 0;
    const totalAmount = Math.round((data.amount + taxAmount) * 100) / 100;

    // Generate order number
    const orderNumber = `${now.getDate().toString().padStart(2, '0')}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear()}-SVC`;

    const order = {
        id: uuidv4(),
        hotel_id: hotelId,
        booking_id: data.bookingId,
        service_id: data.serviceId,
        quantity: 1,
        unit_price: data.amount,
        total_price: totalAmount,
        status: 'delivered',
        ordered_at: nowIso,
        delivered_at: nowIso,
        created_by: data.createdBy,
        notes: data.notes ?? data.serviceName,
        order_number: orderNumber,
        created_at: nowIso,
    };

    const { error: orderErr } = await sb.from('service_orders').insert(order);
    if (orderErr) throw orderErr;

    // Create accounting charge (DR: Guest AR, CR: Revenue, CR: Tax)
    const { createCharge } = await import('@/db/accounting');
    await createCharge({
        booking_id: data.bookingId,
        guest_id: data.guestId,
        department: 'other_services',
        description: data.serviceName + (data.notes ? `: ${data.notes}` : ''),
        gross_amount: totalAmount,
        tax_rate: taxRate,
        reference_id: order.id,
        reference_type: 'service_order',
        charge_date: now,
    });

    // Update booking balance
    const { data: booking } = await sb.from('bookings').select('*').eq('id', data.bookingId).single();
    if (booking) {
        const newTotalCharged = Number(booking.total_charged) + Number(totalAmount);
        const newBalance = newTotalCharged - Number(booking.total_paid);
        await sb.from('bookings').update({
            total_charged: newTotalCharged,
            balance: newBalance,
            updated_at: nowIso,
        }).eq('id', data.bookingId);
    }

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: data.createdBy,
        action: 'add_service_charge',
        entity_type: 'service_order',
        entity_id: order.id,
        details: {
            booking_id: data.bookingId,
            service: data.serviceName,
            base_amount: data.amount,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total_amount: totalAmount,
        },
        timestamp: nowIso,
    });

    return order as unknown as ServiceOrder;
}
