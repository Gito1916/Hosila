import { useState } from 'react';
import { InventoryList, InventoryReport } from '@/components/inventory';
import { Package, BarChart3 } from 'lucide-react';

type Tab = 'items' | 'report';

export function InventoryPage() {
    const [tab, setTab] = useState<Tab>('items');

    return (
        <div className="space-y-4">
            {/* Tab Switcher */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setTab('items')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'items'
                            ? 'border-primary-500 text-heading'
                            : 'border-transparent text-muted hover:text-heading'
                        }`}
                >
                    <Package size={16} />
                    Stock Items
                </button>
                <button
                    onClick={() => setTab('report')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'report'
                            ? 'border-primary-500 text-heading'
                            : 'border-transparent text-muted hover:text-heading'
                        }`}
                >
                    <BarChart3 size={16} />
                    Movement Report
                </button>
            </div>

            {/* Tab Content */}
            {tab === 'items' ? <InventoryList /> : <InventoryReport />}
        </div>
    );
}
