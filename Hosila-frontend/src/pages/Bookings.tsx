import { useState } from 'react';
import { useRooms } from '@/hooks/useSupabaseData';
import { fetchById } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { UnifiedCheckInModal, UnifiedReservationModal } from '@/components/booking';
import { RoomStatusGrid } from '@/components/bookings/RoomStatusGrid';
import { AvailabilityCalendar } from '@/components/bookings/AvailabilityCalendar';
import { ReservationList } from '@/components/bookings/ReservationList';
import type { Room, Reservation } from '@/types';
import {
    Grid3X3,
    Calendar,
    List,
    LogIn,
    CalendarPlus,
} from 'lucide-react';

type BookingsTab = 'room_status' | 'calendar' | 'reservations';

export function BookingsPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<BookingsTab>('room_status');
    const [showCheckInModal, setShowCheckInModal] = useState(false);
    const [showReservationModal, setShowReservationModal] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    // Get available rooms for check-in modal room picker
    const { data: allRooms } = useRooms();
    const availableRooms = allRooms?.filter(r => r.status === 'available');

    // Handle room selection for check-in
    const handleCheckInClick = () => {
        // If only one available room, select it automatically
        if (availableRooms?.length === 1) {
            setSelectedRoom(availableRooms[0]);
        } else {
            setSelectedRoom(null);
        }
        setShowCheckInModal(true);
    };

    // Handle reservation from calendar
    const handleCalendarReservation = (room: Room, date: Date) => {
        setSelectedRoom(room);
        setSelectedDate(date);
        setShowReservationModal(true);
    };

    // Handle guest ledger navigation
    const handleOpenGuestLedger = (bookingId: string) => {
        navigate(`/bookings/${bookingId}/ledger`);
    };

    const tabs = [
        { id: 'room_status' as const, label: 'Room Status', icon: Grid3X3 },
        { id: 'calendar' as const, label: 'Availability', icon: Calendar },
        { id: 'reservations' as const, label: 'Reservations', icon: List },
    ];

    return (
        <div className="space-y-4">
            {/* Tab Navigation + Action Buttons */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-1 bg-surface-card p-1 rounded-lg w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${activeTab === tab.id
                                ? 'bg-primary-500 text-heading'
                                : 'text-muted hover:text-heading hover:bg-surface-raised'
                                }`}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleCheckInClick}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <LogIn size={18} />
                        Check In
                    </button>
                    <button
                        onClick={() => {
                            setSelectedRoom(null);
                            setSelectedDate(null);
                            setShowReservationModal(true);
                        }}
                        className="btn btn-secondary flex items-center gap-2"
                    >
                        <CalendarPlus size={18} />
                        Reserve
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-[60vh]">
                {activeTab === 'room_status' && (
                    <RoomStatusGrid
                        onCheckIn={(room) => {
                            setSelectedRoom(room);
                            setShowCheckInModal(true);
                        }}
                        onOpenDetails={() => {
                            // No-op — room details handled by RoomStatusGrid's own click handlers
                        }}
                    />
                )
                }

                {
                    activeTab === 'calendar' && (
                        <AvailabilityCalendar
                            onReserve={handleCalendarReservation}
                            onOpenGuestLedger={handleOpenGuestLedger}
                        />
                    )
                }

                {
                    activeTab === 'reservations' && (
                        <ReservationList
                            onCheckIn={(reservation: Reservation) => {
                                // Get the room and open check-in modal
                                fetchById<Room>('rooms', reservation.room_id).then(room => {
                                    if (room) {
                                        setSelectedRoom(room);
                                        setShowCheckInModal(true);
                                    }
                                });
                            }}
                        />
                    )
                }
            </div>

            {/* Check-in Modal */}
            {
                showCheckInModal && selectedRoom && (
                    <UnifiedCheckInModal
                        room={selectedRoom}
                        onClose={() => {
                            setShowCheckInModal(false);
                            setSelectedRoom(null);
                        }}
                        onSuccess={() => {
                            setShowCheckInModal(false);
                            setSelectedRoom(null);
                        }}
                    />
                )
            }

            {/* Room Picker for Check-in when no room selected */}
            {
                showCheckInModal && !selectedRoom && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-surface-card rounded-xl border border-border w-full max-w-md p-4">
                            <h3 className="text-lg font-bold text-heading mb-4">Select Room for Check-in</h3>
                            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                {availableRooms?.map(room => (
                                    <button
                                        key={room.id}
                                        onClick={() => setSelectedRoom(room)}
                                        className="p-3 bg-surface-raised/50 hover:bg-surface-raised rounded-lg text-left"
                                    >
                                        <p className="font-medium text-heading">Room {room.room_number}</p>
                                        <p className="text-xs text-muted">{room.room_type}</p>
                                        <p className="text-xs text-green-400">₦{room.night_rate.toLocaleString()}/night</p>
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowCheckInModal(false)}
                                className="btn btn-secondary w-full mt-4"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Reservation Modal */}
            {
                showReservationModal && (
                    <UnifiedReservationModal
                        onClose={() => {
                            setShowReservationModal(false);
                            setSelectedRoom(null);
                            setSelectedDate(null);
                        }}
                        onSuccess={() => {
                            setShowReservationModal(false);
                            setSelectedRoom(null);
                            setSelectedDate(null);
                        }}
                        preselectedRoomId={selectedRoom?.id}
                        preselectedDate={selectedDate ?? undefined}
                    />
                )
            }
        </div>
    );
}
