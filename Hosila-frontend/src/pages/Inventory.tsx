import { InventoryList } from '@/components/inventory';

export function InventoryPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Inventory</h2>
                    <p className="text-slate-400">Track supplies and stock levels</p>
                </div>
            </div>

            <InventoryList />
        </div>
    );
}
