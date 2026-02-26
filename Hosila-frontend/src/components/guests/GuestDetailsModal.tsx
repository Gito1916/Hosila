import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/utils/folio';
import { updateGuest } from '@/db/guests';
import type { Guest } from '@/types';
import { format } from 'date-fns';
import {
    X,
    User,
    Phone,
    Mail,
    MapPin,
    CreditCard,
    History,
    Loader2,
    Edit2,
    Star,
    MessageSquare,
    LogIn,
    Calendar,
} from 'lucide-react';
import { RoomPickerModal } from './RoomPickerModal';
import { UnifiedCheckInModal } from '@/components/booking/UnifiedCheckInModal';
import { ReservationForm } from '@/components/reservations/ReservationForm';
import type { Room } from '@/types';
import { requireSupabase, getHotelId } from '@/lib/api';

interface GuestDetailsModalProps {
    guest: Guest;
    onClose: () => void;
}

export function GuestDetailsModal({ guest, onClose }: GuestDetailsModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [showEdit, setShowEdit] = useState(false);

    // Edit form state
    const [editName, setEditName] = useState(guest.name);
    const [editPhone, setEditPhone] = useState(guest.phone ?? '');
    const [editEmail, setEditEmail] = useState(guest.email ?? '');
    const [editNotes, setEditNotes] = useState(guest.notes ?? '');

    // Quick action modals
    const [showRoomPicker, setShowRoomPicker] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [showReservationForm, setShowReservationForm] = useState(false);

    // Get active booking for this guest
    const { data: activeBooking } = useQuery({
        queryKey: ['bookings', 'active', guest.id],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('guest_id', guest.id).eq('status', 'active').maybeSingle();
            return data;
        },
        enabled: !!guest.id,
    });

    // Get booking history
    const { data: bookingHistory } = useQuery({
        queryKey: ['bookings', 'guest_id', guest.id],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('bookings').select('*').eq('hotel_id', hotelId).eq('guest_id', guest.id);
            return data ?? [];
        },
        enabled: !!guest.id,
    });

    const handleSaveEdit = async () => {
        setIsLoading(true);
        try {
            await updateGuest(guest.id, {
                name: editName,
                phone: editPhone || undefined,
                email: editEmail || undefined,
                notes: editNotes || undefined,
            });
            setShowEdit(false);
        } catch (err) {
            console.error('Error updating guest:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleVIP = async () => {
        setIsLoading(true);
        try {
            await updateGuest(guest.id, { is_vip: !guest.is_vip });
        } catch (err) {
            console.error('Error toggling VIP:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const completedStays = bookingHistory?.filter(b => b.status === 'checked_out').length ?? 0;
    const totalSpent = bookingHistory?.reduce((sum, b) => sum + b.total_paid, 0) ?? 0;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-primary-500/20 rounded-full flex items-center justify-center">
                            <User className="text-primary-400" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-heading flex items-center gap-2">
                                {guest.name}
                                {guest.is_vip && (
                                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex items-center gap-1">
                                        <Star size={10} /> VIP
                                    </span>
                                )}
                            </h2>
                            {activeBooking && (
                                <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full">
                                    Currently In-House
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Guest Info */}
                    {!showEdit ? (
                        <div className="card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium text-heading">Contact Information</h3>
                                <button onClick={() => setShowEdit(true)} className="btn btn-ghost p-1">
                                    <Edit2 size={16} />
                                </button>
                            </div>
                            <div className="space-y-2 text-sm">
                                {guest.phone && (
                                    <div className="flex items-center gap-2 text-muted">
                                        <Phone size={14} className="text-muted" />
                                        {guest.phone}
                                    </div>
                                )}
                                {guest.email && (
                                    <div className="flex items-center gap-2 text-muted">
                                        <Mail size={14} className="text-muted" />
                                        {guest.email}
                                    </div>
                                )}
                                {guest.address && (
                                    <div className="flex items-center gap-2 text-muted">
                                        <MapPin size={14} className="text-muted" />
                                        {guest.address}
                                    </div>
                                )}
                                {guest.id_type && (
                                    <div className="flex items-center gap-2 text-muted">
                                        <CreditCard size={14} className="text-muted" />
                                        {guest.id_type.replace('_', ' ')} {guest.id_number && `- ${guest.id_number}`}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="card p-4 space-y-3">
                            <h3 className="font-medium text-heading">Edit Guest</h3>
                            <div>
                                <label className="label">Name</label>
                                <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="input"
                                />
                            </div>
                            <div>
                                <label className="label">Phone</label>
                                <input
                                    value={editPhone}
                                    onChange={(e) => setEditPhone(e.target.value)}
                                    className="input"
                                />
                            </div>
                            <div>
                                <label className="label">Email</label>
                                <input
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    className="input"
                                />
                            </div>
                            <div>
                                <label className="label">Notes</label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    className="input"
                                    rows={2}
                                    placeholder="Preferences, special requests..."
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowEdit(false)} className="btn btn-secondary flex-1">
                                    Cancel
                                </button>
                                <button onClick={handleSaveEdit} disabled={isLoading} className="btn btn-primary flex-1">
                                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Guest Stats + VIP Toggle */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="card p-3 text-center">
                            <p className="text-2xl font-bold text-heading">{completedStays}</p>
                            <p className="text-xs text-muted">Total Stays</p>
                        </div>
                        <div className="card p-3 text-center">
                            <p className="text-2xl font-bold text-status-available">
                                {formatCurrency(totalSpent)}
                            </p>
                            <p className="text-xs text-muted">Total Spent</p>
                        </div>
                        <button
                            onClick={handleToggleVIP}
                            disabled={isLoading}
                            className={`card p-3 text-center transition-all ${guest.is_vip ? 'bg-amber-500/20 border-amber-500/30' : 'hover:border-amber-500/30'}`}
                        >
                            <Star size={24} className={`mx-auto ${guest.is_vip ? 'text-amber-400 fill-amber-400' : 'text-muted'}`} />
                            <p className="text-xs mt-1 text-muted">{guest.is_vip ? 'VIP' : 'Set VIP'}</p>
                        </button>
                    </div>

                    {/* Notes Section */}
                    {guest.notes && (
                        <div className="card p-4">
                            <h3 className="font-medium text-heading mb-2 flex items-center gap-2">
                                <MessageSquare size={16} />
                                Notes
                            </h3>
                            <p className="text-sm text-muted whitespace-pre-wrap">{guest.notes}</p>
                        </div>
                    )}



                    {/* Booking History */}
                    {bookingHistory && bookingHistory.length > 0 && (
                        <div className="card p-4">
                            <h3 className="font-medium text-heading mb-3 flex items-center gap-2">
                                <History size={16} />
                                Stay History
                            </h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {bookingHistory.slice().reverse().map((b) => (
                                    <div key={b.id} className="flex justify-between text-sm p-2 bg-surface-raised/50 rounded">
                                        <div>
                                            <p className="text-muted">
                                                {format(new Date(b.check_in_time), 'MMM d, yyyy')}
                                            </p>
                                            <p className="text-xs text-muted">
                                                {b.booking_type === 'short_rest' ? `${b.duration_hours}h rest` : 'Night stay'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-heading">{formatCurrency(b.rate)}</p>
                                            <p className={`text-xs ${b.status === 'active' ? 'text-primary-400' : 'text-muted'}`}>
                                                {b.status === 'active' ? 'Current' : 'Completed'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Quick Actions - Only show when not in-house */}
                    {!activeBooking && (
                        <div className="p-4 border-t border-border space-y-2">
                            <p className="text-xs text-muted mb-2">Quick Actions for Returning Guest</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowRoomPicker(true)}
                                    className="btn btn-primary flex-1"
                                >
                                    <LogIn size={16} className="mr-1" />
                                    Check In Now
                                </button>
                                <button
                                    onClick={() => setShowReservationForm(true)}
                                    className="btn btn-secondary flex-1"
                                >
                                    <Calendar size={16} className="mr-1" />
                                    Make Reservation
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Room Picker Modal */}
                {showRoomPicker && (
                    <RoomPickerModal
                        title={`Check In ${guest.name}`}
                        subtitle="Select an available room"
                        onClose={() => setShowRoomPicker(false)}
                        onSelect={(room) => {
                            setSelectedRoom(room);
                            setShowRoomPicker(false);
                        }}
                    />
                )}

                {/* Check-In Modal with prefilled guest */}
                {selectedRoom && (
                    <UnifiedCheckInModal
                        room={selectedRoom}
                        prefilledGuest={{
                            id: guest.id,
                            name: guest.name,
                            phone: guest.phone,
                            email: guest.email,
                            idType: guest.id_type,
                            idNumber: guest.id_number,
                        }}
                        onClose={() => setSelectedRoom(null)}
                        onSuccess={() => {
                            setSelectedRoom(null);
                            onClose();
                        }}
                    />
                )}

                {/* Reservation Form with prefilled guest */}
                {showReservationForm && (
                    <ReservationForm
                        onClose={() => setShowReservationForm(false)}
                        onSuccess={() => {
                            setShowReservationForm(false);
                            onClose();
                        }}
                        prefilledGuest={{
                            id: guest.id,
                            name: guest.name,
                            phone: guest.phone,
                            email: guest.email,
                        }}
                    />
                )}
            </div>
        </div>
    );
}
