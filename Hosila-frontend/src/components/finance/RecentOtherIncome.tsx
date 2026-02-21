import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DollarSign, Trash2, Calendar } from 'lucide-react';
import { requireSupabase, getHotelId } from '@/lib/api';

// Category labels for display
const categoryLabels: Record<string, string> = {
    event: 'Event/Conference',
    parking: 'Parking',
    laundry: 'Laundry',
    minibar: 'Minibar',
    phone_calls: 'Phone Calls',
    other: 'Other',
};

export function RecentOtherIncome() {
    // Get recent other income entries (last 10)
    const { data: otherIncomes } = useQuery({ queryKey: ['otherIncomes'], queryFn: async () => {
        const all = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('other_income').select('*').eq('hotel_id', hotelId); return data ?? []; })();
        return all
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
    } });

    const handleDelete = async (id: string) => {
        if (confirm('Delete this income entry?')) {
            await (async () => { const sb = requireSupabase(); await sb.from('other_income').delete().eq('id', id); })();
        }
    };

    if (!otherIncomes || otherIncomes.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <DollarSign size={32} className="mx-auto mb-2 opacity-50" />
                <p>No other income recorded yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 max-h-96 overflow-y-auto">
            {otherIncomes.map((income) => (
                <div
                    key={income.id}
                    className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-green-400 font-medium">
                                ₦{income.amount.toLocaleString()}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                                {categoryLabels[income.category] ?? income.category}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                            <Calendar size={12} />
                            <span>{format(new Date(income.date), 'MMM d, yyyy')}</span>
                            {income.description && (
                                <>
                                    <span>•</span>
                                    <span className="truncate">{income.description}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => handleDelete(income.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded-lg transition-colors"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ))}
        </div>
    );
}
