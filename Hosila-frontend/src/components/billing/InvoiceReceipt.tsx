import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { getHotel } from '@/db/settings';
import type { Invoice, Receipt, Hotel } from '@/types';
import { X, Printer, FileText, CheckCircle } from 'lucide-react';
import { requireSupabase, getHotelId } from '@/lib/api';

// =============================================================================
// UNIFIED 80MM THERMAL PRINTER STYLES
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
    .tax-section {
        font-size: 10px;
        padding: 4px 0;
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
// INVOICE VIEW COMPONENT (80mm Thermal Style)
// =============================================================================

interface InvoiceViewProps {
    invoice: Invoice;
    onClose: () => void;
    onPaymentClick?: () => void;
}

export function InvoiceView({ invoice, onClose, onPaymentClick }: InvoiceViewProps) {
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
                <title>Invoice ${invoice.invoice_number}</title>
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

    // Calculate tax breakdown if available
    const accommodationItems = invoice.items.filter(i =>
        i.description.toLowerCase().includes('room') ||
        i.description.toLowerCase().includes('accommodation')
    );
    const serviceItems = invoice.items.filter(i =>
        !i.description.toLowerCase().includes('room') &&
        !i.description.toLowerCase().includes('accommodation')
    );

    const accommodationTotal = accommodationItems.reduce((sum, i) => sum + i.total, 0);
    const servicesTotal = serviceItems.reduce((sum, i) => sum + i.total, 0);

    // Assume 7.5% for accommodation and 5% for services if not specified
    const accommodationTax = Math.round(accommodationTotal * 0.075 * 100) / 100;
    const serviceTax = Math.round(servicesTotal * 0.05 * 100) / 100;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm my-4 flex flex-col shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900/50">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-blue-400" />
                        <h2 className="text-lg font-bold text-white">Invoice</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint} className="btn btn-secondary text-sm">
                            <Printer size={16} className="mr-1" /> Print
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Invoice Content - 80mm Thermal Style */}
                <div className="p-4 bg-slate-800 overflow-y-auto max-h-[75vh]">
                    <div
                        ref={printRef}
                        className="bg-white text-black p-5 mx-auto shadow-md"
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
                            <div className="text-[10px] text-gray-600">{hotel?.address}</div>
                            <div className="text-[10px] text-gray-600">Tel: {hotel?.phone}</div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Invoice Title */}
                        <div className="text-center font-bold text-sm my-2">INVOICE</div>
                        <div className="text-[11px] space-y-0.5 mb-3">
                            <div className="flex justify-between">
                                <span>Invoice No:</span>
                                <span className="font-mono">{invoice.invoice_number}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Date:</span>
                                <span className="font-mono">{format(new Date(invoice.created_at), 'dd MMM yyyy HH:mm')}</span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Guest Info */}
                        <div className="text-[11px] mb-3">
                            <div className="text-gray-600 mb-1">Guest:</div>
                            <div className="font-medium">{invoice.guest_name}</div>
                            {invoice.guest_phone && <div>{invoice.guest_phone}</div>}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Items Table */}
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-dashed border-black">
                                    <th className="text-left py-1 font-bold">DESCRIPTION</th>
                                    <th className="text-center py-1 font-bold w-10">QTY</th>
                                    <th className="text-right py-1 font-bold w-16">AMT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.items.map((item, i) => (
                                    <tr key={i}>
                                        <td className="py-1 pr-1">{item.description}</td>
                                        <td className="py-1 text-center">{item.quantity}</td>
                                        <td className="py-1 text-right">{item.total.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Subtotal */}
                        <div className="text-[11px] space-y-1">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span>{invoice.subtotal.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Tax Breakdown */}
                        <div className="text-[10px] space-y-0.5">
                            <div className="text-gray-600 font-medium">TAX BREAKDOWN</div>
                            {accommodationTax > 0 && (
                                <div className="flex justify-between">
                                    <span>Accommodation Tax (7.5%)</span>
                                    <span>{accommodationTax.toLocaleString()}</span>
                                </div>
                            )}
                            {serviceTax > 0 && (
                                <div className="flex justify-between">
                                    <span>Service Tax (5%)</span>
                                    <span>{serviceTax.toLocaleString()}</span>
                                </div>
                            )}
                            {invoice.tax > 0 && accommodationTax === 0 && serviceTax === 0 && (
                                <div className="flex justify-between">
                                    <span>VAT</span>
                                    <span>{invoice.tax.toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Total */}
                        <div className="text-[12px] font-bold flex justify-between">
                            <span>TOTAL</span>
                            <span>₦{invoice.total.toLocaleString()}</span>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Footer */}
                        <div className="text-center text-[10px] text-gray-500 mt-4 pt-2 border-t border-dashed border-gray-300">
                            <p className="font-medium">Payment due on checkout</p>
                            <p className="mt-3">Powered by HotelFlow PMS</p>
                        </div>

                        {/* Bottom Divider */}
                        <div className="border-t border-dashed border-black mt-3"></div>
                    </div>
                </div>

                {/* Action Buttons */}
                {invoice.status !== 'paid' && onPaymentClick && (
                    <div className="p-4 border-t border-slate-700">
                        <button onClick={onPaymentClick} className="btn btn-primary w-full">
                            <CheckCircle size={18} className="mr-2" />
                            Record Payment
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// RECEIPT VIEW COMPONENT (80mm Thermal Style)
// =============================================================================

interface ReceiptViewProps {
    receipt: Receipt;
    onClose: () => void;
}

export function ReceiptView({ receipt, onClose }: ReceiptViewProps) {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [bookingDetails, setBookingDetails] = useState<{
        room: { room_number: string; room_type: string };
        booking: { rate: number; booking_type: string; check_in_time: Date; check_out_time: Date };
        serviceOrders: { name: string; quantity: number; total: number }[];
    } | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getHotel().then(h => setHotel(h ?? null));
    }, []);

    // Fetch booking details if booking_id exists
    useEffect(() => {
        async function fetchBookingDetails() {
            if (!receipt.booking_id) return;

            try {
                const booking = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('bookings').select('*').eq('id', receipt.booking_id).single(); return data; })();
                if (!booking) return;

                const room = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', booking.room_id).single(); return data; })();
                if (!room) return;

                // Get service orders for this booking
                const serviceOrders = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('service_orders').select('*').eq('hotel_id', hotelId).eq('booking_id', receipt.booking_id); return data ?? []; })();

                // Get services and inventory items for names
                const services = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('services').select('*').eq('hotel_id', hotelId); return data ?? []; })();
                const inventoryItems = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('inventory_items').select('*').eq('hotel_id', hotelId); return data ?? []; })();

                // Combined lookup for services, beverages, and extensions
                const serviceMap = new Map<string, { name: string }>([
                    ...services.map(s => [s.id, { name: s.name }] as [string, { name: string }]),
                    ...inventoryItems.map(i => [`inv_${i.id}`, { name: i.name }] as [string, { name: string }]),
                    ['extension', { name: 'Room Stay Extension' }], // Special entry for stay extensions
                ]);

                const mappedOrders = serviceOrders.map(order => ({
                    name: order.service_id === 'extension' && order.notes ? order.notes : serviceMap.get(order.service_id)?.name ?? 'Service',
                    quantity: order.quantity,
                    total: order.total_price,
                }));

                setBookingDetails({
                    room: { room_number: room.room_number, room_type: room.room_type },
                    booking: {
                        rate: booking.rate,
                        booking_type: booking.booking_type,
                        check_in_time: booking.check_in_time,
                        check_out_time: booking.check_out_time ?? booking.planned_checkout,
                    },
                    serviceOrders: mappedOrders,
                });
            } catch (err) {
                console.error('Error fetching booking details:', err);
            }
        }

        fetchBookingDetails();
    }, [receipt.booking_id]);

    const handlePrint = () => {
        const content = printRef.current;
        if (!content) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt ${receipt.receipt_number}</title>
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

    const paymentMethodLabels: Record<string, string> = {
        cash: 'Cash',
        transfer: 'Bank Transfer',
        pos: 'POS',
    };

    // Calculate totals if we have booking details
    const roomCharge = bookingDetails?.booking.rate ?? 0;
    const servicesTotal = bookingDetails?.serviceOrders.reduce((sum, o) => sum + o.total, 0) ?? 0;
    const subtotal = roomCharge + servicesTotal;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm my-4 flex flex-col shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900/50">
                    <div className="flex items-center gap-2">
                        <CheckCircle size={20} className="text-green-400" />
                        <h2 className="text-lg font-bold text-white">Receipt</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint} className="btn btn-secondary text-sm">
                            <Printer size={16} className="mr-1" /> Print
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Receipt Content - 80mm Thermal Style */}
                <div className="p-4 bg-slate-800 overflow-y-auto max-h-[75vh]">
                    <div
                        ref={printRef}
                        className="bg-white text-black p-5 mx-auto shadow-md"
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
                            <div className="text-[10px] text-gray-600">{hotel?.address}</div>
                            <div className="text-[10px] text-gray-600">Tel: {hotel?.phone}</div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Receipt Title */}
                        <div className="text-center font-bold text-sm my-2">RECEIPT</div>
                        <div className="text-[11px] space-y-0.5 mb-3">
                            <div className="flex justify-between">
                                <span>Receipt No:</span>
                                <span className="font-mono">{receipt.receipt_number}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Date:</span>
                                <span className="font-mono">{format(new Date(receipt.created_at), 'dd MMM yyyy HH:mm')}</span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Customer Info */}
                        <div className="text-[11px] mb-3">
                            <div className="text-gray-600 mb-1">Customer:</div>
                            <div className="font-medium">{receipt.guest_name}</div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Itemized Charges (if booking details available) */}
                        {bookingDetails ? (
                            <>
                                {/* Room Info */}
                                <div className="text-[11px] mb-2">
                                    <div className="text-gray-600 mb-1">Room {bookingDetails.room.room_number} - {bookingDetails.room.room_type}</div>
                                    <div className="text-[10px] text-gray-500">
                                        {format(new Date(bookingDetails.booking.check_in_time), 'dd MMM HH:mm')} - {format(new Date(bookingDetails.booking.check_out_time), 'dd MMM HH:mm')}
                                    </div>
                                </div>

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
                                        {/* Room Charge */}
                                        <tr>
                                            <td className="py-1 pr-1">
                                                Room ({bookingDetails.booking.booking_type === 'short_rest' ? 'Short Rest' : 'Night Stay'})
                                            </td>
                                            <td className="py-1 text-center">1</td>
                                            <td className="py-1 text-right">{roomCharge.toLocaleString()}</td>
                                        </tr>
                                        {/* Service Orders */}
                                        {bookingDetails.serviceOrders.map((order, i) => (
                                            <tr key={i}>
                                                <td className="py-1 pr-1">{order.name}</td>
                                                <td className="py-1 text-center">{order.quantity}</td>
                                                <td className="py-1 text-right">{order.total.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Divider */}
                                <div className="border-t border-dashed border-black my-2"></div>

                                {/* Subtotal */}
                                <div className="text-[11px] space-y-1">
                                    <div className="flex justify-between">
                                        <span>Subtotal</span>
                                        <span>{subtotal.toLocaleString()}</span>
                                    </div>
                                    {receipt.amount_paid > subtotal && (
                                        <div className="flex justify-between text-[10px] text-gray-600">
                                            <span>Includes Tax</span>
                                            <span>{(receipt.amount_paid - subtotal).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="border-t border-dashed border-black my-2"></div>
                            </>
                        ) : (
                            /* No booking details - simple receipt */
                            <div className="text-[11px] text-gray-600 mb-2">
                                Payment for services
                            </div>
                        )}

                        {/* Payment Total */}
                        <div className="text-[11px] space-y-1">
                            <div className="flex justify-between font-bold text-sm">
                                <span>Amount Paid</span>
                                <span>₦{receipt.amount_paid.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-600">
                                <span>Payment Method:</span>
                                <span>{paymentMethodLabels[receipt.payment_method] ?? receipt.payment_method}</span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-black my-2"></div>

                        {/* Footer */}
                        <div className="text-center text-[10px] text-gray-500 mt-4 pt-2 border-t border-dashed border-gray-300">
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
