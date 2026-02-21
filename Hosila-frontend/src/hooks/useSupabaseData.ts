/**
 * React Query hooks for Supabase data.
 * 
 * These hooks replace `useLiveQuery` from dexie-react-hooks.
 * They provide loading states, error handling, and automatic refetching.
 * 
 * ALL mutations use OPTIMISTIC UPDATES:
 *   onMutate  → instantly update the React Query cache (UI feels instant)
 *   onError   → rollback to the previous snapshot
 *   onSettled → refetch in background to reconcile with server
 */

import { useQuery, useMutation, useQueryClient, QueryClient, QueryKey } from '@tanstack/react-query';

// ============================================================================
// Tiered staleTime constants (data sync strategy)
// ============================================================================

/** Realtime-tier: cache updated via Supabase Realtime push — never stale */
const STALE_REALTIME = Infinity;
/** Optimistic-tier: settings/users — rarely conflicts, 5 minute staleTime */
const STALE_OPTIMISTIC = 5 * 60 * 1000;
/** Cached-tier: reference data — changes infrequently, 60s staleTime */
const STALE_CACHED = 60 * 1000;
/** Background-tier: finance/accounting — 30s staleTime */
const STALE_BACKGROUND = 30 * 1000;
import { v4 as uuidv4 } from 'uuid';
import * as api from '@/lib/api';
import type {
    Hotel, Room, Guest, Reservation, Booking, Service, ServiceOrder,
    Payment, InventoryItem, InventoryMovement, Expense, User,
    Invoice, Receipt, OtherIncome, IssuedAmenity, Transaction,
    Charge, PaymentAllocation, JournalEntry, RoomType,
} from '@/types';

// ============================================================================
// Query Keys — centralized for cache invalidation
// ============================================================================

export const queryKeys = {
    hotel: ['hotel'] as const,
    rooms: ['rooms'] as const,
    roomTypes: ['roomTypes'] as const,
    guests: ['guests'] as const,
    guest: (id: string) => ['guests', id] as const,
    reservations: ['reservations'] as const,
    bookings: ['bookings'] as const,
    activeBookings: ['bookings', 'active'] as const,
    services: ['services'] as const,
    serviceOrders: ['serviceOrders'] as const,
    payments: ['payments'] as const,
    inventoryItems: ['inventoryItems'] as const,
    inventoryMovements: ['inventoryMovements'] as const,
    expenses: ['expenses'] as const,
    users: ['users'] as const,
    invoices: ['invoices'] as const,
    receipts: ['receipts'] as const,
    otherIncome: ['otherIncome'] as const,
    issuedAmenities: ['issuedAmenities'] as const,
    transactions: ['transactions'] as const,
    charges: ['charges'] as const,
    paymentAllocations: ['paymentAllocations'] as const,
    journalEntries: ['journalEntries'] as const,
};

// ============================================================================
// Optimistic Update Helpers
// ============================================================================

type HasId = { id: string };

/**
 * Build optimistic callbacks for CREATE mutations.
 * Immediately appends a temp item to the cache array.
 */
function optimisticCreate<TItem extends HasId, TInput>(
    qc: QueryClient,
    key: QueryKey,
    /** Convert the mutation input into a cache-friendly item (with temp id). */
    toItem: (input: TInput) => TItem,
    /** Additional query keys to refetch in onSettled. */
    extraKeys: QueryKey[] = [],
) {
    return {
        onMutate: async (input: TInput) => {
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<TItem[]>(key);
            qc.setQueryData<TItem[]>(key, (old = []) => [...old, toItem(input)]);
            return { previous };
        },
        onError: (_err: unknown, _input: TInput, context?: { previous?: TItem[] }) => {
            if (context?.previous) qc.setQueryData(key, context.previous);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key });
            extraKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
        },
    };
}

/**
 * Build optimistic callbacks for UPDATE mutations.
 * Immediately patches the matching item in the cache array.
 */
function optimisticUpdate<TItem extends HasId>(
    qc: QueryClient,
    key: QueryKey,
    /** Additional query keys to refetch in onSettled. */
    extraKeys: QueryKey[] = [],
) {
    type MutInput = { id: string; updates: Partial<TItem> };
    return {
        onMutate: async ({ id, updates }: MutInput) => {
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<TItem[]>(key);
            qc.setQueryData<TItem[]>(key, (old = []) =>
                old.map(item => item.id === id ? { ...item, ...updates } : item),
            );
            return { previous };
        },
        onError: (_err: unknown, _input: MutInput, context?: { previous?: TItem[] }) => {
            if (context?.previous) qc.setQueryData(key, context.previous);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key });
            extraKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
        },
    };
}

/**
 * Build optimistic callbacks for DELETE mutations.
 * Immediately removes the item from the cache array.
 */
function optimisticDelete<TItem extends HasId>(
    qc: QueryClient,
    key: QueryKey,
    /** Additional query keys to refetch in onSettled. */
    extraKeys: QueryKey[] = [],
) {
    return {
        onMutate: async (id: string) => {
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<TItem[]>(key);
            qc.setQueryData<TItem[]>(key, (old = []) =>
                old.filter(item => item.id !== id),
            );
            return { previous };
        },
        onError: (_err: unknown, _id: string, context?: { previous?: TItem[] }) => {
            if (context?.previous) qc.setQueryData(key, context.previous);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key });
            extraKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
        },
    };
}

/**
 * Build optimistic callbacks for single-object UPDATE mutations (e.g. Hotel).
 * Patches the single cached object directly.
 */
function optimisticUpdateSingle<TItem>(
    qc: QueryClient,
    key: QueryKey,
) {
    type MutInput = { id: string; updates: Partial<TItem> };
    return {
        onMutate: async ({ updates }: MutInput) => {
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<TItem>(key);
            qc.setQueryData<TItem>(key, (old) => old ? { ...old, ...updates } : old as TItem);
            return { previous };
        },
        onError: (_err: unknown, _input: MutInput, context?: { previous?: TItem }) => {
            if (context?.previous !== undefined) qc.setQueryData(key, context.previous);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key });
        },
    };
}

// ============================================================================
// Hotel
// ============================================================================

export function useHotel() {
    return useQuery({
        queryKey: queryKeys.hotel,
        queryFn: api.fetchHotel,
        staleTime: STALE_OPTIMISTIC,
    });
}

export function useUpdateHotel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Hotel> }) =>
            api.updateHotel(id, updates),
        ...optimisticUpdateSingle<Hotel>(qc, queryKeys.hotel),
    });
}

// ============================================================================
// Rooms
// ============================================================================

export function useRooms() {
    return useQuery({
        queryKey: queryKeys.rooms,
        queryFn: api.fetchRooms,
        staleTime: STALE_REALTIME, // Updated via Realtime push
    });
}

export function useCreateRoom() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (room: Omit<Room, 'id'>) => api.createRoom(room),
        ...optimisticCreate<Room, Omit<Room, 'id'>>(qc, queryKeys.rooms,
            (input) => ({ ...input, id: uuidv4() } as Room),
        ),
    });
}

export function useUpdateRoom() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Room> }) =>
            api.updateRoom(id, updates),
        ...optimisticUpdate<Room>(qc, queryKeys.rooms, [queryKeys.bookings]),
    });
}

export function useDeleteRoom() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteRoom(id),
        ...optimisticDelete<Room>(qc, queryKeys.rooms),
    });
}

// ============================================================================
// Room Types
// ============================================================================

export function useRoomTypes() {
    return useQuery({
        queryKey: queryKeys.roomTypes,
        queryFn: api.fetchRoomTypes,
        staleTime: STALE_CACHED, // Reference data, changes infrequently
    });
}

export function useCreateRoomType() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (rt: Omit<RoomType, 'id'>) => api.createRoomType(rt),
        ...optimisticCreate<RoomType, Omit<RoomType, 'id'>>(qc, queryKeys.roomTypes,
            (input) => ({ ...input, id: uuidv4() } as RoomType),
        ),
    });
}

export function useUpdateRoomType() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<RoomType> }) =>
            api.updateRoomType(id, updates),
        ...optimisticUpdate<RoomType>(qc, queryKeys.roomTypes),
    });
}

export function useDeleteRoomType() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteRoomType(id),
        ...optimisticDelete<RoomType>(qc, queryKeys.roomTypes),
    });
}

// ============================================================================
// Guests
// ============================================================================

export function useGuests() {
    return useQuery({
        queryKey: queryKeys.guests,
        queryFn: api.fetchGuests,
        staleTime: STALE_REALTIME, // Updated via Realtime push
    });
}

export function useGuest(id: string) {
    return useQuery({
        queryKey: queryKeys.guest(id),
        queryFn: () => api.fetchGuestById(id),
        enabled: !!id,
        staleTime: STALE_REALTIME,
    });
}

export function useCreateGuest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (guest: Omit<Guest, 'id'>) => api.createGuest(guest),
        ...optimisticCreate<Guest, Omit<Guest, 'id'>>(qc, queryKeys.guests,
            (input) => ({ ...input, id: uuidv4() } as Guest),
        ),
    });
}

export function useUpdateGuest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Guest> }) =>
            api.updateGuest(id, updates),
        ...optimisticUpdate<Guest>(qc, queryKeys.guests),
    });
}

// ============================================================================
// Reservations
// ============================================================================

export function useReservations() {
    return useQuery({
        queryKey: queryKeys.reservations,
        queryFn: api.fetchReservations,
        staleTime: STALE_REALTIME, // Updated via Realtime push
    });
}

export function useCreateReservation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (reservation: Omit<Reservation, 'id'>) => api.createReservation(reservation),
        ...optimisticCreate<Reservation, Omit<Reservation, 'id'>>(qc, queryKeys.reservations,
            (input) => ({ ...input, id: uuidv4() } as Reservation),
        ),
    });
}

export function useUpdateReservation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Reservation> }) =>
            api.updateReservation(id, updates),
        ...optimisticUpdate<Reservation>(qc, queryKeys.reservations, [queryKeys.rooms]),
    });
}

// ============================================================================
// Bookings
// ============================================================================

export function useBookings() {
    return useQuery({
        queryKey: queryKeys.bookings,
        queryFn: api.fetchBookings,
        staleTime: STALE_REALTIME, // Updated via Realtime push
    });
}

export function useActiveBookings() {
    return useQuery({
        queryKey: queryKeys.activeBookings,
        queryFn: api.fetchActiveBookings,
        staleTime: STALE_REALTIME, // Invalidated by Realtime bookings/rooms changes
    });
}

export function useCreateBooking() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (booking: Omit<Booking, 'id'>) => api.createBooking(booking),
        ...optimisticCreate<Booking, Omit<Booking, 'id'>>(qc, queryKeys.bookings,
            (input) => ({ ...input, id: uuidv4() } as Booking),
            [queryKeys.rooms, queryKeys.activeBookings],
        ),
    });
}

export function useUpdateBooking() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Booking> }) =>
            api.updateBooking(id, updates),
        ...optimisticUpdate<Booking>(qc, queryKeys.bookings, [queryKeys.rooms, queryKeys.activeBookings]),
    });
}

// ============================================================================
// Services
// ============================================================================

export function useServices() {
    return useQuery({
        queryKey: queryKeys.services,
        queryFn: api.fetchServices,
        staleTime: STALE_CACHED, // Menu items — reference data
    });
}

export function useCreateService() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (service: Omit<Service, 'id'>) => api.createService(service),
        ...optimisticCreate<Service, Omit<Service, 'id'>>(qc, queryKeys.services,
            (input) => ({ ...input, id: uuidv4() } as Service),
        ),
    });
}

export function useUpdateService() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Service> }) =>
            api.updateService(id, updates),
        ...optimisticUpdate<Service>(qc, queryKeys.services),
    });
}

export function useDeleteService() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteService(id),
        ...optimisticDelete<Service>(qc, queryKeys.services),
    });
}

// ============================================================================
// Service Orders
// ============================================================================

export function useServiceOrders() {
    return useQuery({
        queryKey: queryKeys.serviceOrders,
        queryFn: api.fetchServiceOrders,
        staleTime: STALE_REALTIME, // Updated via Realtime push
    });
}

export function useCreateServiceOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (order: Omit<ServiceOrder, 'id'>) => api.createServiceOrder(order),
        ...optimisticCreate<ServiceOrder, Omit<ServiceOrder, 'id'>>(qc, queryKeys.serviceOrders,
            (input) => ({ ...input, id: uuidv4() } as ServiceOrder),
        ),
    });
}

export function useUpdateServiceOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<ServiceOrder> }) =>
            api.updateServiceOrder(id, updates),
        ...optimisticUpdate<ServiceOrder>(qc, queryKeys.serviceOrders),
    });
}

// ============================================================================
// Payments
// ============================================================================

export function usePayments() {
    return useQuery({
        queryKey: queryKeys.payments,
        queryFn: api.fetchPayments,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreatePayment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payment: Omit<Payment, 'id'>) => api.createPayment(payment),
        ...optimisticCreate<Payment, Omit<Payment, 'id'>>(qc, queryKeys.payments,
            (input) => ({ ...input, id: uuidv4() } as Payment),
            [queryKeys.bookings],
        ),
    });
}

// ============================================================================
// Inventory
// ============================================================================

export function useInventoryItems() {
    return useQuery({
        queryKey: queryKeys.inventoryItems,
        queryFn: api.fetchInventoryItems,
        staleTime: STALE_CACHED,
    });
}

export function useCreateInventoryItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (item: Omit<InventoryItem, 'id'>) => api.createInventoryItem(item),
        ...optimisticCreate<InventoryItem, Omit<InventoryItem, 'id'>>(qc, queryKeys.inventoryItems,
            (input) => ({ ...input, id: uuidv4() } as InventoryItem),
        ),
    });
}

export function useUpdateInventoryItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<InventoryItem> }) =>
            api.updateInventoryItem(id, updates),
        ...optimisticUpdate<InventoryItem>(qc, queryKeys.inventoryItems),
    });
}

export function useDeleteInventoryItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteInventoryItem(id),
        ...optimisticDelete<InventoryItem>(qc, queryKeys.inventoryItems),
    });
}

export function useInventoryMovements() {
    return useQuery({
        queryKey: queryKeys.inventoryMovements,
        queryFn: api.fetchInventoryMovements,
        staleTime: STALE_CACHED,
    });
}

export function useCreateInventoryMovement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (movement: Omit<InventoryMovement, 'id'>) => api.createInventoryMovement(movement),
        ...optimisticCreate<InventoryMovement, Omit<InventoryMovement, 'id'>>(qc, queryKeys.inventoryMovements,
            (input) => ({ ...input, id: uuidv4() } as InventoryMovement),
            [queryKeys.inventoryItems],
        ),
    });
}

// ============================================================================
// Expenses
// ============================================================================

export function useExpenses() {
    return useQuery({
        queryKey: queryKeys.expenses,
        queryFn: api.fetchExpenses,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreateExpense() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (expense: Omit<Expense, 'id'>) => api.createExpense(expense),
        ...optimisticCreate<Expense, Omit<Expense, 'id'>>(qc, queryKeys.expenses,
            (input) => ({ ...input, id: uuidv4() } as Expense),
        ),
    });
}

export function useUpdateExpense() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Expense> }) =>
            api.updateExpense(id, updates),
        ...optimisticUpdate<Expense>(qc, queryKeys.expenses),
    });
}

export function useDeleteExpense() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteExpense(id),
        ...optimisticDelete<Expense>(qc, queryKeys.expenses),
    });
}

// ============================================================================
// Users
// ============================================================================

export function useUsers() {
    return useQuery({
        queryKey: queryKeys.users,
        queryFn: api.fetchUsers,
        staleTime: STALE_OPTIMISTIC,
    });
}

export function useCreateUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (user: Omit<User, 'id'>) => api.createUser(user),
        ...optimisticCreate<User, Omit<User, 'id'>>(qc, queryKeys.users,
            (input) => ({ ...input, id: uuidv4() } as User),
        ),
    });
}

export function useUpdateUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<User> }) =>
            api.updateUser(id, updates),
        ...optimisticUpdate<User>(qc, queryKeys.users),
    });
}

export function useDeleteUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteUser(id),
        ...optimisticDelete<User>(qc, queryKeys.users),
    });
}

// ============================================================================
// Invoices & Receipts
// ============================================================================

export function useInvoices() {
    return useQuery({
        queryKey: queryKeys.invoices,
        queryFn: api.fetchInvoices,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (invoice: Omit<Invoice, 'id'>) => api.createInvoice(invoice),
        ...optimisticCreate<Invoice, Omit<Invoice, 'id'>>(qc, queryKeys.invoices,
            (input) => ({ ...input, id: uuidv4() } as Invoice),
        ),
    });
}

export function useReceipts() {
    return useQuery({
        queryKey: queryKeys.receipts,
        queryFn: api.fetchReceipts,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreateReceipt() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (receipt: Omit<Receipt, 'id'>) => api.createReceipt(receipt),
        ...optimisticCreate<Receipt, Omit<Receipt, 'id'>>(qc, queryKeys.receipts,
            (input) => ({ ...input, id: uuidv4() } as Receipt),
        ),
    });
}

// ============================================================================
// Other Income
// ============================================================================

export function useOtherIncome() {
    return useQuery({
        queryKey: queryKeys.otherIncome,
        queryFn: api.fetchOtherIncome,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreateOtherIncome() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (income: Omit<OtherIncome, 'id'>) => api.createOtherIncome(income),
        ...optimisticCreate<OtherIncome, Omit<OtherIncome, 'id'>>(qc, queryKeys.otherIncome,
            (input) => ({ ...input, id: uuidv4() } as OtherIncome),
        ),
    });
}

export function useUpdateOtherIncome() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<OtherIncome> }) =>
            api.updateOtherIncome(id, updates),
        ...optimisticUpdate<OtherIncome>(qc, queryKeys.otherIncome),
    });
}

export function useDeleteOtherIncome() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteOtherIncome(id),
        ...optimisticDelete<OtherIncome>(qc, queryKeys.otherIncome),
    });
}

// ============================================================================
// Issued Amenities
// ============================================================================

export function useIssuedAmenities() {
    return useQuery({
        queryKey: queryKeys.issuedAmenities,
        queryFn: api.fetchIssuedAmenities,
        staleTime: STALE_CACHED,
    });
}

export function useCreateIssuedAmenity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (amenity: Omit<IssuedAmenity, 'id'>) => api.createIssuedAmenity(amenity),
        ...optimisticCreate<IssuedAmenity, Omit<IssuedAmenity, 'id'>>(qc, queryKeys.issuedAmenities,
            (input) => ({ ...input, id: uuidv4() } as IssuedAmenity),
            [queryKeys.inventoryItems],
        ),
    });
}

export function useUpdateIssuedAmenity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<IssuedAmenity> }) =>
            api.updateIssuedAmenity(id, updates),
        ...optimisticUpdate<IssuedAmenity>(qc, queryKeys.issuedAmenities),
    });
}

// ============================================================================
// Transactions
// ============================================================================

export function useTransactions() {
    return useQuery({
        queryKey: queryKeys.transactions,
        queryFn: api.fetchTransactions,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreateTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (tx: Omit<Transaction, 'id'>) => api.createTransaction(tx),
        ...optimisticCreate<Transaction, Omit<Transaction, 'id'>>(qc, queryKeys.transactions,
            (input) => ({ ...input, id: uuidv4() } as Transaction),
        ),
    });
}

// ============================================================================
// Accounting v2
// ============================================================================

export function useCharges() {
    return useQuery({
        queryKey: queryKeys.charges,
        queryFn: api.fetchCharges,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreateCharge() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (charge: Omit<Charge, 'id'>) => api.createCharge(charge),
        ...optimisticCreate<Charge, Omit<Charge, 'id'>>(qc, queryKeys.charges,
            (input) => ({ ...input, id: uuidv4() } as Charge),
        ),
    });
}

export function useUpdateCharge() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Charge> }) =>
            api.updateCharge(id, updates),
        ...optimisticUpdate<Charge>(qc, queryKeys.charges),
    });
}

export function usePaymentAllocations() {
    return useQuery({
        queryKey: queryKeys.paymentAllocations,
        queryFn: api.fetchPaymentAllocations,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreatePaymentAllocation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (alloc: Omit<PaymentAllocation, 'id'>) => api.createPaymentAllocation(alloc),
        ...optimisticCreate<PaymentAllocation, Omit<PaymentAllocation, 'id'>>(qc, queryKeys.paymentAllocations,
            (input) => ({ ...input, id: uuidv4() } as PaymentAllocation),
        ),
    });
}

export function useJournalEntries() {
    return useQuery({
        queryKey: queryKeys.journalEntries,
        queryFn: api.fetchJournalEntries,
        staleTime: STALE_BACKGROUND,
    });
}

export function useCreateJournalEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (entry: Omit<JournalEntry, 'id'>) => api.createJournalEntry(entry),
        ...optimisticCreate<JournalEntry, Omit<JournalEntry, 'id'>>(qc, queryKeys.journalEntries,
            (input) => ({ ...input, id: uuidv4() } as JournalEntry),
        ),
    });
}
