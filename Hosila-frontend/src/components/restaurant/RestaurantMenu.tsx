import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RestaurantCard } from './RestaurantCard';
import { RestaurantCart, type CartItem } from './RestaurantCart';
import { PendingOrders } from './PendingOrders';
import { OrderHistory } from './OrderHistory';
import type { Service, ServiceCategory } from '@/types';
import { requireSupabase, getHotelId } from '@/lib/api';
import { getHotel } from '@/db/settings';
import {
    Utensils,
    Wine,
    LayoutGrid,
    ClipboardList,
    ShoppingCart,
    History,
} from 'lucide-react';

// Only Food & Beverage categories
const categories: { value: ServiceCategory | 'all'; label: string; icon: React.ReactNode }[] = [
    { value: 'all', label: 'All', icon: <LayoutGrid size={16} /> },
    { value: 'food', label: 'Food', icon: <Utensils size={16} /> },
    { value: 'beverage', label: 'Drinks', icon: <Wine size={16} /> },
];

export function RestaurantMenu() {
    const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | 'all'>('all');
    const [viewMode, setViewMode] = useState<'menu' | 'orders' | 'history'>(() => {
        const saved = sessionStorage.getItem('restaurant-view-mode');
        return (saved === 'menu' || saved === 'orders' || saved === 'history') ? saved : 'menu';
    });
    const [showMobileCart, setShowMobileCart] = useState(false);

    // Persist view mode to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('restaurant-view-mode', viewMode);
    }, [viewMode]);

    // Cart state
    const [cart, setCart] = useState<CartItem[]>([]);

    // Get all food services (beverages come from inventory)
    const { data: foodServices } = useQuery({
        queryKey: ['services', 'food'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('services').select('*').eq('hotel_id', hotelId).eq('category', 'food').eq('is_active', true);
            return data ?? [];
        },
    });

    // Get beverages from inventory (only in stock)
    const { data: inventoryBeverages } = useQuery({
        queryKey: ['inventory_items', 'beverages'],
        queryFn: async () => {
            const sb = requireSupabase();
            const hotelId = await getHotelId();
            const { data } = await sb.from('inventory_items').select('*').eq('hotel_id', hotelId).eq('category', 'beverages').gt('current_stock', 0);
            return data ?? [];
        },
    });

    // Convert inventory beverages to Service-like objects
    const beverageServices: Service[] = (inventoryBeverages ?? []).map(item => ({
        id: `inv_${item.id}`, // Prefix to distinguish from regular services
        hotel_id: item.hotel_id,
        name: item.name,
        category: 'beverage' as const,
        description: `In stock: ${item.current_stock}`,
        price: item.selling_price || item.unit_cost, // Use selling price if set, otherwise unit cost
        is_active: true,
        uses_inventory: true,
        inventory_items: [{ item_id: item.id, quantity: 1 }],
        created_at: item.created_at,
        updated_at: item.updated_at,
    }));

    // Combine food services and beverages
    const services = [...(foodServices ?? []), ...beverageServices];

    // Filter services by category
    const filteredServices = services?.filter(s => {
        if (selectedCategory === 'all') return true;
        return s.category === selectedCategory;
    }) ?? [];

    // Group services by category for display
    const groupedServices = filteredServices.reduce((acc, service) => {
        if (!acc[service.category]) {
            acc[service.category] = [];
        }
        acc[service.category].push(service);
        return acc;
    }, {} as Record<ServiceCategory, Service[]>);

    const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: getHotel });
    const showOrdersTab = hotel?.settings?.enable_restaurant_orders !== false;

    // Cart functions
    const addToCart = (service: Service) => {
        setCart(prevCart => {
            const existingItem = prevCart.find(item => item.service.id === service.id);
            if (existingItem) {
                return prevCart.map(item =>
                    item.service.id === service.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prevCart, { service, quantity: 1 }];
        });
    };

    const updateQuantity = (serviceId: string, quantity: number) => {
        if (quantity <= 0) {
            setCart(prevCart => prevCart.filter(item => item.service.id !== serviceId));
        } else {
            setCart(prevCart =>
                prevCart.map(item =>
                    item.service.id === serviceId ? { ...item, quantity } : item
                )
            );
        }
    };

    const removeFromCart = (serviceId: string) => {
        setCart(prevCart => prevCart.filter(item => item.service.id !== serviceId));
    };

    const clearCart = () => {
        setCart([]);
    };

    const getCartQuantity = (serviceId: string): number => {
        const item = cart.find(i => i.service.id === serviceId);
        return item?.quantity ?? 0;
    };

    const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = cart.reduce((sum, item) => sum + item.service.price * item.quantity, 0);

    const handleCartSuccess = () => {
        setShowMobileCart(false);
        clearCart();
    };

    return (
        <div className="flex gap-4">
            {/* Main Menu Area */}
            <div className="flex-1 space-y-4">
                {/* View Toggle */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex rounded-lg overflow-hidden border border-border">
                        <button
                            onClick={() => setViewMode('menu')}
                            className={`px-4 py-2 flex items-center gap-2 ${viewMode === 'menu'
                                ? 'bg-primary-500 text-heading'
                                : 'bg-surface-card text-muted hover:text-heading'
                                }`}
                        >
                            <LayoutGrid size={18} />
                            Menu
                        </button>
                        {showOrdersTab && (
                            <button
                                onClick={() => setViewMode('orders')}
                                className={`px-4 py-2 flex items-center gap-2 ${viewMode === 'orders'
                                    ? 'bg-primary-500 text-heading'
                                    : 'bg-surface-card text-muted hover:text-heading'
                                    }`}
                            >
                                <ClipboardList size={18} />
                                Orders
                            </button>
                        )}
                        <button
                            onClick={() => setViewMode('history')}
                            className={`px-4 py-2 flex items-center gap-2 ${viewMode === 'history'
                                ? 'bg-primary-500 text-heading'
                                : 'bg-surface-card text-muted hover:text-heading'
                                }`}
                        >
                            <History size={18} />
                            History
                        </button>
                    </div>

                    {/* Mobile Cart Button - only visible on small screens */}
                    {viewMode === 'menu' && (
                        <button
                            onClick={() => setShowMobileCart(true)}
                            className={`lg:hidden relative px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${cartItemCount > 0
                                ? 'bg-status-available text-heading'
                                : 'bg-surface-card text-muted border border-border'
                                }`}
                        >
                            <ShoppingCart size={18} />
                            {cartItemCount > 0 && (
                                <>
                                    <span className="font-bold">₦{cartTotal.toLocaleString()}</span>
                                    <span className="absolute -top-2 -right-2 bg-primary-500 text-heading text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                                        {cartItemCount}
                                    </span>
                                </>
                            )}
                        </button>
                    )}
                </div>

                {viewMode === 'menu' ? (
                    <>
                        {/* Category Tabs */}
                        <div className="flex flex-wrap gap-2">
                            {categories.map((cat) => (
                                <button
                                    key={cat.value}
                                    onClick={() => setSelectedCategory(cat.value)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat.value
                                        ? 'bg-primary-500 text-heading'
                                        : 'bg-surface-card text-muted hover:text-heading hover:bg-surface-raised'
                                        }`}
                                >
                                    {cat.icon}
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Services Grid */}
                        {selectedCategory === 'all' ? (
                            // Show grouped by category
                            <div className="space-y-6">
                                {(Object.entries(groupedServices) as [string, Service[]][]).map(([category, services]) => (
                                    <div key={category}>
                                        <h3 className="text-lg font-semibold text-heading mb-3 capitalize">
                                            {category === 'food' ? 'Food' : 'Beverages'}
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                            {services.map((service) => (
                                                <RestaurantCard
                                                    key={service.id}
                                                    service={service}
                                                    onOrder={() => addToCart(service)}
                                                    cartQuantity={getCartQuantity(service.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Show flat list for specific category
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                {filteredServices.map((service) => (
                                    <RestaurantCard
                                        key={service.id}
                                        service={service}
                                        onOrder={() => addToCart(service)}
                                        cartQuantity={getCartQuantity(service.id)}
                                    />
                                ))}
                            </div>
                        )}

                        {filteredServices.length === 0 && (
                            <div className="text-center py-12 text-muted">
                                <Utensils size={48} className="mx-auto mb-4 opacity-50" />
                                <p>No items found in this category</p>
                            </div>
                        )}
                    </>
                ) : viewMode === 'orders' ? (
                    <PendingOrders />
                ) : (
                    <OrderHistory />
                )}
            </div>

            {/* Desktop Cart Sidebar - hidden on mobile */}
            {viewMode === 'menu' && (
                <div className="hidden lg:block w-96 shrink-0">
                    <div className="sticky top-4">
                        <RestaurantCart
                            cart={cart}
                            onUpdateQuantity={updateQuantity}
                            onRemoveItem={removeFromCart}
                            onClearCart={clearCart}
                            onSuccess={handleCartSuccess}
                            isSidebar={true}
                        />
                    </div>
                </div>
            )}

            {/* Mobile Cart Bottom Sheet */}
            {showMobileCart && (
                <div className="lg:hidden fixed inset-0 z-50">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setShowMobileCart(false)}
                    />
                    {/* Bottom Sheet */}
                    <div className="absolute bottom-0 left-0 right-0 bg-surface-card rounded-t-xl max-h-[85vh] overflow-y-auto animate-slide-up">
                        <RestaurantCart
                            cart={cart}
                            onUpdateQuantity={updateQuantity}
                            onRemoveItem={removeFromCart}
                            onClearCart={clearCart}
                            onClose={() => setShowMobileCart(false)}
                            onSuccess={handleCartSuccess}
                            isSidebar={false}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
