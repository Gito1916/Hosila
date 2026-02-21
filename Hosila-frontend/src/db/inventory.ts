/**
 * Inventory operations — Supabase implementation
 * Replaces old Dexie-based inventory queries with Supabase API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { requireSupabase, getHotelId } from '@/lib/api';
import type {
    InventoryItem,
    InventoryMovement,
    InventoryCategory,
    MovementType,
    AmenityBehavior,
    IssuedAmenity,
    IssuedAmenityStatus,
} from '@/types';

// Get all inventory items
export async function getAllInventoryItems(): Promise<InventoryItem[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('inventory_items').select('*').eq('hotel_id', hotelId).order('name');
    if (error) throw error;
    return data ?? [];
}

// Get inventory items by category
export async function getInventoryByCategory(category: InventoryCategory): Promise<InventoryItem[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('inventory_items').select('*').eq('hotel_id', hotelId).eq('category', category);
    if (error) throw error;
    return data ?? [];
}

// Get low stock items
export async function getLowStockItems(): Promise<InventoryItem[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('inventory_items').select('*').eq('hotel_id', hotelId);
    if (error) throw error;
    return (data ?? []).filter((item: any) => item.current_stock <= item.min_stock_level);
}

// Get inventory item by ID
export async function getInventoryItemById(id: string): Promise<InventoryItem | undefined> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('inventory_items').select('*').eq('id', id).single();
    if (error) return undefined;
    return data ?? undefined;
}

// Create new inventory item
export async function createInventoryItem(data: {
    name: string;
    category: InventoryCategory;
    behavior?: AmenityBehavior;
    isAmenity?: boolean;
    defaultIssueQty?: number;
    unitType: string;
    currentStock: number;
    minStockLevel: number;
    unitCost: number;
    sellingPrice?: number;
    supplierName?: string;
    supplierContact?: string;
    reorderQuantity?: number;
    notes?: string;
}): Promise<InventoryItem> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    const item = {
        id: uuidv4(),
        hotel_id: hotelId,
        name: data.name,
        category: data.category,
        behavior: data.behavior ?? 'consumable',
        is_amenity: data.isAmenity ?? false,
        default_issue_qty: data.defaultIssueQty ?? 0,
        unit_type: data.unitType,
        current_stock: data.currentStock,
        min_stock_level: data.minStockLevel,
        unit_cost: data.unitCost,
        selling_price: data.sellingPrice,
        supplier_name: data.supplierName,
        supplier_contact: data.supplierContact,
        reorder_quantity: data.reorderQuantity,
        notes: data.notes,
        created_at: now,
        updated_at: now,
    };

    const { data: created, error } = await sb.from('inventory_items').insert(item).select().single();
    if (error) throw error;
    return created as InventoryItem;
}

// Update inventory item
export async function updateInventoryItem(id: string, data: Partial<InventoryItem>): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('inventory_items').update({
        ...data,
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
}

// Delete inventory item
export async function deleteInventoryItem(id: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('inventory_items').delete().eq('id', id);
    if (error) throw error;
}

// Record stock movement (add or deduct)
export async function recordMovement(data: {
    itemId: string;
    movementType: MovementType;
    quantity: number;
    reason?: string;
    department?: string;
    supplierName?: string;
    receiptUrl?: string;
    performedBy: string;
}): Promise<InventoryMovement> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Get current item
    const item = await getInventoryItemById(data.itemId);
    if (!item) throw new Error('Inventory item not found');

    // Calculate new balance
    let newBalance: number;
    if (data.movementType === 'add') {
        newBalance = item.current_stock + data.quantity;
    } else {
        newBalance = item.current_stock - data.quantity;
        if (newBalance < 0) throw new Error('Insufficient stock');
    }

    // Create movement record
    const movement = {
        id: uuidv4(),
        hotel_id: hotelId,
        item_id: data.itemId,
        movement_type: data.movementType,
        quantity: data.quantity,
        unit_cost: item.unit_cost,
        reason: data.reason,
        department: data.department,
        supplier_name: data.supplierName,
        receipt_url: data.receiptUrl,
        performed_by: data.performedBy,
        balance_after: newBalance,
        movement_time: now,
        created_at: now,
    };

    // Update item stock
    await sb.from('inventory_items').update({
        current_stock: newBalance,
        updated_at: now,
    }).eq('id', data.itemId);

    // Add movement
    const { error: movErr } = await sb.from('inventory_movements').insert(movement);
    if (movErr) throw movErr;

    // Log audit
    await sb.from('audit_logs').insert({
        id: uuidv4(),
        hotel_id: hotelId,
        user_id: data.performedBy,
        action: `inventory_${data.movementType}`,
        entity_type: 'inventory_item',
        entity_id: data.itemId,
        details: {
            item_name: item.name,
            quantity: data.quantity,
            previous_stock: item.current_stock,
            new_stock: newBalance,
            reason: data.reason,
        },
        timestamp: now,
    });

    return movement as unknown as InventoryMovement;
}

// Get movements for an item
export async function getMovementsForItem(itemId: string): Promise<InventoryMovement[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from('inventory_movements')
        .select('*')
        .eq('item_id', itemId)
        .order('movement_time', { ascending: false });
    if (error) throw error;
    return data ?? [];
}

// Get recent movements
export async function getRecentMovements(limit: number = 20): Promise<InventoryMovement[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('inventory_movements')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('movement_time', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data ?? [];
}

// Get inventory statistics
export async function getInventoryStats(): Promise<{
    totalItems: number;
    lowStockCount: number;
    totalValue: number;
    byCategory: Record<InventoryCategory, number>;
}> {
    const items = await getAllInventoryItems();

    const totalItems = items.length;
    const lowStockCount = items.filter((i: any) => i.current_stock <= i.min_stock_level).length;
    const totalValue = items.reduce((sum: number, i: any) => sum + (i.current_stock * i.unit_cost), 0);

    const byCategory = items.reduce((acc: any, item: any) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
    }, {} as Record<InventoryCategory, number>);

    return { totalItems, lowStockCount, totalValue, byCategory };
}

// =============================================================================
// Amenity Issuing Functions
// =============================================================================

// Get all amenity items (items that can be issued at check-in)
export async function getAmenityItems(): Promise<InventoryItem[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('inventory_items')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('is_amenity', true);
    if (error) throw error;
    return data ?? [];
}

// Get issued amenities for a booking
export async function getIssuedAmenitiesForBooking(bookingId: string): Promise<IssuedAmenity[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data, error } = await sb.from('issued_amenities')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('booking_id', bookingId);
    if (error) throw error;
    return data ?? [];
}

// Issue amenity at check-in
export async function issueAmenity(data: {
    bookingId: string;
    roomId: string;
    itemId: string;
    quantity: number;
    issuedBy: string;
}): Promise<IssuedAmenity> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Get the inventory item
    const item = await getInventoryItemById(data.itemId);
    if (!item) throw new Error('Inventory item not found');

    // For consumables, deduct stock immediately
    if (item.behavior === 'consumable') {
        if (item.current_stock < data.quantity) {
            throw new Error(`Insufficient stock for ${item.name}`);
        }

        const newBalance = item.current_stock - data.quantity;

        // Update stock
        await sb.from('inventory_items').update({
            current_stock: newBalance,
            updated_at: now,
        }).eq('id', data.itemId);

        // Log movement
        await sb.from('inventory_movements').insert({
            id: uuidv4(),
            hotel_id: hotelId,
            item_id: data.itemId,
            movement_type: 'deduct',
            quantity: data.quantity,
            unit_cost: item.unit_cost,
            reason: 'Issued at check-in',
            source: 'check_in',
            performed_by: data.issuedBy,
            balance_after: newBalance,
            movement_time: now,
            created_at: now,
        });
    }

    // Create issued amenity record
    const issuedAmenity = {
        id: uuidv4(),
        hotel_id: hotelId,
        booking_id: data.bookingId,
        room_id: data.roomId,
        item_id: data.itemId,
        item_name: item.name,
        quantity_issued: data.quantity,
        quantity_returned: 0,
        status: 'issued',
        issued_by: data.issuedBy,
        issued_at: now,
    };

    const { error } = await sb.from('issued_amenities').insert(issuedAmenity);
    if (error) throw error;
    return issuedAmenity as unknown as IssuedAmenity;
}

// Return amenity at checkout
export async function returnAmenity(data: {
    issuedAmenityId: string;
    quantityReturned: number;
    returnedBy: string;
}): Promise<IssuedAmenity> {
    const sb = requireSupabase();
    const now = new Date().toISOString();

    // Get the issued amenity
    const { data: issued, error: fetchErr } = await sb.from('issued_amenities')
        .select('*')
        .eq('id', data.issuedAmenityId)
        .single();
    if (fetchErr || !issued) throw new Error('Issued amenity not found');

    // Determine status
    let status: IssuedAmenityStatus = 'returned';
    if (data.quantityReturned === 0) {
        status = 'lost';
    } else if (data.quantityReturned < issued.quantity_issued) {
        status = 'partial';
    }

    // Update issued amenity
    const { error: updateErr } = await sb.from('issued_amenities').update({
        quantity_returned: data.quantityReturned,
        status,
        returned_at: now,
        returned_by: data.returnedBy,
    }).eq('id', data.issuedAmenityId);
    if (updateErr) throw updateErr;

    const { data: updated } = await sb.from('issued_amenities')
        .select('*')
        .eq('id', data.issuedAmenityId)
        .single();
    return updated as IssuedAmenity;
}

// Mark amenity as lost (with optional charge)
export async function markAmenityLost(data: {
    issuedAmenityId: string;
    lostQuantity: number;
    chargeAmount?: number;
    performedBy: string;
}): Promise<IssuedAmenity> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const now = new Date().toISOString();

    // Get the issued amenity
    const { data: issued, error: fetchErr } = await sb.from('issued_amenities')
        .select('*')
        .eq('id', data.issuedAmenityId)
        .single();
    if (fetchErr || !issued) throw new Error('Issued amenity not found');

    // Get the inventory item
    const item = await getInventoryItemById(issued.item_id);
    if (!item) throw new Error('Inventory item not found');

    // For returnable items, deduct lost quantity from stock
    if (item.behavior === 'returnable') {
        const newBalance = item.current_stock - data.lostQuantity;

        // Update stock
        await sb.from('inventory_items').update({
            current_stock: Math.max(0, newBalance),
            updated_at: now,
        }).eq('id', issued.item_id);

        // Log movement
        await sb.from('inventory_movements').insert({
            id: uuidv4(),
            hotel_id: hotelId,
            item_id: issued.item_id,
            movement_type: 'deduct',
            quantity: data.lostQuantity,
            unit_cost: item.unit_cost,
            reason: 'Lost/not returned at checkout',
            source: 'loss',
            issued_amenity_id: data.issuedAmenityId,
            performed_by: data.performedBy,
            balance_after: Math.max(0, newBalance),
            movement_time: now,
            created_at: now,
        });
    }

    // Determine status
    const quantityReturned = issued.quantity_issued - data.lostQuantity;
    const status: IssuedAmenityStatus = quantityReturned > 0 ? 'partial' : 'lost';

    // Update issued amenity
    await sb.from('issued_amenities').update({
        quantity_returned: quantityReturned,
        status,
        loss_charge: data.chargeAmount,
        returned_at: now,
        returned_by: data.performedBy,
    }).eq('id', data.issuedAmenityId);

    const { data: updated } = await sb.from('issued_amenities')
        .select('*')
        .eq('id', data.issuedAmenityId)
        .single();
    return updated as IssuedAmenity;
}

// Get unresolved returnables for a booking (for checkout reconciliation)
export async function getUnresolvedReturnables(bookingId: string): Promise<IssuedAmenity[]> {
    const sb = requireSupabase();
    const hotelId = await getHotelId();
    const { data: issuedAmenities, error } = await sb.from('issued_amenities')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('booking_id', bookingId)
        .eq('status', 'issued');
    if (error) throw error;

    // Get item details to filter by behavior
    const unresolvedReturnables: IssuedAmenity[] = [];
    for (const issued of (issuedAmenities ?? [])) {
        const item = await getInventoryItemById(issued.item_id);
        if (item?.behavior === 'returnable') {
            unresolvedReturnables.push(issued as IssuedAmenity);
        }
    }

    return unresolvedReturnables;
}
