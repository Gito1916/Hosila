import { RoomStatus } from '@/types';
import {
    BedDouble,
    User,
    Clock,
    Wrench,
    Sparkles,
} from 'lucide-react';

interface StatusLegendProps {
    stats?: Record<RoomStatus, number>;
    onFilterClick?: (status: RoomStatus | 'all') => void;
    activeFilter?: RoomStatus | 'all';
}

const statusConfig: Record<RoomStatus, {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ReactNode;
}> = {
    available: {
        label: 'Available',
        color: 'text-green-400',
        bgColor: 'bg-green-500',
        icon: <BedDouble size={14} />,
    },
    occupied: {
        label: 'Occupied',
        color: 'text-red-400',
        bgColor: 'bg-red-500',
        icon: <User size={14} />,
    },
    short_rest: {
        label: 'Short Rest',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500',
        icon: <Clock size={14} />,
    },
    dirty: {
        label: 'Dirty',
        color: 'text-orange-400',
        bgColor: 'bg-orange-500',
        icon: <Sparkles size={14} />,
    },
    maintenance: {
        label: 'Maintenance',
        color: 'text-slate-400',
        bgColor: 'bg-slate-500',
        icon: <Wrench size={14} />,
    },
};

export function StatusLegend({ stats, onFilterClick, activeFilter = 'all' }: StatusLegendProps) {
    const totalRooms = stats
        ? Object.values(stats).reduce((sum, count) => sum + count, 0)
        : 0;

    return (
        <div className="card p-3">
            <div className="flex items-center flex-wrap gap-2">
                {/* All button */}
                <button
                    onClick={() => onFilterClick?.('all')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeFilter === 'all'
                            ? 'bg-primary-500 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                >
                    <span className="w-3 h-3 bg-primary-500 rounded-full" />
                    All ({totalRooms})
                </button>

                {/* Status buttons */}
                {(Object.keys(statusConfig) as RoomStatus[]).map(status => {
                    const config = statusConfig[status];
                    const count = stats?.[status] ?? 0;

                    return (
                        <button
                            key={status}
                            onClick={() => onFilterClick?.(status)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeFilter === status
                                    ? 'bg-primary-500 text-white'
                                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                                }`}
                        >
                            <span className={`w-3 h-3 ${config.bgColor} rounded-full`} />
                            <span className="hidden sm:inline">{config.label}</span>
                            <span className="text-xs">({count})</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
