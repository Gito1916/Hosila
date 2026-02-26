import { useState } from 'react';
import { format, startOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { useReportDownload } from '@/hooks/useHosilaApi';
import { toast } from '@/lib/errorMessages';

import {
    FileText,
    FileSpreadsheet,
    Loader2,
    Receipt,
    TrendingUp,
    TrendingDown,
    Calculator,
    ListChecks,
    Building2,
    Utensils,
    Package,
} from 'lucide-react';

type DateRange = 'today' | 'week' | 'month' | 'custom';
type ReportType = 'accommodation' | 'restaurant' | 'inventory' | 'tax-remittance';
type ExportingFormat = 'pdf' | 'excel' | null;

const reportTypes: { value: ReportType; label: string; description: string; icon: typeof Receipt; formats: ('pdf' | 'excel')[] }[] = [
    { value: 'accommodation', label: 'Accommodation Report', description: 'RevPAR, ADR, occupancy & revenue by room type', icon: Building2, formats: ['excel'] },
    { value: 'restaurant', label: 'Restaurant Report', description: 'Item sales, margins, top sellers & daily breakdown', icon: Utensils, formats: ['excel'] },
    { value: 'inventory', label: 'Inventory Report', description: 'Stock movements: opening, purchases, usage, closing', icon: Package, formats: ['excel'] },
    { value: 'tax-remittance', label: 'Tax Report', description: 'SC, VAT & TDL breakdown for compliance', icon: Calculator, formats: ['pdf', 'excel'] },
];

export function FinanceExport() {
    const [dateRange, setDateRange] = useState<DateRange>('month');
    const [reportType, setReportType] = useState<ReportType>('accommodation');
    const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [exportingFormat, setExportingFormat] = useState<ExportingFormat>(null);

    const downloadMutation = useReportDownload();

    const getDateRangeValues = () => {
        const now = new Date();
        switch (dateRange) {
            case 'today':
                return { start: format(now, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
            case 'week': {
                const ws = startOfWeek(now, { weekStartsOn: 1 });
                const we = endOfWeek(now, { weekStartsOn: 1 });
                return { start: format(ws, 'yyyy-MM-dd'), end: format(we, 'yyyy-MM-dd') };
            }
            case 'month':
                return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
            case 'custom':
                return { start: customStart, end: customEnd };
        }
    };

    const selectedReport = reportTypes.find(r => r.value === reportType)!;

    const handleExport = async (fmt: 'pdf' | 'excel') => {
        setExportingFormat(fmt);
        const { start, end } = getDateRangeValues();
        try {
            await downloadMutation.mutateAsync({
                type: reportType,
                start,
                end,
                format: fmt,
            });
            toast.success(`${selectedReport.label} downloaded as ${fmt === 'pdf' ? 'PDF' : 'Excel'}`);
        } catch {
            toast.error('Failed to download report');
        } finally {
            setExportingFormat(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* Report Type Selection */}
            <div>
                <label className="label">Report Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {reportTypes.map((type) => {
                        const Icon = type.icon;
                        return (
                            <button
                                key={type.value}
                                onClick={() => setReportType(type.value)}
                                className={`p-3 rounded-lg text-left transition-all ${reportType === type.value
                                    ? 'bg-primary-500/20 border-2 border-primary-500'
                                    : 'bg-surface-card border border-border hover:border-border-strong'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon size={16} className={reportType === type.value ? 'text-primary-400' : 'text-muted'} />
                                    <span className={`font-medium ${reportType === type.value ? 'text-heading' : 'text-muted'}`}>
                                        {type.label}
                                    </span>
                                </div>
                                <p className="text-xs text-muted">{type.description}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Date Range Selection */}
            <div>
                <label className="label">Date Range</label>
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { value: 'today', label: 'Today' },
                        { value: 'week', label: 'This Week' },
                        { value: 'month', label: 'This Month' },
                        { value: 'custom', label: 'Custom' },
                    ].map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => setDateRange(opt.value as DateRange)}
                            className={`py-2 px-3 rounded-lg text-sm font-medium ${dateRange === opt.value
                                ? 'bg-primary-500 text-heading'
                                : 'bg-surface-raised/50 text-muted hover:text-heading'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Custom Date Range */}
            {dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="label">Start Date</label>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="input"
                        />
                    </div>
                    <div>
                        <label className="label">End Date</label>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="input"
                        />
                    </div>
                </div>
            )}

            {/* Export Format Selection */}
            <div>
                <label className="label">Export Format</label>
                <div className="grid grid-cols-2 gap-3">
                    {selectedReport.formats.includes('pdf') && (
                        <button
                            onClick={() => handleExport('pdf')}
                            disabled={exportingFormat !== null}
                            className="btn btn-secondary flex items-center justify-center gap-2"
                        >
                            {exportingFormat === 'pdf' ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <FileText size={18} />
                            )}
                            PDF Report
                        </button>
                    )}
                    <button
                        onClick={() => handleExport('excel')}
                        disabled={exportingFormat !== null}
                        className={`btn ${selectedReport.formats.includes('pdf') ? 'btn-primary' : 'btn-primary col-span-2'} flex items-center justify-center gap-2`}
                    >
                        {exportingFormat === 'excel' ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <FileSpreadsheet size={18} />
                        )}
                        Excel Report
                    </button>
                </div>
            </div>
        </div>
    );
}
