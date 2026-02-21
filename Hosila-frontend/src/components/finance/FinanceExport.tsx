import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import { getHotel } from '@/db/settings';
import { requireSupabase, getHotelId } from '@/lib/api';
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
} from 'lucide-react';

type DateRange = 'today' | 'week' | 'month' | 'custom';
type ReportType = 'ledger' | 'income' | 'expense' | 'vat';

const reportTypes: { value: ReportType; label: string; description: string; icon: typeof Receipt }[] = [
    { value: 'ledger', label: 'Transaction Ledger', description: 'Complete audit trail of all transactions', icon: ListChecks },
    { value: 'income', label: 'Income Report', description: 'Revenue by department with guest details', icon: TrendingUp },
    { value: 'expense', label: 'Expense Report', description: 'All expenses with vendor and category', icon: TrendingDown },
    { value: 'vat', label: 'VAT Report', description: 'Tax summary by department for compliance', icon: Calculator },
];

// Unified transaction row for export reports
interface ExportTransaction {
    id: string;
    date: Date;
    type: 'income' | 'expense' | 'payment';
    status: string;
    department: string;
    description: string;
    payment_method: string;
    amount: number;          // net amount (excluding tax) for charges, gross for payments/expenses
    gross_amount: number;    // full amount including tax
    is_taxable: boolean;
    tax_rate: number;
    tax_amount: number;
    guestName: string;
    roomNumber: string;
    reference_id?: string;
    reference_type?: string;
}

export function FinanceExport() {
    const [dateRange, setDateRange] = useState<DateRange>('month');
    const [reportType, setReportType] = useState<ReportType>('ledger');
    const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [isExporting, setIsExporting] = useState(false);

    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });

    const getDateRangeValues = () => {
        const now = new Date();
        switch (dateRange) {
            case 'today':
                return { start: startOfDay(now), end: endOfDay(now) };
            case 'week':
                return { start: startOfWeek(now), end: endOfWeek(now) };
            case 'month':
                return { start: startOfMonth(now), end: endOfMonth(now) };
            case 'custom':
                return { start: new Date(customStart), end: new Date(customEnd + 'T23:59:59') };
        }
    };

    // Fetch all data needed for reports — reads from charges, payments, expenses
    const fetchReportData = async () => {
        const { start, end } = getDateRangeValues();

        // Fetch from accounting v2 tables
        const [allCharges, allPayments, allExpenses, bookings, rooms, guests] = await Promise.all([
            (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('charges').select('*').eq('hotel_id', hotelId); return data ?? []; })(),
            (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('payments').select('*').eq('hotel_id', hotelId); return data ?? []; })(),
            (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('expenses').select('*').eq('hotel_id', hotelId); return data ?? []; })(),
            (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('bookings').select('*').eq('hotel_id', hotelId); return data ?? []; })(),
            (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('rooms').select('*').eq('hotel_id', hotelId); return data ?? []; })(),
            (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('guests').select('*').eq('hotel_id', hotelId); return data ?? []; })(),
        ]);

        // Create lookup maps
        const bookingMap = new Map(bookings.map(b => [b.id, b]));
        const roomMap = new Map(rooms.map(r => [r.id, r]));
        const guestMap = new Map(guests.map(g => [g.id, g]));

        const transactions: ExportTransaction[] = [];

        // --- Charges → income rows ---
        for (const charge of allCharges) {
            const d = new Date(charge.charge_date);
            if (d < start || d > end) continue;

            let guestName = '';
            let roomNumber = '';
            if (charge.booking_id) {
                const booking = bookingMap.get(charge.booking_id);
                if (booking) {
                    const guest = charge.guest_id ? guestMap.get(charge.guest_id) : undefined;
                    const room = roomMap.get(booking.room_id);
                    guestName = guest?.name ?? '';
                    roomNumber = room?.room_number ?? '';
                }
            }

            transactions.push({
                id: charge.id,
                date: d,
                type: 'income',
                status: charge.status === 'cancelled' ? 'reversed' : 'completed',
                department: charge.department,
                description: charge.description,
                payment_method: '-',
                amount: charge.net_revenue ?? charge.gross_amount,
                gross_amount: charge.gross_amount,
                is_taxable: (charge.tax_amount ?? 0) > 0,
                tax_rate: charge.tax_rate ?? 0,
                tax_amount: charge.tax_amount ?? 0,
                guestName,
                roomNumber,
                reference_id: charge.reference_id,
                reference_type: charge.reference_type,
            });
        }

        // --- Payments → payment rows ---
        for (const payment of allPayments) {
            const d = new Date(payment.payment_time ?? payment.created_at);
            if (d < start || d > end) continue;

            let guestName = '';
            let roomNumber = '';
            if (payment.booking_id) {
                const booking = bookingMap.get(payment.booking_id);
                if (booking) {
                    const guest = guestMap.get(booking.guest_id);
                    const room = roomMap.get(booking.room_id);
                    guestName = guest?.name ?? '';
                    roomNumber = room?.room_number ?? '';
                }
            }

            transactions.push({
                id: payment.id,
                date: d,
                type: 'payment',
                status: 'completed',
                department: 'payment',
                description: payment.notes ?? `Payment – ${payment.payment_method}`,
                payment_method: payment.payment_method,
                amount: payment.amount,
                gross_amount: payment.amount,
                is_taxable: false,
                tax_rate: 0,
                tax_amount: 0,
                guestName,
                roomNumber,
                reference_id: payment.id,
                reference_type: 'payment',
            });
        }

        // Filter expenses by date
        const filteredExpenses = allExpenses.filter(e => {
            const d = new Date(e.date);
            return d >= start && d <= end;
        });

        // Sort all transactions by date
        transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

        return {
            hotelName: hotel?.name ?? 'Hotel',
            period: { start, end },
            transactions,
            expenses: filteredExpenses,
        };
    };

    // Generate Transaction Ledger (Audit Trail)
    const generateLedgerPDF = (data: Awaited<ReturnType<typeof fetchReportData>>) => {
        const { transactions } = data;

        const transactionRows = transactions
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(t => `
                <tr class="${t.status === 'reversed' ? 'reversed' : t.status === 'reversal' ? 'reversal' : ''}">
                    <td>${t.id.slice(0, 8)}</td>
                    <td>${format(new Date(t.date), 'dd/MM/yy HH:mm')}</td>
                    <td class="${t.type === 'income' ? 'positive' : 'negative'}">${t.type.toUpperCase()}</td>
                    <td><span class="status-badge status-${t.status || 'completed'}">${(t.status || 'completed').toUpperCase()}</span></td>
                    <td>${t.department}</td>
                    <td>${t.description}</td>
                    <td>${t.payment_method}</td>
                    <td class="amount ${t.gross_amount >= 0 ? 'positive' : 'negative'}">${t.gross_amount >= 0 ? '+' : ''}₦${Math.abs(t.gross_amount).toLocaleString()}</td>
                    <td>${t.tax_amount > 0 ? `₦${Math.abs(t.tax_amount).toLocaleString()}` : '-'}</td>
                </tr>
            `).join('');

        const totalIncome = transactions.filter(t => t.type === 'income' && t.status !== 'reversed').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = Math.abs(transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
        const totalTax = transactions.filter(t => t.status !== 'reversed').reduce((sum, t) => sum + (t.tax_amount || 0), 0);

        return `
            <h2>Transaction Ledger (Audit Trail)</h2>
            <p class="subtitle">${transactions.length} transactions | Net Income: ₦${(totalIncome - totalExpense).toLocaleString()} | VAT Collected: ₦${totalTax.toLocaleString()}</p>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Date/Time</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Department</th>
                        <th>Description</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>VAT</th>
                    </tr>
                </thead>
                <tbody>${transactionRows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="7"><strong>TOTALS</strong></td>
                        <td class="amount"><strong>₦${totalIncome.toLocaleString()}</strong></td>
                        <td><strong>₦${totalTax.toLocaleString()}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
    };

    // Generate Income Report by Department
    const generateIncomePDF = (data: Awaited<ReturnType<typeof fetchReportData>>) => {
        const incomeTransactions = data.transactions.filter(t => t.type === 'income' && t.status !== 'reversal');

        const departments = ['accommodation', 'restaurant', 'other'] as const;
        let html = '<h2>Income Report by Department</h2>';

        for (const dept of departments) {
            const deptTransactions = incomeTransactions.filter(t => t.department === dept);
            if (deptTransactions.length === 0) continue;

            const deptTotal = deptTransactions.reduce((sum, t) => sum + t.amount, 0);
            const deptTax = deptTransactions.reduce((sum, t) => sum + (t.tax_amount || 0), 0);

            html += `
                <h3>${dept.charAt(0).toUpperCase() + dept.slice(1)}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Guest</th>
                            <th>Room</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th>Net Revenue</th>
                            <th>VAT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${deptTransactions.map(t => `
                            <tr class="${t.status === 'reversed' ? 'reversed' : ''}">
                                <td>${format(new Date(t.date), 'dd/MM/yy')}</td>
                                <td>${t.description}</td>
                                <td>${t.guestName || '-'}</td>
                                <td>${t.roomNumber || '-'}</td>
                                <td>${t.payment_method}</td>
                                <td><span class="status-badge status-${t.status || 'completed'}">${t.status || 'OK'}</span></td>
                                <td class="amount positive">₦${t.amount.toLocaleString()}</td>
                                <td>${t.tax_amount ? `₦${t.tax_amount.toLocaleString()}` : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="6"><strong>Subtotal (${dept})</strong></td>
                            <td class="amount"><strong>₦${deptTotal.toLocaleString()}</strong></td>
                            <td><strong>₦${deptTax.toLocaleString()}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            `;
        }

        const grandTotal = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
        const grandTax = incomeTransactions.reduce((sum, t) => sum + (t.tax_amount || 0), 0);
        html += `
            <div class="grand-total">
                <strong>GRAND TOTAL:</strong> ₦${grandTotal.toLocaleString()} | 
                <strong>TOTAL VAT:</strong> ₦${grandTax.toLocaleString()}
            </div>
        `;

        return html;
    };

    // Generate Expense Report
    const generateExpensePDF = (data: Awaited<ReturnType<typeof fetchReportData>>) => {

        const expenses = data.expenses;

        // Group by category
        const categories = [...new Set(expenses.map(e => e.category))];
        let html = '<h2>Expense Report</h2>';

        for (const category of categories) {
            const categoryExpenses = expenses.filter(e => e.category === category);
            const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);

            html += `
                <h3>${category.replace(/_/g, ' ').toUpperCase()}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Vendor</th>
                            <th>Description</th>
                            <th>Recorded By</th>
                            <th>Method</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categoryExpenses.map(e => `
                            <tr>
                                <td>${format(new Date(e.date), 'dd/MM/yy')}</td>
                                <td>${e.vendor_name || '-'}</td>
                                <td>${e.description || '-'}</td>
                                <td>${e.recorded_by}</td>
                                <td>${e.payment_method || 'cash'}</td>
                                <td class="amount negative">₦${e.amount.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="5"><strong>Subtotal (${category.replace(/_/g, ' ')})</strong></td>
                            <td class="amount"><strong>₦${categoryTotal.toLocaleString()}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            `;
        }

        const grandTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
        html += `
            <div class="grand-total negative">
                <strong>TOTAL EXPENSES:</strong> ₦${grandTotal.toLocaleString()}
            </div>
        `;

        return html;
    };

    // Generate VAT Report
    const generateVATPDF = (data: Awaited<ReturnType<typeof fetchReportData>>) => {
        const taxableTransactions = data.transactions.filter(t => t.is_taxable && t.tax_amount);

        const departments = ['accommodation', 'restaurant', 'other'] as const;
        let html = '<h2>VAT Report (Tax Compliance)</h2>';

        let grandTaxable = 0;
        let grandVAT = 0;

        for (const dept of departments) {
            const deptTransactions = taxableTransactions.filter(t => t.department === dept);
            if (deptTransactions.length === 0) continue;

            // Group by tax rate
            const rates = [...new Set(deptTransactions.map(t => t.tax_rate))];

            for (const rate of rates) {
                const rateTransactions = deptTransactions.filter(t => t.tax_rate === rate);
                const taxableAmount = rateTransactions.reduce((sum, t) => sum + t.amount, 0);
                const vatAmount = rateTransactions.reduce((sum, t) => sum + (t.tax_amount || 0), 0);

                grandTaxable += taxableAmount;
                grandVAT += vatAmount;

                html += `
                    <h3>${dept.charAt(0).toUpperCase() + dept.slice(1)} (${rate}% VAT)</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Net Revenue</th>
                                <th>VAT Rate</th>
                                <th>VAT Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rateTransactions.map(t => `
                                <tr class="${t.status === 'reversal' ? 'reversal' : t.status === 'reversed' ? 'reversed' : ''}">
                                    <td>${format(new Date(t.date), 'dd/MM/yy')}</td>
                                    <td>${t.description}</td>
                                    <td><span class="status-badge status-${t.status || 'completed'}">${t.status || 'OK'}</span></td>
                                    <td class="amount">${t.amount >= 0 ? '' : '-'}₦${Math.abs(t.amount).toLocaleString()}</td>
                                    <td>${t.tax_rate}%</td>
                                    <td class="amount">${t.tax_amount >= 0 ? '' : '-'}₦${Math.abs(t.tax_amount).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3"><strong>Subtotal</strong></td>
                                <td class="amount"><strong>₦${taxableAmount.toLocaleString()}</strong></td>
                                <td></td>
                                <td class="amount"><strong>₦${vatAmount.toLocaleString()}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                `;
            }
        }

        html += `
            <div class="grand-total">
                <table class="summary-table">
                    <tr><td><strong>Total Net Revenue:</strong></td><td class="amount">₦${grandTaxable.toLocaleString()}</td></tr>
                    <tr><td><strong>Total VAT Collected:</strong></td><td class="amount">₦${grandVAT.toLocaleString()}</td></tr>
                    <tr><td><strong>Total Gross (incl. VAT):</strong></td><td class="amount">₦${(grandTaxable + grandVAT).toLocaleString()}</td></tr>
                </table>
            </div>
        `;

        return html;
    };

    const exportToPDF = async () => {
        setIsExporting(true);
        try {
            const data = await fetchReportData();

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                toast.warn('Popups blocked', 'Please allow popups in your browser for PDF export.');
                return;
            }

            let reportContent = '';
            switch (reportType) {
                case 'ledger':
                    reportContent = generateLedgerPDF(data);
                    break;
                case 'income':
                    reportContent = generateIncomePDF(data);
                    break;
                case 'expense':
                    reportContent = generateExpensePDF(data);
                    break;
                case 'vat':
                    reportContent = generateVATPDF(data);
                    break;
            }

            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${reportTypes.find(r => r.value === reportType)?.label} - ${data.hotelName}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
        h1 { color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; font-size: 18px; }
        h2 { color: #334155; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
        h3 { color: #475569; margin-top: 15px; font-size: 12px; background: #f1f5f9; padding: 8px; border-radius: 4px; }
        .subtitle { color: #64748b; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px; }
        th { background: #1e293b; color: white; padding: 8px 6px; text-align: left; font-weight: 600; }
        td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
        tr:hover { background: #f8fafc; }
        tfoot td { background: #f1f5f9; font-weight: bold; }
        .amount { text-align: right; font-family: monospace; }
        .positive { color: #16a34a; }
        .negative { color: #dc2626; }
        .reversed { opacity: 0.5; text-decoration: line-through; }
        .reversal { background: #fef3c7; }
        .status-badge { padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; }
        .status-completed { background: #dcfce7; color: #16a34a; }
        .status-reversed { background: #e2e8f0; color: #64748b; }
        .status-reversal { background: #fef3c7; color: #d97706; }
        .grand-total { margin-top: 20px; padding: 15px; background: #1e293b; color: white; border-radius: 8px; text-align: right; font-size: 14px; }
        .grand-total.negative { background: #dc2626; }
        .summary-table { width: auto; margin-left: auto; }
        .summary-table td { border: none; padding: 5px 10px; color: white; }
        @media print { 
            .no-print { display: none; } 
            body { padding: 0; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <h1>${data.hotelName} - ${reportTypes.find(r => r.value === reportType)?.label}</h1>
    <p><strong>Period:</strong> ${format(data.period.start, 'dd MMM yyyy')} to ${format(data.period.end, 'dd MMM yyyy')}</p>
    <p><strong>Generated:</strong> ${format(new Date(), 'dd MMM yyyy HH:mm')}</p>
    
    ${reportContent}

    <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">Print / Save as PDF</button>
</body>
</html>`;

            printWindow.document.write(html);
            printWindow.document.close();
        } catch (err) {
            toast.error('PDF export failed', err);
        } finally {
            setIsExporting(false);
        }
    };

    const exportToExcel = async () => {
        setIsExporting(true);
        try {
            const data = await fetchReportData();
            const lines: string[] = [];

            lines.push(`${data.hotelName} - ${reportTypes.find(r => r.value === reportType)?.label}`);
            lines.push(`Period: ${format(data.period.start, 'yyyy-MM-dd')} to ${format(data.period.end, 'yyyy-MM-dd')}`);
            lines.push(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`);
            lines.push('');

            if (reportType === 'ledger') {
                lines.push('TRANSACTION LEDGER');
                lines.push('ID,Date,Time,Type,Status,Department,Description,Payment Method,Amount,VAT');
                data.transactions.forEach(t => {
                    lines.push([
                        t.id.slice(0, 8),
                        format(new Date(t.date), 'yyyy-MM-dd'),
                        format(new Date(t.date), 'HH:mm'),
                        t.type,
                        t.status || 'completed',
                        t.department,
                        `"${t.description.replace(/"/g, '""')}"`,
                        t.payment_method,
                        t.gross_amount,
                        t.tax_amount,
                    ].join(','));
                });
            } else if (reportType === 'income') {
                lines.push('INCOME REPORT');
                lines.push('Date,Department,Description,Guest,Room,Payment Method,Status,Amount,VAT');
                data.transactions.filter(t => t.type === 'income').forEach(t => {
                    lines.push([
                        format(new Date(t.date), 'yyyy-MM-dd'),
                        t.department,
                        `"${t.description.replace(/"/g, '""')}"`,
                        t.guestName || '',
                        t.roomNumber || '',
                        t.payment_method,
                        t.status || 'completed',
                        t.amount,
                        t.tax_amount || 0,
                    ].join(','));
                });
            } else if (reportType === 'expense') {
                lines.push('EXPENSE REPORT');
                lines.push('Date,Category,Vendor,Description,Recorded By,Payment Method,Amount');
                data.expenses.forEach(e => {
                    lines.push([
                        format(new Date(e.date), 'yyyy-MM-dd'),
                        e.category,
                        e.vendor_name || '',
                        `"${(e.description || '').replace(/"/g, '""')}"`,
                        e.recorded_by,
                        e.payment_method || 'cash',
                        e.amount,
                    ].join(','));
                });
            } else if (reportType === 'vat') {
                lines.push('VAT REPORT');
                lines.push('Date,Department,Description,Status,Net Revenue,VAT Rate,VAT Amount');
                data.transactions.filter(t => t.is_taxable && t.tax_amount > 0).forEach(t => {
                    lines.push([
                        format(new Date(t.date), 'yyyy-MM-dd'),
                        t.department,
                        `"${t.description.replace(/"/g, '""')}"`,
                        t.status || 'completed',
                        t.amount,
                        t.tax_rate || 0,
                        t.tax_amount || 0,
                    ].join(','));
                });
            }

            const csvContent = lines.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${reportType}_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            toast.error('Excel export failed', err);
        } finally {
            setIsExporting(false);
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
                                    : 'bg-slate-800 border border-slate-700 hover:border-slate-600'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon size={16} className={reportType === type.value ? 'text-primary-400' : 'text-slate-400'} />
                                    <span className={`font-medium ${reportType === type.value ? 'text-white' : 'text-slate-300'}`}>
                                        {type.label}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500">{type.description}</p>
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
                                ? 'bg-primary-500 text-white'
                                : 'bg-slate-700/50 text-slate-400 hover:text-white'
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
                    <button
                        onClick={exportToPDF}
                        disabled={isExporting}
                        className="btn btn-secondary flex items-center justify-center gap-2"
                    >
                        {isExporting ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <FileText size={18} />
                        )}
                        PDF Report
                    </button>
                    <button
                        onClick={exportToExcel}
                        disabled={isExporting}
                        className="btn btn-primary flex items-center justify-center gap-2"
                    >
                        {isExporting ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <FileSpreadsheet size={18} />
                        )}
                        Excel (CSV)
                    </button>
                </div>
            </div>
        </div>
    );
}
