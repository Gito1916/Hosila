import { useRef, useEffect, useState } from 'react';
import { getHotel } from '@/db/settings';
import type { Hotel, Service } from '@/types';
import { format } from 'date-fns';
import { Printer, X, FileText, CheckCircle } from 'lucide-react';

// Define CartItem locally to avoid circular import
interface CartItem {
    service: Service;
    quantity: number;
    notes?: string;
}

// =============================================================================
// UNIFIED 80MM THERMAL PRINTER CSS
// =============================================================================

const THERMAL_PRINT_CSS = `
    @page { 
        size: 80mm auto; 
        margin: 0; 
    }
    * { 
        box-sizing: border-box; 
    }
    body { 
        font-family: 'Courier New', Courier, 'Lucida Console', Monaco, monospace;
        font-size: 12px;
        line-height: 1.4;
        padding: 10px;
        max-width: 80mm;
        margin: 0 auto;
        color: #000;
        background: #fff;
    }
    .header { 
        text-align: center; 
        margin-bottom: 10px; 
    }
    .hotel-name { 
        font-size: 16px; 
        font-weight: bold; 
        text-transform: uppercase;
        margin-bottom: 2px;
    }
    .hotel-info { 
        font-size: 10px; 
        color: #333;
        margin-bottom: 2px;
    }
    .divider { 
        border: none; 
        border-top: 1px dashed #000; 
        margin: 8px 0; 
    }
    .title { 
        text-align: center; 
        font-weight: bold; 
        font-size: 14px;
        margin: 8px 0;
    }
    .meta { 
        font-size: 11px; 
        margin-bottom: 8px; 
    }
    .meta-row { 
        display: flex; 
        justify-content: space-between;
        margin-bottom: 2px;
    }
    .items-table { 
        width: 100%; 
        font-size: 11px; 
        border-collapse: collapse; 
    }
    .items-table th { 
        text-align: left; 
        border-bottom: 1px dashed #000; 
        padding: 4px 0;
        font-weight: bold;
    }
    .items-table td { 
        padding: 3px 0; 
        vertical-align: top;
    }
    .items-table .qty { 
        text-align: center; 
        width: 40px; 
    }
    .items-table .amt { 
        text-align: right; 
        width: 70px; 
    }
    .totals { 
        margin-top: 8px; 
        font-size: 11px; 
    }
    .totals-row { 
        display: flex; 
        justify-content: space-between;
        margin-bottom: 2px;
    }
    .totals-row.total { 
        font-weight: bold; 
        font-size: 13px;
        margin-top: 4px;
    }
    .footer { 
        text-align: center; 
        font-size: 10px; 
        margin-top: 15px;
        padding-top: 8px;
        border-top: 1px dashed #000;
    }
    .footer p { 
        margin: 2px 0; 
    }
    @media print { 
        body { 
            padding: 5px; 
        } 
    }
`;

// =============================================================================
// RESTAURANT INVOICE VIEW (Pre-payment Bill) - 80mm Thermal Style
// =============================================================================

interface RestaurantInvoiceProps {
    cart: CartItem[];
    subtotal: number;
    scAmount: number;
    vatAmount: number;
    tdlAmount: number;
    total: number;
    mode: 'room_tab' | 'walk_in';
    customerName?: string;
    roomDetails?: string;
    onClose: () => void;
    isSidebar?: boolean;
}

export function RestaurantInvoiceView({
    cart,
    subtotal,
    scAmount,
    vatAmount,
    tdlAmount,
    total,
    mode,
    customerName,
    roomDetails,
    onClose,
    isSidebar: _isSidebar = false
}: RestaurantInvoiceProps) {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getHotel().then(h => setHotel(h ?? null));
    }, []);

    const handlePrint = () => {
        const content = printRef.current;
        if (!content) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Invoice</title>
                <style>${THERMAL_PRINT_CSS}</style>
            </head>
            <body>
                ${content.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    // Generate invoice number for display
    const invoiceNum = `HF-INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-sm my-4 flex flex-col shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-surface-base/50">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-blue-400" />
                        <h2 className="text-lg font-bold text-heading">Invoice Preview</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint} className="btn btn-secondary text-sm">
                            <Printer size={16} className="mr-1" /> Print
                        </button>
                        <button onClick={onClose} className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Invoice Content - 80mm Thermal Style */}
                <div className="p-4 bg-surface-card overflow-y-auto max-h-[75vh]">
                    <div
                        ref={printRef}
                        className="bg-surface-card text-black p-5 mx-auto shadow-md"
                        style={{
                            maxWidth: '300px',
                            fontFamily: "'Courier New', Courier, 'Lucida Console', Monaco, monospace",
                            fontSize: '12px'
                        }}
                    >
                        {/* Header */}
                        <div className="text-center mb-3">
                            {hotel?.logo_url && (
                                <img
                                    src={hotel.logo_url}
                                    alt="Logo"
                                    className="w-16 h-16 object-contain mx-auto mb-2"
                                />
                            )}
                            <div className="font-bold text-base uppercase">{hotel?.name ?? 'HOTEL'}</div>
                            <div className="text-[10px] text-body">{hotel?.address}</div>
                            <div className="text-[10px] text-body">Tel: {hotel?.phone}</div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Invoice Title */}
                        <div className="text-center font-bold text-sm my-2">INVOICE</div>
                        <div className="text-[11px] space-y-0.5 mb-3">
                            <div className="flex justify-between">
                                <span>Invoice No:</span>
                                <span className="font-mono">{invoiceNum}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Date:</span>
                                <span className="font-mono">{format(new Date(), 'dd MMM yyyy HH:mm')}</span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Customer Info */}
                        <div className="text-[11px] mb-3">
                            <div className="text-body mb-1">Customer:</div>
                            <div className="font-medium">
                                {mode === 'room_tab'
                                    ? (roomDetails || 'Room Guest')
                                    : (customerName || 'Walk-in Guest')
                                }
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Items Table */}
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-dashed border-black">
                                    <th className="text-left py-1 font-bold">ITEM</th>
                                    <th className="text-center py-1 font-bold w-10">QTY</th>
                                    <th className="text-right py-1 font-bold w-16">AMT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cart.map((item, i) => (
                                    <tr key={i}>
                                        <td className="py-1 pr-1">{item.service.name}</td>
                                        <td className="py-1 text-center">{item.quantity}</td>
                                        <td className="py-1 text-right">{(item.service.price * item.quantity).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Totals */}
                        <div className="text-[11px] space-y-1">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span>{subtotal.toLocaleString()}</span>
                            </div>
                            {scAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>Service Charge</span>
                                    <span>{scAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {vatAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>VAT</span>
                                    <span>{vatAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {tdlAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>TDL</span>
                                    <span>{tdlAmount.toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Total */}
                        <div className="text-[12px] font-bold flex justify-between">
                            <span>TOTAL</span>
                            <span>₦{total.toLocaleString()}</span>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Footer */}
                        <div className="text-center text-[10px] text-muted mt-4 pt-2 border-t border-dashed border-border-strong">
                            <p className="font-medium">Payment due before service</p>
                            <p className="mt-3">Powered by HotelFlow PMS</p>
                        </div>

                        {/* Bottom Divider */}
                        <div className="border-t border-dashed border-black mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// RESTAURANT RECEIPT VIEW (Post-payment) - 80mm Thermal Style
// =============================================================================

interface RestaurantReceiptProps {
    items: {
        name: string;
        quantity: number;
        price: number;
        total: number;
    }[];
    totalInfo: {
        subtotal: number;
        scAmount: number;
        vatAmount: number;
        tdlAmount: number;
        total: number;
    };
    paymentInfo?: {
        method: string;
        amount: number;
        date: Date;
    };
    customerInfo?: string;
    receiptNumber?: string;
    onClose: () => void;
    isSidebar?: boolean;
}

export function RestaurantReceiptView({
    items,
    totalInfo,
    paymentInfo,
    customerInfo,
    receiptNumber,
    onClose,
    isSidebar: _isSidebar = false
}: RestaurantReceiptProps) {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getHotel().then(h => setHotel(h ?? null));
    }, []);

    const handlePrint = () => {
        const content = printRef.current;
        if (!content) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt ${receiptNumber || ''}</title>
                <style>${THERMAL_PRINT_CSS}</style>
            </head>
            <body>
                ${content.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-sm my-4 flex flex-col shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-surface-base/50">
                    <div className="flex items-center gap-2">
                        <CheckCircle size={20} className="text-green-400" />
                        <h2 className="text-lg font-bold text-heading">Receipt</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint} className="btn btn-secondary text-sm">
                            <Printer size={16} className="mr-1" /> Print
                        </button>
                        <button onClick={onClose} className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Receipt Content - 80mm Thermal Style */}
                <div className="p-4 bg-surface-card overflow-y-auto max-h-[75vh]">
                    <div
                        ref={printRef}
                        className="bg-surface-card text-black p-5 mx-auto shadow-md"
                        style={{
                            maxWidth: '300px',
                            fontFamily: "'Courier New', Courier, 'Lucida Console', Monaco, monospace",
                            fontSize: '12px'
                        }}
                    >
                        {/* Header */}
                        <div className="text-center mb-3">
                            {hotel?.logo_url && (
                                <img
                                    src={hotel.logo_url}
                                    alt="Logo"
                                    className="w-16 h-16 object-contain mx-auto mb-2"
                                />
                            )}
                            <div className="font-bold text-base uppercase">{hotel?.name ?? 'HOTEL'}</div>
                            <div className="text-[10px] text-body">{hotel?.address}</div>
                            <div className="text-[10px] text-body">Tel: {hotel?.phone}</div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Receipt Title */}
                        <div className="text-center font-bold text-sm my-2">RECEIPT</div>
                        <div className="text-[11px] space-y-0.5 mb-3">
                            <div className="flex justify-between">
                                <span>Receipt No:</span>
                                <span className="font-mono">{receiptNumber || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Date:</span>
                                <span className="font-mono">
                                    {paymentInfo
                                        ? format(new Date(paymentInfo.date), 'dd MMM yyyy HH:mm')
                                        : format(new Date(), 'dd MMM yyyy HH:mm')
                                    }
                                </span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Customer Info */}
                        <div className="text-[11px] mb-3">
                            <div className="text-body mb-1">Customer:</div>
                            <div className="font-medium">{customerInfo || 'Walk-in Guest'}</div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Items Table */}
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-dashed border-black">
                                    <th className="text-left py-1 font-bold">ITEM</th>
                                    <th className="text-center py-1 font-bold w-10">QTY</th>
                                    <th className="text-right py-1 font-bold w-16">AMT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, i) => (
                                    <tr key={i}>
                                        <td className="py-1 pr-1">{item.name}</td>
                                        <td className="py-1 text-center">{item.quantity}</td>
                                        <td className="py-1 text-right">{item.total.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Totals */}
                        <div className="text-[11px] space-y-1">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span>{totalInfo.subtotal.toLocaleString()}</span>
                            </div>
                            {totalInfo.scAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>Service Charge</span>
                                    <span>{totalInfo.scAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {totalInfo.vatAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>VAT</span>
                                    <span>{totalInfo.vatAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {totalInfo.tdlAmount > 0 && (
                                <div className="flex justify-between">
                                    <span>TDL</span>
                                    <span>{totalInfo.tdlAmount.toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Total */}
                        <div className="text-[12px] font-bold flex justify-between">
                            <span>TOTAL</span>
                            <span>₦{totalInfo.total.toLocaleString()}</span>
                        </div>

                        {/* Payment Info */}
                        {paymentInfo && (
                            <>
                                <div className="text-[11px] mt-2 space-y-0.5">
                                    <div className="flex justify-between text-green-700">
                                        <span>Paid ({paymentInfo.method})</span>
                                        <span>{paymentInfo.amount.toLocaleString()}</span>
                                    </div>
                                    {paymentInfo.amount > totalInfo.total && (
                                        <div className="flex justify-between">
                                            <span>Change</span>
                                            <span>{(paymentInfo.amount - totalInfo.total).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Footer */}
                        <div className="text-center text-[10px] text-muted mt-4 pt-2 border-t border-dashed border-border-strong">
                            <p className="font-medium">Thank you for your patronage</p>
                            <p>No refund after payment</p>
                            <p className="mt-3">Powered by HotelFlow PMS</p>
                        </div>

                        {/* Bottom Divider */}
                        <div className="border-t border-dashed border-black mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
