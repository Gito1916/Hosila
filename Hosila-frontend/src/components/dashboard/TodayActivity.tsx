import { useQuery } from '@tanstack/react-query';
import { getTodayArrivals, getTodayDepartures } from '@/db/dashboard';

import {
    ArrowDownCircle,
    ArrowUpCircle,
    User,

    CheckCircle,
    LogOut,
} from 'lucide-react';

interface TodayActivityProps {
    onCheckIn?: (reservationId: string) => void;
    onCheckOut?: (bookingId: string) => void;
}

export function TodayActivity({ onCheckIn, onCheckOut }: TodayActivityProps) {
    const { data: arrivals } = useQuery({ queryKey: ['dashboard', 'arrivals'], queryFn: getTodayArrivals });
    const { data: departures } = useQuery({ queryKey: ['dashboard', 'departures'], queryFn: getTodayDepartures });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Arrivals */}
            <div className="card">
                <div className="card-header flex items-center gap-2">
                    <ArrowDownCircle size={18} className="text-green-400" />
                    <h3 className="text-lg font-semibold text-white">
                        Arrivals Today
                        <span className="text-sm font-normal text-slate-400 ml-2">
                            ({arrivals?.length ?? 0})
                        </span>
                    </h3>
                </div>
                <div className="card-body">
                    {!arrivals || arrivals.length === 0 ? (
                        <p className="text-slate-500 text-sm">No arrivals expected today</p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {arrivals.map((arrival) => (
                                <div
                                    key={arrival.reservation.id}
                                    className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                                            <User size={18} className="text-green-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{arrival.guestName}</p>
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                <span>Room {arrival.roomNumber}</span>
                                                {arrival.roomType && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{arrival.roomType}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onCheckIn?.(arrival.reservation.id)}
                                        className="btn btn-primary btn-sm"
                                    >
                                        <CheckCircle size={14} className="mr-1" />
                                        Check In
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Departures */}
            <div className="card">
                <div className="card-header flex items-center gap-2">
                    <ArrowUpCircle size={18} className="text-blue-400" />
                    <h3 className="text-lg font-semibold text-white">
                        Departures Today
                        <span className="text-sm font-normal text-slate-400 ml-2">
                            ({departures?.length ?? 0})
                        </span>
                    </h3>
                </div>
                <div className="card-body">
                    {!departures || departures.length === 0 ? (
                        <p className="text-slate-500 text-sm">No departures expected today</p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {departures.map((departure) => (
                                <div
                                    key={departure.booking.id}
                                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${departure.isOverdue
                                        ? 'bg-red-500/10 border border-red-500/30'
                                        : 'bg-slate-700/30 hover:bg-slate-700/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${departure.isOverdue ? 'bg-red-500/20' : 'bg-blue-500/20'
                                            }`}>
                                            <User size={18} className={departure.isOverdue ? 'text-red-400' : 'text-blue-400'} />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">
                                                {departure.guestName}
                                                {departure.isOverdue && (
                                                    <span className="ml-2 text-xs text-red-400 font-normal">OVERDUE</span>
                                                )}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                <span>Room {departure.roomNumber}</span>
                                                {departure.balance > 0 && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-amber-400">₦{departure.balance.toLocaleString()} due</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onCheckOut?.(departure.booking.id)}
                                        className={`btn btn-sm ${departure.isOverdue ? 'bg-red-500 hover:bg-red-600' : 'btn-secondary'}`}
                                    >
                                        <LogOut size={14} className="mr-1" />
                                        Check Out
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
