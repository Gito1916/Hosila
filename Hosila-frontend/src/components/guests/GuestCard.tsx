import { useQuery } from '@tanstack/react-query';
import type { Guest } from '@/types';
import { requireSupabase, getHotelId } from '@/lib/api';
import {
    Phone,
    Mail,
    MapPin,
    CreditCard,
    ChevronRight,
    Star,
    Calendar,
} from 'lucide-react';

interface GuestCardProps {
    guest: Guest;
    onClick: () => void;
}

export function GuestCard({ guest, onClick }: GuestCardProps) {
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

    // Get room if active booking
    const { data: room } = useQuery({
        queryKey: ['rooms', activeBooking?.room_id],
        queryFn: async () => {
            const sb = requireSupabase();
            const { data } = await sb.from('rooms').select('*').eq('id', activeBooking!.room_id).single();
            return data;
        },
        enabled: !!activeBooking?.room_id,
    });

    const hasActiveStay = !!activeBooking;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-xl p-4 transition-all hover:scale-[1.01] ${hasActiveStay
                ? 'bg-primary-500/10 border border-primary-500/30'
                : 'bg-surface-card border border-border hover:border-border-strong'
                }`}
        >
            <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${hasActiveStay ? 'bg-primary-500/30 text-primary-400' : 'bg-surface-raised text-muted'
                    }`}>
                    {guest.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-heading font-semibold truncate">{guest.name}</h3>
                        {guest.is_vip && (
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex items-center gap-1">
                                <Star size={10} /> VIP
                            </span>
                        )}
                        {hasActiveStay && (
                            <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded-full">
                                In-House
                            </span>
                        )}
                    </div>

                    <div className="space-y-1 text-sm text-muted">
                        {guest.phone && (
                            <div className="flex items-center gap-2">
                                <Phone size={12} />
                                <span>{guest.phone}</span>
                            </div>
                        )}
                        {guest.email && (
                            <div className="flex items-center gap-2">
                                <Mail size={12} />
                                <span className="truncate">{guest.email}</span>
                            </div>
                        )}
                    </div>

                    {/* Active stay info */}
                    {hasActiveStay && activeBooking && room && (
                        <div className="mt-2 pt-2 border-t border-border/50 text-sm">
                            <div className="flex items-center gap-2 text-primary-400">
                                <MapPin size={12} />
                                <span>Room {room.room_number}</span>
                                <span className="text-muted">•</span>
                                <span className="text-muted">
                                    {activeBooking.booking_type === 'short_rest' ? 'Short Rest' : 'Night Stay'}
                                </span>
                            </div>
                            {activeBooking.balance > 0 && (
                                <div className="flex items-center gap-2 text-status-dirty mt-1">
                                    <CreditCard size={12} />
                                    <span>Balance: ₦{activeBooking.balance.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lifetime stats - show if guest has history */}
                    {!hasActiveStay && (guest.lifetime_stays || guest.lifetime_spend) && (
                        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted flex items-center gap-3">
                            {guest.lifetime_stays && guest.lifetime_stays > 0 && (
                                <span className="flex items-center gap-1">
                                    <Calendar size={10} />
                                    {guest.lifetime_stays} stay{guest.lifetime_stays !== 1 ? 's' : ''}
                                </span>
                            )}
                            {guest.lifetime_spend && guest.lifetime_spend > 0 && (
                                <span className="flex items-center gap-1">
                                    <CreditCard size={10} />
                                    ₦{guest.lifetime_spend.toLocaleString()} total
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <ChevronRight size={20} className="text-muted mt-4" />
            </div>
        </button>
    );
}
