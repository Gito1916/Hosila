import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useInventoryReport, useReportDownload } from '@/hooks/useHosilaApi';
import {
    BarChart3,
    Download,
    Loader2,
    Package,
    TrendingDown,
    TrendingUp,
    AlertTriangle,
    FileText,
} from 'lucide-react';
import { toast } from '@/lib/errorMessages';

export function InventoryReport() {
    const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [end, setEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [exportingFormat, setExportingFormat] = useState<'pdf' | 'excel' | null>(null);

    const { data: report, isLoading } = useInventoryReport(start, end) as {
        data: {
            period_start: string;
            period_end: string;
            items: Array<{
                item_id: string;
                item_name: string;
                category: string;
                unit_type: string;
                opening_stock: number;
                purchases: number;
                usage: number;
                wastage: number;
                closing_stock: number;
                unit_cost: number;
                total_value: number;
            }>;
            total_opening_value: number;
            total_closing_value: number;
            total_purchases_value: number;
            total_usage_value: number;
        } | undefined;
        isLoading: boolean;
    };

    const downloadMutation = useReportDownload();

    const handleExport = async (fmt: 'pdf' | 'excel') => {
        setExportingFormat(fmt);
        try {
            await downloadMutation.mutateAsync({
                type: 'inventory',
                start,
                end,
                format: fmt,
            });
            toast.success(`Report downloaded as ${fmt.toUpperCase()}`);
        } catch {
            toast.error('Failed to download report');
        } finally {
            setExportingFormat(null);
        }
    };

    const f = (n: number) => `₦${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Group items by category
    const groupedItems = useMemo(() => {
        if (!report?.items) return {};
        const groups: Record<string, typeof report.items> = {};
        for (const item of report.items) {
            if (!groups[item.category]) groups[item.category] = [];
            groups[item.category].push(item);
        }
        return groups;
    }, [report]);

    const categoryLabels: Record<string, string> = {
        food: 'Food / Kitchen',
        housekeeping: 'Housekeeping',
        maintenance: 'Maintenance',
        front_office: 'Front Office',
        beverages: 'Beverages',
        laundry: 'Laundry',
        amenities: 'Amenities',
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <BarChart3 size={22} className="text-primary-400" />
                    <h2 className="text-lg font-bold text-heading">Inventory Movement Report</h2>
                </div>

                <div className="flex items-center gap-3">
                    {/* Date Range */}
                    <input
                        type="date"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        className="input py-1.5 text-sm"
                    />
                    <span className="text-muted text-sm">to</span>
                    <input
                        type="date"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                        className="input py-1.5 text-sm"
                    />

                    {/* Export */}
                    <button
                        onClick={() => handleExport('excel')}
                        disabled={exportingFormat !== null || !report}
                        className="btn btn-secondary text-sm"
                    >
                        {exportingFormat === 'excel' ? (
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                            <Download size={14} className="mr-1.5" />
                        )}
                        Excel
                    </button>
                    <button
                        onClick={() => handleExport('pdf')}
                        disabled={exportingFormat !== null || !report}
                        className="btn btn-secondary text-sm"
                    >
                        {exportingFormat === 'pdf' ? (
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                            <FileText size={14} className="mr-1.5" />
                        )}
                        PDF
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={28} className="animate-spin text-primary-500" />
                </div>
            ) : !report || report.items.length === 0 ? (
                <div className="text-center py-12 text-muted">
                    <Package size={40} className="mx-auto mb-3 opacity-50" />
                    <p>No inventory movement data for this period.</p>
                </div>
            ) : (
                <>
                    {/* Summary KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-surface-card rounded-xl p-4 border border-border">
                            <div className="flex items-center gap-2 mb-1">
                                <Package size={16} className="text-blue-400" />
                                <span className="text-muted text-xs">Opening Value</span>
                            </div>
                            <p className="text-xl font-bold text-heading">{f(report.total_opening_value)}</p>
                        </div>
                        <div className="bg-surface-card rounded-xl p-4 border border-border">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp size={16} className="text-green-400" />
                                <span className="text-muted text-xs">Purchases</span>
                            </div>
                            <p className="text-xl font-bold text-green-400">{f(report.total_purchases_value)}</p>
                        </div>
                        <div className="bg-surface-card rounded-xl p-4 border border-border">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingDown size={16} className="text-red-400" />
                                <span className="text-muted text-xs">Usage Value</span>
                            </div>
                            <p className="text-xl font-bold text-red-400">{f(report.total_usage_value)}</p>
                        </div>
                        <div className="bg-gradient-to-r from-primary-500/20 to-purple-500/20 rounded-xl p-4 border border-primary-500/30">
                            <div className="flex items-center gap-2 mb-1">
                                <Package size={16} className="text-primary-400" />
                                <span className="text-muted text-xs font-medium">Closing Value</span>
                            </div>
                            <p className="text-xl font-bold text-heading">{f(report.total_closing_value)}</p>
                        </div>
                    </div>

                    {/* Movement Table by Category */}
                    {Object.entries(groupedItems).map(([category, items]) => (
                        <div key={category} className="bg-surface-card rounded-xl border border-border overflow-hidden">
                            <div className="px-4 py-3 bg-surface-raised/50 border-b border-border">
                                <h3 className="text-sm font-semibold text-heading">
                                    {categoryLabels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    <span className="text-muted font-normal ml-2">({items.length} items)</span>
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className="text-left text-muted font-medium py-2.5 px-4">Item</th>
                                            <th className="text-center text-muted font-medium py-2.5 px-3">Unit</th>
                                            <th className="text-center text-blue-400 font-medium py-2.5 px-3">Opening</th>
                                            <th className="text-center text-green-400 font-medium py-2.5 px-3">Purchased</th>
                                            <th className="text-center text-amber-400 font-medium py-2.5 px-3">Used</th>
                                            <th className="text-center text-red-400 font-medium py-2.5 px-3">Wasted</th>
                                            <th className="text-center text-heading font-medium py-2.5 px-3">Closing</th>
                                            <th className="text-right text-muted font-medium py-2.5 px-4">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => {
                                            const hasWastage = item.wastage > 0;
                                            return (
                                                <tr key={item.item_id} className="border-b border-border/50 hover:bg-surface-raised/30">
                                                    <td className="py-2.5 px-4 text-heading font-medium">{item.item_name}</td>
                                                    <td className="py-2.5 px-3 text-center text-muted">{item.unit_type}</td>
                                                    <td className="py-2.5 px-3 text-center text-blue-300">{item.opening_stock}</td>
                                                    <td className="py-2.5 px-3 text-center text-green-300">
                                                        {item.purchases > 0 ? `+${item.purchases}` : '—'}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center text-amber-300">
                                                        {item.usage > 0 ? `-${item.usage}` : '—'}
                                                    </td>
                                                    <td className={`py-2.5 px-3 text-center ${hasWastage ? 'text-red-400 font-medium' : 'text-muted'}`}>
                                                        {hasWastage ? (
                                                            <span className="flex items-center justify-center gap-1">
                                                                <AlertTriangle size={12} />
                                                                -{item.wastage}
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center text-heading font-semibold">{item.closing_stock}</td>
                                                    <td className="py-2.5 px-4 text-right text-muted">{f(item.total_value)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
