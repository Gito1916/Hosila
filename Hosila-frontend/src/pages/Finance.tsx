import { useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, subDays } from 'date-fns';
import { FinanceDashboard, FinanceExport, ExpenseList, ExpenseForm, TaxSummary } from '@/components/finance';
import { TransactionsList } from '@/components/finance/TransactionsList';
import { IncomeTab } from '@/components/finance/IncomeTab';
import {
    BarChart3,
    Receipt,
    TrendingUp,
    PieChart,
    Calendar,
    Download,
    ArrowUpDown,
} from 'lucide-react';

type FinanceTab = 'overview' | 'income' | 'expenses' | 'transactions' | 'tax';
type DateFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

function getDateRange(filter: DateFilter, customStart?: string, customEnd?: string) {
    const now = new Date();
    switch (filter) {
        case 'daily':
            return { start: startOfDay(now), end: endOfDay(now) };
        case 'weekly':
            return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
        case 'monthly':
            return { start: startOfMonth(now), end: endOfMonth(now) };
        case 'yearly':
            return { start: startOfYear(now), end: endOfDay(now) };
        case 'custom':
            return {
                start: customStart ? startOfDay(new Date(customStart)) : startOfDay(subDays(now, 30)),
                end: customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now),
            };
    }
}

export function FinancePage() {
    const [activeTab, setActiveTab] = useState<FinanceTab>('overview');
    const [dateFilter, setDateFilter] = useState<DateFilter>('daily');
    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [incomeSection, setIncomeSection] = useState<'accommodation' | 'restaurant' | 'other'>('accommodation');

    // Custom date range state
    const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

    const dateRange = useMemo(
        () => getDateRange(dateFilter, customStart, customEnd),
        [dateFilter, customStart, customEnd],
    );

    const filterLabels: Record<DateFilter, string> = {
        daily: 'Daily',
        weekly: 'Weekly',
        monthly: 'Monthly',
        yearly: 'Yearly',
        custom: 'Custom',
    };

    const tabs: { key: FinanceTab; label: string; icon: typeof BarChart3 }[] = [
        { key: 'overview', label: 'Overview', icon: BarChart3 },
        { key: 'income', label: 'Income', icon: TrendingUp },
        { key: 'expenses', label: 'Expenses', icon: Receipt },
        { key: 'transactions', label: 'Transactions', icon: ArrowUpDown },
        { key: 'tax', label: 'Tax', icon: PieChart },
    ];

    return (
        <div className="space-y-6">

            {/* Tab Navigation + Date Filters + Export in same row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Left: Tab buttons */}
                <div className="flex rounded-lg overflow-hidden border border-border w-fit">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2.5 flex items-center gap-2 font-medium transition-all text-sm ${activeTab === tab.key
                                ? 'bg-primary-500 text-heading'
                                : 'bg-surface-card text-muted hover:text-heading hover:bg-surface-raised'
                                }`}
                        >
                            <tab.icon size={16} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Right: Date Filter + Export */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-muted" />
                        <div className="flex rounded-lg overflow-hidden border border-border text-sm">
                            {(Object.keys(filterLabels) as DateFilter[]).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setDateFilter(filter)}
                                    className={`px-3 py-2 font-medium transition-all ${dateFilter === filter
                                        ? 'bg-primary-500 text-heading'
                                        : 'bg-surface-card text-muted hover:text-heading hover:bg-surface-raised'
                                        }`}
                                >
                                    {filterLabels[filter]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={() => setShowExportModal(true)}
                        className="btn btn-secondary"
                    >
                        <Download size={16} className="mr-2" />
                        Export
                    </button>
                </div>
            </div>

            {/* Custom Date Range Picker (shared across all tabs) */}
            {dateFilter === 'custom' && (
                <div className="flex items-center gap-4 p-4 bg-surface-card/50 rounded-lg border border-border">
                    <Calendar size={18} className="text-muted" />
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="input py-1.5"
                        />
                        <span className="text-muted">to</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="input py-1.5"
                        />
                    </div>
                    <span className="text-sm text-muted">
                        {format(dateRange.start, 'MMM d, yyyy')} — {format(dateRange.end, 'MMM d, yyyy')}
                    </span>
                </div>
            )}

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <FinanceDashboard
                    dateFilter={dateFilter === 'custom' ? 'daily' : dateFilter}
                    onNavigate={(target, section) => {
                        setActiveTab(target);
                        if (section && (section === 'accommodation' || section === 'restaurant' || section === 'other')) {
                            setIncomeSection(section);
                        }
                    }}
                    onAddExpense={() => setShowExpenseForm(true)}
                />
            )}

            {activeTab === 'income' && (
                <IncomeTab dateFilter={dateFilter === 'custom' ? 'daily' : dateFilter} activeSection={incomeSection} onSectionChange={setIncomeSection} />
            )}

            {activeTab === 'expenses' && (
                <div className="space-y-4">
                    {/* Add Expense Button */}
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-heading">Expense Records</h3>
                        <button
                            onClick={() => setShowExpenseForm(true)}
                            className="btn bg-red-500 hover:bg-red-600"
                        >
                            <Receipt size={16} className="mr-2" />
                            Record Expense
                        </button>
                    </div>
                    <div className="card p-4">
                        <ExpenseList />
                    </div>
                </div>
            )}

            {activeTab === 'transactions' && (
                <TransactionsList dateFilter={dateFilter === 'custom' ? 'daily' : dateFilter} />
            )}

            {activeTab === 'tax' && (
                <TaxSummary
                    startDate={dateRange.start}
                    endDate={dateRange.end}
                />
            )}

            {/* Expense Form Modal */}
            {showExpenseForm && (
                <ExpenseForm
                    onClose={() => setShowExpenseForm(false)}
                    onSuccess={() => setShowExpenseForm(false)}
                />
            )}

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-card rounded-xl border border-border w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-heading flex items-center gap-2">
                                <Download size={20} />
                                Export Financial Report
                            </h3>
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4">
                            <FinanceExport />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
