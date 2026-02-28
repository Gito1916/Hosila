// Room status types
export type RoomStatus = 'available' | 'occupied' | 'dirty' | 'maintenance' | 'short_rest';

// Booking types
export type BookingType = 'night' | 'short_rest';

// Payment methods
export type PaymentMethod = 'cash' | 'transfer' | 'pos';

// User roles - back_desk only has access to services
export type UserRole = 'admin' | 'manager' | 'reception' | 'housekeeping' | 'accountant' | 'back_desk';

// Reservation status
export type ReservationStatus = 'confirmed' | 'pending' | 'cancelled' | 'checked_in' | 'no_show';

// Reservation source
export type ReservationSource = 'walk-in' | 'phone' | 'booking.com' | 'airbnb' | 'direct' | 'email-import';

// ID types for guests
export type IdType = 'passport' | 'national_id' | 'drivers_license' | 'voters_card' | 'other';

// Inventory categories
export type InventoryCategory =
    | 'food'           // Kitchen consumables, restaurant supplies
    | 'housekeeping'   // Cleaning supplies, toiletries
    | 'maintenance'    // Tools, spare parts, repairs
    | 'front_office'   // Stationery, printing supplies
    | 'beverages'      // Drinks, bar stock
    | 'laundry'        // Laundry chemicals, linens
    | 'amenities';     // Guest amenities

// Service categories
export type ServiceCategory = 'food' | 'beverage' | 'laundry' | 'transport' | 'cleaning' | 'room_service' | 'other';

// Service order status
export type ServiceOrderStatus = 'pending' | 'preparing' | 'delivered' | 'cancelled';

// Expense categories
export type ExpenseCategory = 'utilities' | 'maintenance' | 'supplies' | 'salaries' | 'marketing' | 'caution_refund' | 'cancellation_refund' | 'caution_deposit_refund' | 'other';

// Other income categories (venue rentals, events, etc.)
export type IncomeCategory = 'venue_rental' | 'swimming_pool' | 'parking' | 'laundry_external' | 'caution_fee' | 'other';

// Transaction types for unified financial ledger (LEGACY — kept for backward compat)
export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'accommodation' | 'restaurant' | 'other_income' | 'expense';
export type TransactionDepartment = 'accommodation' | 'restaurant' | 'other';
export type TransactionStatus = 'pending' | 'completed' | 'reversed' | 'reversal';

// =============================================================================
// Accounting System v2 — Charge-based double-entry accounting
// =============================================================================

export type ChargeDepartment = 'accommodation' | 'restaurant' | 'other_services' | 'other_income';
export type ChargeStatus = 'active' | 'cancelled' | 'refunded' | 'partially_refunded';
export type JournalAccountCode =
    | '1010'  // Cash
    | '1020'  // Guest Accounts Receivable
    | '2010'  // Tax Payable
    | '4010'  // Accommodation Revenue
    | '4020'  // F&B Revenue
    | '4030'  // Other Services Revenue (laundry, car wash, etc.)
    | '4040'  // Other Income Revenue (venue rental, pool fees, etc.)
    | '4910'  // Accommodation Refunds/Cancellations
    | '4920'  // F&B Refunds/Cancellations
    | '4930'  // Other Services Refunds/Cancellations
    | '4940'; // Other Income Refunds/Cancellations

// Charge (Revenue Ledger) — records what the guest owes
export interface Charge {
    id: string;
    hotel_id: string;
    guest_id?: string;         // null for walk-in
    booking_id?: string;       // null for walk-in
    department: ChargeDepartment;
    description: string;
    gross_amount: number;      // Total including tax
    net_revenue: number;       // Revenue excluding tax
    tax_amount: number;        // VAT portion
    service_charge_amount?: number; // Service charge portion
    tdl_amount?: number;       // Tourism Development Levy portion
    tax_rate: number;          // Rate used (stored at transaction time)
    status: ChargeStatus;
    reference_id?: string;     // service_order_id, booking_id, etc.
    reference_type?: string;   // 'room', 'service_order', 'manual', 'extension'
    charge_date: Date;
    cancelled_date?: Date;
    refunded_amount?: number;
    created_at: Date;
}

// Payment Allocation — links payments to specific charges (CRITICAL for correct dept allocation)
export interface PaymentAllocation {
    id: string;
    hotel_id: string;
    payment_id: string;
    charge_id: string;
    allocated_amount: number;
    status: 'active' | 'voided';
    allocation_date: Date;
    created_at: Date;
}

// Journal Entry — immutable audit log, single source of truth for all financial reporting
export interface JournalEntry {
    id: string;
    hotel_id: string;
    entry_date: Date;
    description: string;
    account_code: JournalAccountCode;
    entry_type: 'debit' | 'credit';
    amount: number;
    department?: ChargeDepartment;
    reference_type: 'charge' | 'payment' | 'refund' | 'reversal' | 'expense';
    reference_id: string;       // links to charge/payment that created it
    created_at: Date;
}

// Movement types
export type MovementType = 'add' | 'deduct';

// Amenity behavior - consumable (deducted immediately) vs returnable (tracked until checkout)
export type AmenityBehavior = 'consumable' | 'returnable';

// Issued amenity status
export type IssuedAmenityStatus = 'issued' | 'returned' | 'lost' | 'partial';

// Movement source - tracks origin of inventory movements
export type MovementSource = 'check_in' | 'checkout' | 'loss' | 'restock' | 'adjustment' | 'service_order';

// Sync status
export type SyncStatus = 'pending' | 'synced' | 'error';

// =============================================================================
// Entity Interfaces
// =============================================================================

export interface Hotel {
    id: string;
    tenant_id?: string; // Supabase auth user who owns this hotel
    name: string;
    logo_url?: string;
    address?: string;
    phone?: string;
    email?: string;
    settings?: HotelSettings;
    created_at: Date;
    updated_at: Date;
}

// Service charge configuration
export interface ServiceChargeConfig {
    id: string;
    name: string;
    type: 'mandatory' | 'optional';
    rate_type: 'percentage' | 'flat';
    rate: number;
    applies_to: ('rooms' | 'restaurant')[];
    is_taxable: boolean;
    is_active: boolean;
}

export interface HotelSettings {
    // Feature toggles for advanced settings (default: false/undefined for new hotels)
    email_import_enabled?: boolean;
    website_api_enabled?: boolean;
    guest_emails_enabled?: boolean;
    checkout_time: string; // e.g., "12:00"
    short_rest_enabled: boolean;
    short_rest_min_hours: number;
    short_rest_max_hours: number;
    night_audit_time: string; // e.g., "03:00"
    currency: string;
    tax_rate: number; // Legacy - default tax rate
    accommodation_tax_rate?: number; // Tax for room charges
    services_tax_rate?: number; // Tax for food/beverage
    // Service charges
    service_charges?: ServiceChargeConfig[];
    // Automation rules
    late_checkout_fee?: number; // Fee per hour for late checkout
    auto_service_charge?: number; // Percentage added to restaurant orders
    auto_late_checkout_enabled?: boolean;
    auto_service_charge_enabled?: boolean;
    enable_restaurant_orders?: boolean;
    // Credit limit settings
    credit_limit_enabled?: boolean;
    credit_limit_amount?: number; // Default: 50000
    // Session timeout (minutes)
    session_timeout_minutes?: number; // Default: 30
    // Demo mode
    is_demo_mode?: boolean;
    // Receipt/Invoice
    receipt_footer?: string;
    invoice_terms?: string;
    // Onboarding
    onboarding_complete?: boolean;
    // Configurable tax name (default: 'TDL')
    // Allows hotels in different states to rename TDL to their local tax name
    // e.g., 'Consumption Tax', 'Tourism Levy', 'Hotel Occupancy Tax', etc.
    tdl_name?: string;
    // Tax-inclusive pricing: when true, displayed prices already include taxes
    // The tax engine will extract taxes from the total instead of adding them on top
    tax_inclusive_pricing?: boolean;
}

export interface Room {
    id: string;
    hotel_id: string;
    room_number: string;
    room_type: string;
    floor_number?: number;
    max_occupancy: number;
    night_rate: number;
    short_rest_hourly_rate?: number;
    short_rest_packages?: ShortRestPackage[];
    amenities?: string[];
    status: RoomStatus;
    housekeeping_status?: HousekeepingStatus;
    maintenance_reason?: string;
    created_at: Date;
    updated_at: Date;
}

// Housekeeping status for rooms
export type HousekeepingStatus = 'clean' | 'inspected' | 'dirty' | 'in_progress';

export interface ShortRestPackage {
    duration: number; // in hours
    rate: number;
}

// Custom room types defined by hotel
export interface RoomType {
    id: string;
    hotel_id: string;
    name: string;
    description?: string;
    base_rate: number;
    created_at: Date;
}

export interface Guest {
    id: string;
    hotel_id: string;
    name: string;
    phone?: string;
    email?: string;
    gender?: 'male' | 'female' | 'other';
    id_type?: IdType;
    id_number?: string;
    address?: string;
    occupation?: string;
    reason_for_visit?: 'business' | 'leisure' | 'medical' | 'family_event' | 'transit' | 'other';
    vehicle_number?: string;
    vehicle_model?: string;
    preferences?: Record<string, unknown>;
    is_vip?: boolean;
    notes?: string;
    lifetime_stays?: number;
    lifetime_spend?: number;
    created_at: Date;
    updated_at: Date;
}

export interface Reservation {
    id: string;
    hotel_id: string;
    guest_id: string;
    room_id: string;
    check_in_date: Date;
    check_out_date: Date;
    nights: number;
    total_amount: number;
    deposit_paid: number;
    status: ReservationStatus;
    source: ReservationSource;
    notes?: string;
    // Refund tracking
    refund_status?: 'none' | 'full' | 'partial';
    refund_amount?: number;
    created_at: Date;
    updated_at: Date;
}

export interface Booking {
    id: string;
    hotel_id: string;
    reservation_id?: string;
    guest_id: string;
    room_id: string;
    booking_type: BookingType;
    check_in_time: Date;
    check_out_time: Date;
    planned_checkout: Date;
    actual_checkout?: Date;
    num_guests: number;
    rate: number;
    duration_hours?: number; // For short_rest only
    total_charged: number;
    total_paid: number;
    balance: number;
    status: 'active' | 'checked_out';
    created_by: string;
    created_at: Date;
    updated_at: Date;
}

export interface Service {
    id: string;
    hotel_id: string;
    name: string;
    category: ServiceCategory;
    price: number;
    description?: string;
    uses_inventory: boolean;
    inventory_items?: { item_id: string; quantity: number }[];
    is_active: boolean;
    is_available?: boolean; // For menu availability toggle (out of stock)
    created_at: Date;
    updated_at: Date;
}

export interface ServiceOrder {
    id: string;
    hotel_id: string;
    booking_id: string;
    service_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    status: ServiceOrderStatus;
    order_type?: 'room_service' | 'dine_in' | 'takeaway'; // Order type tracking
    notes?: string;
    order_number?: string; // Format: DDMMYYYY-XX
    ordered_at: Date;
    delivered_at?: Date;
    created_by: string;
    created_by_name?: string; // Staff name who took the order
    created_at: Date;
}

export interface Payment {
    id: string;
    hotel_id: string;
    booking_id: string;
    amount: number;
    payment_method: PaymentMethod;
    payment_reference?: string;
    notes?: string;
    received_by: string;
    payment_time: Date;
    created_at: Date;
}

export interface InventoryItem {
    id: string;
    hotel_id: string;
    name: string;
    category: InventoryCategory;
    behavior: AmenityBehavior; // consumable or returnable
    is_amenity: boolean; // can be issued at check-in
    default_issue_qty: number; // default quantity per room (0 = don't auto-select)
    unit_type: string;
    current_stock: number;
    min_stock_level: number;
    unit_cost: number;
    selling_price?: number; // Selling price for beverages in restaurant
    // Supplier information
    supplier_name?: string;
    supplier_contact?: string;     // Phone/email
    last_purchase_price?: number;  // Track price changes
    last_purchase_date?: Date;     // When last restocked
    reorder_quantity?: number;     // Suggested order qty
    notes?: string;
    created_at: Date;
    updated_at: Date;
}

export interface InventoryMovement {
    id: string;
    hotel_id: string;
    item_id: string;
    movement_type: MovementType;
    quantity: number;
    unit_cost?: number;
    reason?: string;
    department?: string;
    supplier_name?: string;
    receipt_url?: string;
    source?: MovementSource; // tracks origin of movement
    issued_amenity_id?: string; // links to IssuedAmenity record
    performed_by: string;
    balance_after: number;
    movement_time: Date;
    created_at: Date;
}

export interface Expense {
    id: string;
    hotel_id: string;
    date: Date;
    amount: number;
    category: ExpenseCategory;
    vendor_name?: string;
    description?: string;
    receipt_url?: string;
    payment_method?: PaymentMethod;
    status?: 'active' | 'voided';
    voided_at?: Date;
    voided_by?: string;
    voided_reason?: string;
    recorded_by: string;
    updated_by?: string;
    created_at: Date;
    updated_at: Date;
}

export interface User {
    id: string;
    hotel_id: string;
    username: string;
    password_hash: string;
    name: string;
    role: UserRole;
    is_active: boolean;
    last_login?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface AuditLog {
    id: string;
    hotel_id: string;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    details?: Record<string, unknown>;
    timestamp: Date;
}

export interface SyncQueueItem {
    id: string;
    table_name: string;
    record_id: string;
    operation: 'insert' | 'update' | 'delete';
    data: Record<string, unknown>;
    synced: boolean;
    retry_count: number;
    created_at: Date;
}

// =============================================================================
// Calculated Types (for UI)
// =============================================================================

export interface GuestFolio {
    booking: Booking;
    guest: Guest;
    room: Room;
    service_orders: ServiceOrder[];
    payments: Payment[];
    room_charges: number;
    room_tax: number;
    service_charges: number;
    service_tax: number;
    total_charges: number;
    total_paid: number;
    balance: number;
}

export interface DashboardSummary {
    rooms_occupied: number;
    rooms_available: number;
    rooms_dirty: number;
    rooms_maintenance: number;
    revenue_today: number;
    cash_today: number;
    transfer_today: number;
    pos_today: number;
    outstanding_balance: number;
    checkouts_today: number;
    occupancy_rate: number;
}

// =============================================================================
// Invoice & Receipt (for billing)
// =============================================================================

export interface InvoiceItem {
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
}

export interface Invoice {
    id: string;
    hotel_id: string;
    booking_id?: string;
    invoice_number: string;
    guest_name: string;
    guest_phone?: string;
    items: InvoiceItem[];
    subtotal: number;
    tax: number;
    total: number;
    status: 'unpaid' | 'partial' | 'paid';
    created_at: Date;
}

export interface Receipt {
    id: string;
    hotel_id: string;
    invoice_id?: string;
    booking_id?: string;
    receipt_number: string;
    payment_id: string;
    guest_name: string;
    amount_paid: number;
    payment_method: PaymentMethod;
    created_at: Date;
}

// =============================================================================
// Other Income (venue rentals, events, etc.)
// =============================================================================

export interface OtherIncome {
    id: string;
    hotel_id: string;
    category: IncomeCategory;
    description: string;
    amount: number;
    payment_method: PaymentMethod;
    customer_name?: string;
    customer_phone?: string;
    recorded_by: string;
    date: Date;
    created_at: Date;
}

// =============================================================================
// Issued Amenities (items given to guests at check-in)
// =============================================================================

export interface IssuedAmenity {
    id: string;
    hotel_id: string;
    booking_id: string;
    room_id: string;
    item_id: string;
    item_name: string; // Denormalized for quick display
    quantity_issued: number;
    quantity_returned: number;
    status: IssuedAmenityStatus;
    issued_by: string;
    issued_at: Date;
    returned_at?: Date;
    returned_by?: string;
    loss_charge?: number; // Charge if marked lost
    notes?: string;
}

// =============================================================================
// Transactions (Unified Financial Ledger - Single Source of Truth)
// =============================================================================

export interface Transaction {
    id: string;
    hotel_id: string;
    type: TransactionType;              // 'income' | 'expense'
    source: TransactionSource;          // Where it came from
    department: TransactionDepartment;  // For VAT grouping
    description: string;
    amount: number;                     // Positive for income, negative for expense
    payment_method: PaymentMethod;
    reference_id?: string;              // booking_id, order_id, expense_id, etc.
    reference_type?: string;            // 'booking' | 'service_order' | 'expense' | 'other_income'
    is_taxable: boolean;
    tax_rate?: number;                  // VAT rate (e.g., 7.5 for 7.5%)
    tax_amount?: number;                // Calculated tax
    recorded_by: string;                // user ID
    date: Date;
    created_at: Date;
    // Reversal/cancellation fields
    status?: TransactionStatus;         // Default: 'completed'
    reversed_transaction_id?: string;   // For reversal entries, links to original
    reversal_reason?: string;           // Reason for cancellation/reversal
}
