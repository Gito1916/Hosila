import { useState } from 'react';
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
type DateFilter = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function FinancePage() {
    const [activeTab, setActiveTab] = useState<FinanceTab>('overview');
    const [dateFilter, setDateFilter] = useState<DateFilter>('daily');
    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [incomeSection, setIncomeSection] = useState<'accommodation' | 'restaurant' | 'other'>('accommodation');

    const filterLabels: Record<DateFilter, string> = {
        daily: 'Daily',
        weekly: 'Weekly',
        monthly: 'Monthly',
        yearly: 'Yearly',
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
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Finance</h2>
                    <p className="text-slate-400">Revenue, expenses, and financial reports</p>
                </div>
            </div>

            {/* Tab Navigation + Date Filters + Export in same row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Left: Tab buttons */}
                <div className="flex rounded-lg overflow-hidden border border-slate-700 w-fit">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2.5 flex items-center gap-2 font-medium transition-all text-sm ${activeTab === tab.key
                                ? 'bg-primary-500 text-white'
                                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
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
                        <Calendar size={16} className="text-slate-400" />
                        <div className="flex rounded-lg overflow-hidden border border-slate-700 text-sm">
                            {(Object.keys(filterLabels) as DateFilter[]).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setDateFilter(filter)}
                                    className={`px-3 py-2 font-medium transition-all ${dateFilter === filter
                                        ? 'bg-primary-500 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
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

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <FinanceDashboard
                    dateFilter={dateFilter}
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
                <IncomeTab dateFilter={dateFilter} activeSection={incomeSection} onSectionChange={setIncomeSection} />
            )}

            {activeTab === 'expenses' && (
                <div className="space-y-4">
                    {/* Add Expense Button */}
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-white">Expense Records</h3>
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
                <TransactionsList dateFilter={dateFilter} />
            )}

            {activeTab === 'tax' && (
                <TaxSummary />
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
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Download size={20} />
                                Export Financial Report
                            </h3>
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
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
