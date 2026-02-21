import { useRef, useEffect } from 'react';
import type { Room } from '@/types';
import { UserPlus, Trash2, Wrench, X } from 'lucide-react';

interface RoomActionMenuProps {
    room: Room;
    onCheckIn: () => void;
    onMarkDirty: () => void;
    onMarkMaintenance: () => void;
    onClose: () => void;
}

export function RoomActionMenu({
    room,
    onCheckIn,
    onMarkDirty,
    onMarkMaintenance,
    onClose,
}: RoomActionMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
                ref={menuRef}
                className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-xs overflow-hidden animate-fade-in"
            >
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Room {room.room_number}</h3>
                        <p className="text-sm text-slate-400">{room.room_type}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-2">
                    <button
                        onClick={onCheckIn}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-primary-500/20 rounded-lg transition-colors"
                    >
                        <UserPlus size={20} className="text-primary-400" />
                        <div>
                            <p className="font-medium">Check-In Guest</p>
                            <p className="text-xs text-slate-400">Start a new stay</p>
                        </div>
                    </button>

                    <button
                        onClick={onMarkDirty}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-amber-500/20 rounded-lg transition-colors"
                    >
                        <Trash2 size={20} className="text-amber-400" />
                        <div>
                            <p className="font-medium">Mark as Dirty</p>
                            <p className="text-xs text-slate-400">Needs cleaning</p>
                        </div>
                    </button>

                    <button
                        onClick={onMarkMaintenance}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                        <Wrench size={20} className="text-red-400" />
                        <div>
                            <p className="font-medium">Mark as Maintenance</p>
                            <p className="text-xs text-slate-400">Out of service</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
