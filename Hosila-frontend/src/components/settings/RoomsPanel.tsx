import { useState } from 'react';
import { RoomManagement } from './RoomManagement';
import { RoomTypeManagement } from './RoomTypeManagement';
import { DoorOpen, Tag, ChevronDown, ChevronRight } from 'lucide-react';

type Section = 'rooms' | 'room_types';

/**
 * Rooms Panel — combines Room Management + Room Type Management under one settings tab.
 */
export function RoomsPanel() {
    const [expandedSection, setExpandedSection] = useState<Section | null>('rooms');

    const toggleSection = (section: Section) => {
        setExpandedSection(prev => prev === section ? null : section);
    };

    return (
        <div className="space-y-3">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-white">Rooms</h3>
                <p className="text-sm text-slate-400">Manage rooms and room types</p>
            </div>

            {/* Rooms Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('rooms')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <DoorOpen className="text-blue-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-white font-medium text-sm">Room List</h4>
                        <p className="text-xs text-slate-400">Add, edit, and manage individual rooms</p>
                    </div>
                    {expandedSection === 'rooms'
                        ? <ChevronDown size={18} className="text-slate-400" />
                        : <ChevronRight size={18} className="text-slate-400" />
                    }
                </button>
                {expandedSection === 'rooms' && (
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-4">
                        <RoomManagement />
                    </div>
                )}
            </div>

            {/* Room Types Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('room_types')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Tag className="text-purple-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-white font-medium text-sm">Room Types</h4>
                        <p className="text-xs text-slate-400">Configure room categories and base rates</p>
                    </div>
                    {expandedSection === 'room_types'
                        ? <ChevronDown size={18} className="text-slate-400" />
                        : <ChevronRight size={18} className="text-slate-400" />
                    }
                </button>
                {expandedSection === 'room_types' && (
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-4">
                        <RoomTypeManagement />
                    </div>
                )}
            </div>
        </div>
    );
}
