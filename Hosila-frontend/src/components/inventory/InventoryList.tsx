import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInventoryStats, getLowStockItems, getAllInventoryItems } from '@/db/inventory';
import { InventoryCard } from './InventoryCard';
import { InventoryDetailsModal } from './InventoryDetailsModal';
import { InventoryForm } from './InventoryForm';
import type { InventoryItem, InventoryCategory, AmenityBehavior } from '@/types';
import {
    Search,
    Plus,
    AlertTriangle,
    Package,
    Filter,
    RotateCcw,
    CheckSquare,
    Printer,
    LayoutGrid,
    TableProperties,
} from 'lucide-react';

const categories: { value: InventoryCategory | 'all' | 'low_stock'; label: string }[] = [
    { value: 'all', label: 'All Items' },
    { value: 'low_stock', label: '⚠️ Low Stock' },
    { value: 'food', label: 'Food / Kitchen' },
    { value: 'housekeeping', label: 'Housekeeping' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'front_office', label: 'Front Office' },
    { value: 'beverages', label: 'Beverages' },
    { value: 'laundry', label: 'Laundry' },
    { value: 'amenities', label: 'Amenities' },
];

export function InventoryList() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<InventoryCategory | 'all' | 'low_stock'>('all');
    const [behaviorFilter, setBehaviorFilter] = useState<AmenityBehavior | 'all' | 'amenity'>('all');
    const [showForm, setShowForm] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

    // Get all inventory items
    const { data: allItems } = useQuery({ queryKey: ['inventory_items'], queryFn: getAllInventoryItems });

    // Get stats
    const { data: stats } = useQuery({ queryKey: ['getInventoryStats'], queryFn: getInventoryStats });

    // Get low stock items
    const { data: lowStockItems } = useQuery({ queryKey: ['getLowStockItems'], queryFn: getLowStockItems });

    // Filter items
    const filteredItems = allItems?.filter(item => {
        // Filter by category
        if (selectedCategory === 'low_stock') {
            if (item.current_stock > item.min_stock_level) return false;
        } else if (selectedCategory !== 'all') {
            if (item.category !== selectedCategory) return false;
        }

        // Filter by behavior
        if (behaviorFilter === 'consumable' && item.behavior !== 'consumable') return false;
        if (behaviorFilter === 'returnable' && item.behavior !== 'returnable') return false;
        if (behaviorFilter === 'amenity' && !item.is_amenity) return false;

        // Filter by search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return item.name.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query);
        }

        return true;
    }).sort((a, b) => {
        // Low stock items first
        const aLow = a.current_stock <= a.min_stock_level;
        const bLow = b.current_stock <= b.min_stock_level;
        if (aLow && !bLow) return -1;
        if (!aLow && bLow) return 1;
        return a.name.localeCompare(b.name);
    }) ?? [];

    // Count by behavior
    const consumableCount = allItems?.filter(i => i.behavior === 'consumable').length ?? 0;
    const returnableCount = allItems?.filter(i => i.behavior === 'returnable').length ?? 0;
    const amenityCount = allItems?.filter(i => i.is_amenity).length ?? 0;

    // Group items by category for printing
    const itemsByCategory: Partial<Record<InventoryCategory, InventoryItem[]>> = {};
    allItems?.forEach(item => {
        const cat = item.category;
        if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
        itemsByCategory[cat]!.push(item);
    });

    // Print inventory list
    const handlePrintInventory = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const categoryLabels: Record<string, string> = {
            food: 'Food / Kitchen',
            housekeeping: 'Housekeeping',
            maintenance: 'Maintenance',
            front_office: 'Front Office',
            beverages: 'Beverages',
            laundry: 'Laundry',
            amenities: 'Amenities',
        };

        const sortedCategories = Object.keys(itemsByCategory).sort() as InventoryCategory[];
        const currentDate = new Date().toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Inventory Stock Count - ${currentDate}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
                    h1 { font-size: 18px; margin-bottom: 5px; }
                    .header { margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                    .date { color: #666; font-size: 11px; }
                    .category { margin-bottom: 20px; page-break-inside: avoid; }
                    .category-title { background: #333; color: #fff; padding: 8px 12px; font-weight: bold; margin-bottom: 0; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                    th { background: #f5f5f5; font-weight: bold; }
                    .stock-col { width: 80px; text-align: center; }
                    .actual-col { width: 80px; text-align: center; background: #fff9e6; }
                    .variance-col { width: 80px; text-align: center; background: #f0f0f0; }
                    .low-stock { color: #c00; font-weight: bold; }
                    .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px; }
                    .signature { margin-top: 40px; display: flex; justify-content: space-between; }
                    .signature-line { border-top: 1px solid #000; width: 200px; padding-top: 5px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📦 Inventory Physical Stock Count</h1>
                    <p class="date">Generated: ${currentDate}</p>
                </div>
        `;

        sortedCategories.forEach(cat => {
            const catItems = itemsByCategory[cat];
            if (!catItems) return;
            const items = [...catItems].sort((a, b) => a.name.localeCompare(b.name));
            html += `
                <div class="category">
                    <h2 class="category-title">${categoryLabels[cat] || cat}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Unit</th>
                                <th class="stock-col">System</th>
                                <th class="actual-col">Actual</th>
                                <th class="variance-col">Variance</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            items.forEach(item => {
                const isLow = item.current_stock <= item.min_stock_level;
                html += `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.unit_type}</td>
                        <td class="stock-col ${isLow ? 'low-stock' : ''}">${item.current_stock}</td>
                        <td class="actual-col"></td>
                        <td class="variance-col"></td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        });

        html += `
                <div class="footer">
                    <p><strong>Instructions:</strong> Count physical stock and write in "Actual" column. Calculate variance (Actual - System).</p>
                    <div class="signature">
                        <div>
                            <div class="signature-line">Counted By</div>
                        </div>
                        <div>
                            <div class="signature-line">Verified By</div>
                        </div>
                        <div>
                            <div class="signature-line">Date</div>
                        </div>
                    </div>
                </div>
                <script>window.onload = function() { window.print(); }</script>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-4">
                    <p className="text-sm text-slate-400">Total Items</p>
                    <p className="text-3xl font-bold text-white">{stats?.totalItems ?? 0}</p>
                </div>
                <div className={`card p-4 ${(lowStockItems?.length ?? 0) > 0 ? 'border-red-500/50' : ''}`}>
                    <p className="text-sm text-slate-400 flex items-center gap-1">
                        <AlertTriangle size={14} />
                        Low Stock
                    </p>
                    <p className={`text-3xl font-bold ${(lowStockItems?.length ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                        {lowStockItems?.length ?? 0}
                    </p>
                </div>
                <div className="card p-4">
                    <p className="text-sm text-slate-400">Categories</p>
                    <p className="text-3xl font-bold text-primary-400">
                        {Object.keys(stats?.byCategory ?? {}).length}
                    </p>
                </div>
                <div className="card p-4">
                    <p className="text-sm text-slate-400">Stock Value</p>
                    <p className="text-3xl font-bold text-status-available">
                        ₦{(stats?.totalValue ?? 0).toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Low stock alert */}
            {(lowStockItems?.length ?? 0) > 0 && selectedCategory !== 'low_stock' && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-red-400">
                        <AlertTriangle size={18} />
                        <span className="font-medium">{lowStockItems?.length} items are low on stock!</span>
                    </div>
                    <button
                        onClick={() => setSelectedCategory('low_stock')}
                        className="text-sm text-red-400 hover:text-red-300 underline"
                    >
                        View all
                    </button>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                {/* Search */}
                <div className="flex items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search inventory..."
                            className="input pl-10 w-full"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-slate-400" />
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value as InventoryCategory | 'all' | 'low_stock')}
                            className="input py-2"
                        >
                            {categories.map((cat) => (
                                <option key={cat.value} value={cat.value}>
                                    {cat.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* View Toggle */}
                <div className="flex border border-slate-700 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setViewMode('cards')}
                        className={`p-2 ${viewMode === 'cards' ? 'bg-primary-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        title="Card View"
                    >
                        <LayoutGrid size={18} />
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        className={`p-2 ${viewMode === 'table' ? 'bg-primary-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        title="Table View"
                    >
                        <TableProperties size={18} />
                    </button>
                </div>

                {/* Print & Add Item */}
                <div className="flex gap-2">
                    <button
                        onClick={handlePrintInventory}
                        className="btn btn-secondary"
                        title="Print inventory for stock count"
                    >
                        <Printer size={18} className="mr-1" />
                        Print
                    </button>
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">
                        <Plus size={18} className="mr-1" />
                        Add Item
                    </button>
                </div>
            </div>

            {/* Behavior Filter Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    onClick={() => setBehaviorFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${behaviorFilter === 'all'
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                >
                    All
                </button>
                <button
                    onClick={() => setBehaviorFilter('consumable')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${behaviorFilter === 'consumable'
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                >
                    <Package size={14} />
                    Consumable
                    <span className="text-xs opacity-70">({consumableCount})</span>
                </button>
                <button
                    onClick={() => setBehaviorFilter('returnable')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${behaviorFilter === 'returnable'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                >
                    <RotateCcw size={14} />
                    Returnable
                    <span className="text-xs opacity-70">({returnableCount})</span>
                </button>
                <button
                    onClick={() => setBehaviorFilter('amenity')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${behaviorFilter === 'amenity'
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                >
                    <CheckSquare size={14} />
                    Amenities
                    <span className="text-xs opacity-70">({amenityCount})</span>
                </button>
            </div>

            {/* Results count */}
            <p className="text-sm text-slate-400">
                Showing {filteredItems.length} items
                {selectedCategory !== 'all' && ` in ${selectedCategory.replace('_', ' ')}`}
                {behaviorFilter !== 'all' && ` (${behaviorFilter})`}
            </p>

            {/* Items Grid or Table */}
            {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <Package size={48} className="mx-auto mb-3 opacity-50" />
                    <p>No items found</p>
                </div>
            ) : viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredItems.map((item) => (
                        <InventoryCard
                            key={item.id}
                            item={item}
                            onClick={() => setSelectedItem(item)}
                        />
                    ))}
                </div>
            ) : (
                /* Table View */
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-700/50">
                                    <th className="text-left p-3 text-sm font-medium text-slate-300">Item Name</th>
                                    <th className="text-left p-3 text-sm font-medium text-slate-300">Category</th>
                                    <th className="text-center p-3 text-sm font-medium text-slate-300">Current Stock</th>
                                    <th className="text-center p-3 text-sm font-medium text-slate-300">Min Level</th>
                                    <th className="text-center p-3 text-sm font-medium text-slate-300">Type</th>
                                    <th className="text-right p-3 text-sm font-medium text-slate-300">Unit Cost</th>
                                    <th className="text-center p-3 text-sm font-medium text-slate-300">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {filteredItems.map((item) => {
                                    const isLow = item.current_stock <= item.min_stock_level;
                                    return (
                                        <tr
                                            key={item.id}
                                            onClick={() => setSelectedItem(item)}
                                            className="hover:bg-slate-700/50 cursor-pointer transition-colors"
                                        >
                                            <td className="p-3">
                                                <p className="text-white font-medium">{item.name}</p>
                                                {item.is_amenity && (
                                                    <span className="text-xs text-primary-400">Amenity</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-slate-300 text-sm capitalize">
                                                {item.category.replace('_', ' ')}
                                            </td>
                                            <td className={`p-3 text-center font-medium ${isLow ? 'text-red-400' : 'text-white'
                                                }`}>
                                                {item.current_stock}
                                            </td>
                                            <td className="p-3 text-center text-slate-400">
                                                {item.min_stock_level}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-xs ${item.behavior === 'consumable'
                                                    ? 'bg-slate-600 text-slate-200'
                                                    : 'bg-blue-500/20 text-blue-400'
                                                    }`}>
                                                    {item.behavior === 'consumable' ? 'Consumable' : 'Returnable'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right text-slate-300">
                                                {item.unit_cost ? `₦${item.unit_cost.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="p-3 text-center">
                                                {isLow ? (
                                                    <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 flex items-center justify-center gap-1">
                                                        <AlertTriangle size={12} />
                                                        Low
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showForm && (
                <InventoryForm
                    onClose={() => setShowForm(false)}
                    onSuccess={() => setShowForm(false)}
                />
            )}

            {selectedItem && (
                <InventoryDetailsModal
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                />
            )}
        </div>
    );
}
