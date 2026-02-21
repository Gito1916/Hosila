import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { Booking, Room, Guest } from '@/types';
import { requireSupabase, getHotelId } from '@/lib/api';
import { toast } from '@/lib/errorMessages';
import {
    X,
    Printer,
    FileText,
    Check,
    Clock,
} from 'lucide-react';

interface ReceiptModalProps {
    bookingId: string;
    onClose: () => void;
}

interface ServiceOrderDetail {
    serviceName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    status: string;
}

export function ReceiptModal({ bookingId, onClose }: ReceiptModalProps) {
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState<Booking | null>(null);
    const [room, setRoom] = useState<Room | null>(null);
    const [guest, setGuest] = useState<Guest | null>(null);
    const [serviceOrders, setServiceOrders] = useState<ServiceOrderDetail[]>([]);
    const [payments, setPayments] = useState<{ amount: number; method: string; time: Date }[]>([]);
    const [hotelName, setHotelName] = useState('Hotel');
    const [taxRates, setTaxRates] = useState({ accommodation: 0, services: 0 });

    useEffect(() => {
        loadData();
    }, [bookingId]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load booking
            const b = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('bookings').select('*').eq('id', bookingId).single(); return data; })();
            if (!b) return;
            setBooking(b);

            // Load room
            const r = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('rooms').select('*').eq('id', b.room_id).single(); return data; })();
            setRoom(r ?? null);

            // Load guest
            const g = await (async () => { const sb = requireSupabase(); const { data } = await sb.from('guests').select('*').eq('id', b.guest_id).single(); return data; })();
            setGuest(g ?? null);

            // Load hotel info
            const hotel = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('hotels').select('*').eq('id', hotelId).single(); return data; })();
            setHotelName(hotel?.name ?? 'Hotel');
            setTaxRates({
                accommodation: hotel?.settings?.accommodation_tax_rate ?? hotel?.settings?.tax_rate ?? 0,
                services: hotel?.settings?.services_tax_rate ?? hotel?.settings?.tax_rate ?? 0,
            });

            // Load service orders with names
            const orders = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('service_orders').select('*').eq('hotel_id', hotelId).eq('booking_id', bookingId); return data ?? []; })();
            const services = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('services').select('*').eq('hotel_id', hotelId); return data ?? []; })();
            const inventoryItems = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('inventory_items').select('*').eq('hotel_id', hotelId); return data ?? []; })();

            // Combined lookup for services and beverages (inv_ prefixed IDs)
            const serviceMap = new Map<string, string>([
                ...services.map(s => [s.id, s.name] as [string, string]),
                ...inventoryItems.map(i => [`inv_${i.id}`, i.name] as [string, string]),
                ['extension', 'Room Stay Extension'], // Special entry for stay extensions
            ]);

            setServiceOrders(
                orders.map(o => ({
                    serviceName: o.service_id === 'extension' && o.notes ? o.notes : serviceMap.get(o.service_id) ?? 'Service',
                    quantity: o.quantity,
                    unitPrice: o.unit_price,
                    total: o.total_price,
                    status: o.status,
                }))
            );

            // Load payments
            const pays = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('payments').select('*').eq('hotel_id', hotelId).eq('booking_id', bookingId); return data ?? []; })();
            setPayments(
                pays.map(p => ({
                    amount: p.amount,
                    method: p.payment_method,
                    time: new Date(p.payment_time),
                }))
            );
        } catch (err) {
            toast.error('Failed to load receipt', err);
        } finally {
            setLoading(false);
        }
    };

    const printReceipt = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.warn('Popups blocked', 'Please allow popups in your browser for printing.');
            return;
        }

        const accommodationSubtotal = booking?.rate ?? 0;
        const servicesSubtotal = serviceOrders.reduce((sum, o) => sum + o.total, 0);
        const accommodationTax = accommodationSubtotal * (taxRates.accommodation / 100);
        const servicesTax = servicesSubtotal * (taxRates.services / 100);
        const subtotal = accommodationSubtotal + servicesSubtotal;
        const totalTax = accommodationTax + servicesTax;
        const total = subtotal + totalTax;
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balance = total - totalPaid;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Receipt - ${guest?.name ?? 'Guest'}</title>
    <style>
        body { font-family: 'Courier New', monospace; padding: 20px; max-width: 400px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
        .header h1 { margin: 0; font-size: 18px; }
        .header p { margin: 2px 0; font-size: 12px; color: #666; }
        .section { margin: 15px 0; }
        .section-title { font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
        .row.item { padding-left: 10px; }
        .row.bold { font-weight: bold; }
        .row.total { font-size: 14px; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
        .row.balance { font-size: 16px; background: #f0f0f0; padding: 8px; margin: 8px -8px; }
        .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #666; border-top: 1px dashed #000; padding-top: 10px; }
        @media print { .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>${hotelName}</h1>
        <p>Receipt / Invoice</p>
        <p>${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
    </div>

    <div class="section">
        <div class="row"><span>Guest:</span><span>${guest?.name ?? 'Guest'}</span></div>
        <div class="row"><span>Room:</span><span>${room?.room_number ?? '-'} (${room?.room_type ?? '-'})</span></div>
        <div class="row"><span>Check-in:</span><span>${booking ? format(new Date(booking.check_in_time), 'MMM d, h:mm a') : '-'}</span></div>
        ${booking?.status === 'checked_out' ? `<div class="row"><span>Check-out:</span><span>${booking.check_out_time ? format(new Date(booking.check_out_time), 'MMM d, h:mm a') : '-'}</span></div>` : ''}
    </div>

    <div class="section">
        <div class="section-title">Charges</div>
        <div class="row bold">
            <span>Accommodation</span>
            <span>₦${accommodationSubtotal.toLocaleString()}</span>
        </div>
        <div class="row item">
            <span>- ${room?.room_type ?? 'Room'} ${booking?.booking_type === 'night' ? 'Night Stay' : `${booking?.duration_hours ?? 1}h Short Rest`}</span>
            <span></span>
        </div>
        ${taxRates.accommodation > 0 ? `<div class="row item"><span>- Tax (${taxRates.accommodation}%)</span><span>₦${accommodationTax.toLocaleString()}</span></div>` : ''}
        
        ${serviceOrders.length > 0 ? `
        <div class="row bold" style="margin-top: 10px;">
            <span>Services</span>
            <span>₦${servicesSubtotal.toLocaleString()}</span>
        </div>
        ${serviceOrders.map(o => `
            <div class="row item">
                <span>- ${o.serviceName} x${o.quantity}${o.status !== 'delivered' ? ' (pending)' : ''}</span>
                <span>₦${o.total.toLocaleString()}</span>
            </div>
        `).join('')}
        ${taxRates.services > 0 ? `<div class="row item"><span>- Tax (${taxRates.services}%)</span><span>₦${servicesTax.toLocaleString()}</span></div>` : ''}
        ` : ''}
    </div>

    <div class="section">
        <div class="row total">
            <span>SUBTOTAL</span>
            <span>₦${subtotal.toLocaleString()}</span>
        </div>
        ${totalTax > 0 ? `<div class="row bold"><span>TAX</span><span>₦${totalTax.toLocaleString()}</span></div>` : ''}
        <div class="row bold" style="font-size: 14px;">
            <span>TOTAL</span>
            <span>₦${total.toLocaleString()}</span>
        </div>
    </div>

    ${payments.length > 0 ? `
    <div class="section">
        <div class="section-title">Payments</div>
        ${payments.map(p => `
            <div class="row">
                <span>${format(p.time, 'MMM d, h:mm a')} - ${p.method.toUpperCase()}</span>
                <span>₦${p.amount.toLocaleString()}</span>
            </div>
        `).join('')}
        <div class="row bold">
            <span>Total Paid</span>
            <span>₦${totalPaid.toLocaleString()}</span>
        </div>
    </div>
    ` : ''}

    <div class="section">
        <div class="row balance">
            <span>BALANCE DUE</span>
            <span style="color: ${balance > 0 ? '#c00' : '#080'}">₦${balance.toLocaleString()}</span>
        </div>
    </div>

    <div class="footer">
        <p>Thank you for staying with us!</p>
        <p>${hotelName}</p>
    </div>

    <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; width: 100%;">Print Receipt</button>
</body>
</html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-slate-400">Loading receipt...</p>
                </div>
            </div>
        );
    }

    const accommodationSubtotal = booking?.rate ?? 0;
    const servicesSubtotal = serviceOrders.reduce((sum, o) => sum + o.total, 0);
    const accommodationTax = accommodationSubtotal * (taxRates.accommodation / 100);
    const servicesTax = servicesSubtotal * (taxRates.services / 100);
    const subtotal = accommodationSubtotal + servicesSubtotal;
    const totalTax = accommodationTax + servicesTax;
    const total = subtotal + totalTax;
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const balance = total - totalPaid;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-primary-400" />
                        <h2 className="text-xl font-bold text-white">Receipt</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Guest Info */}
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-white font-medium">{guest?.name}</p>
                        <p className="text-sm text-slate-400">
                            Room {room?.room_number} • {room?.room_type}
                        </p>
                        <p className="text-xs text-slate-500">
                            {booking && format(new Date(booking.check_in_time), 'MMM d, yyyy')}
                        </p>
                    </div>

                    {/* Accommodation */}
                    <div>
                        <h4 className="text-sm font-medium text-slate-400 mb-2">Accommodation</h4>
                        <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-300">
                                    {room?.room_type} - {booking?.booking_type === 'night' ? 'Night Stay' : `${booking?.duration_hours}h Short Rest`}
                                </span>
                                <span className="text-white font-medium">₦{accommodationSubtotal.toLocaleString()}</span>
                            </div>
                            {taxRates.accommodation > 0 && (
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>Tax ({taxRates.accommodation}%)</span>
                                    <span>₦{accommodationTax.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Services */}
                    {serviceOrders.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-slate-400 mb-2">Services</h4>
                            <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
                                {serviceOrders.map((order, idx) => (
                                    <div key={idx} className="flex justify-between text-sm">
                                        <span className="text-slate-300 flex items-center gap-1">
                                            {order.serviceName} x{order.quantity}
                                            {order.status !== 'delivered' && (
                                                <Clock size={12} className="text-amber-400" />
                                            )}
                                        </span>
                                        <span className="text-white font-medium">₦{order.total.toLocaleString()}</span>
                                    </div>
                                ))}
                                {taxRates.services > 0 && (
                                    <div className="flex justify-between text-xs text-slate-500 border-t border-slate-600 pt-2">
                                        <span>Tax ({taxRates.services}%)</span>
                                        <span>₦{servicesTax.toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Payments */}
                    {payments.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-slate-400 mb-2">Payments</h4>
                            <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
                                {payments.map((p, idx) => (
                                    <div key={idx} className="flex justify-between text-sm">
                                        <span className="text-slate-300 flex items-center gap-1">
                                            <Check size={12} className="text-status-available" />
                                            {format(p.time, 'MMM d')} - {p.method}
                                        </span>
                                        <span className="text-status-available font-medium">₦{p.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Totals */}
                <div className="border-t border-slate-700 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Subtotal</span>
                        <span className="text-white">₦{subtotal.toLocaleString()}</span>
                    </div>
                    {totalTax > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Tax</span>
                            <span className="text-white">₦{totalTax.toLocaleString()}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold">
                        <span className="text-white">Total</span>
                        <span className="text-white">₦{total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Paid</span>
                        <span className="text-status-available">₦{totalPaid.toLocaleString()}</span>
                    </div>
                    <div className={`flex justify-between font-bold text-lg pt-2 border-t border-slate-700 ${balance > 0 ? 'text-red-400' : 'text-status-available'}`}>
                        <span>Balance</span>
                        <span>₦{balance.toLocaleString()}</span>
                    </div>

                    <button
                        onClick={printReceipt}
                        className="btn btn-primary w-full mt-3"
                    >
                        <Printer size={16} className="mr-2" />
                        Print Receipt
                    </button>
                </div>
            </div>
        </div>
    );
}
