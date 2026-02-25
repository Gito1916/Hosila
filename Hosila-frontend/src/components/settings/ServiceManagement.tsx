import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createService, updateService, deleteService } from '@/db/services';
import { updateHotelSettings } from '@/db/settings';
import { useServices, useHotel } from '@/hooks/useSupabaseData';
import { toast } from '@/lib/errorMessages';
import type { Service, ServiceCategory } from '@/types';
import {
    Plus,
    Edit2,
    Trash2,
    UtensilsCrossed,
    X,
    Loader2,
    Save,
} from 'lucide-react';

// Only food and beverages for restaurant menu
const categoryLabels: Record<string, string> = {
    food: 'Food',
    beverage: 'Beverage',
};

export function ServiceManagement() {
    const [showForm, setShowForm] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);

    const queryClient = useQueryClient();
    const { data: services } = useServices();
    const { data: hotel } = useHotel();

    const handleEdit = (service: Service) => {
        setEditingService(service);
        setShowForm(true);
    };

    const handleDelete = async (service: Service) => {
        if (confirm(`Delete service "${service.name}"?`)) {
            try {
                await deleteService(service.id);
            } catch (err) {
                toast.error('Failed to delete service', err);
            }
        }
    };

    const toggleOrdersTab = async (enabled: boolean) => {
        if (!hotel) return;
        try {
            await updateHotelSettings({
                enable_restaurant_orders: enabled
            });
            queryClient.invalidateQueries({ queryKey: ['hotel'] });
        } catch (err) {
            toast.error('Failed to update restaurant settings', err);
        }
    };

    return (
        <div className="space-y-6">
            {/* General Settings */}
            <div className="card p-4 border border-border">
                <h3 className="font-semibold text-heading mb-4">General Settings</h3>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-heading font-medium">Enable Orders Tab</p>
                        <p className="text-sm text-muted">Show the "Orders" tab in the Restaurant section</p>
                    </div>
                    <button
                        onClick={() => toggleOrdersTab(!hotel?.settings?.enable_restaurant_orders)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${hotel?.settings?.enable_restaurant_orders ? 'bg-primary-500' : 'bg-surface-raised'
                            }`}
                    >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-surface-card rounded-full transition-transform ${hotel?.settings?.enable_restaurant_orders ? 'translate-x-6' : ''
                            }`} />
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h3 className="font-semibold text-heading flex items-center gap-2">
                        <UtensilsCrossed size={18} />
                        Restaurant Menu Management
                    </h3>
                    <button
                        onClick={() => { setEditingService(null); setShowForm(true); }}
                        className="btn btn-primary text-sm"
                    >
                        <Plus size={16} className="mr-1" />
                        Add Item
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-surface-raised/50">
                            <tr>
                                <th className="text-left p-3 text-muted text-sm font-medium">Name</th>
                                <th className="text-left p-3 text-muted text-sm font-medium">Category</th>
                                <th className="text-left p-3 text-muted text-sm font-medium">Price</th>
                                <th className="text-left p-3 text-muted text-sm font-medium">Status</th>
                                <th className="text-right p-3 text-muted text-sm font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {services?.map((service) => (
                                <tr key={service.id} className="hover:bg-surface-raised/30">
                                    <td className="p-3">
                                        <div className="text-heading font-medium">{service.name}</div>
                                        {service.description && (
                                            <div className="text-xs text-muted mt-0.5">{service.description}</div>
                                        )}
                                    </td>
                                    <td className="p-3 text-muted">{categoryLabels[service.category]}</td>
                                    <td className="p-3 text-status-available">₦{service.price.toLocaleString()}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded-full text-xs ${service.is_active
                                            ? 'bg-status-available/20 text-status-available'
                                            : 'bg-surface-inset0/20 text-muted'
                                            }`}>
                                            {service.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button
                                            onClick={() => handleEdit(service)}
                                            className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(service)}
                                            className="p-2 text-muted hover:text-red-400 hover:bg-surface-raised rounded-lg"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {showForm && (
                    <ServiceForm
                        service={editingService}
                        onClose={() => { setShowForm(false); setEditingService(null); }}
                        onSuccess={() => { setShowForm(false); setEditingService(null); }}
                    />
                )}
            </div>
        </div>
    );
}

// Service Form Modal
function ServiceForm({
    service,
    onClose,
    onSuccess,
}: {
    service: Service | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: service?.name ?? '',
        category: service?.category ?? 'food' as ServiceCategory,
        price: service?.price ?? 0,
        description: service?.description ?? '',
        is_active: service?.is_active ?? true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (service) {
                await updateService(service.id, {
                    name: formData.name,
                    category: formData.category,
                    price: Number(formData.price),
                    description: formData.description || undefined,
                    is_active: formData.is_active,
                });
            } else {
                await createService({
                    name: formData.name,
                    category: formData.category,
                    price: Number(formData.price),
                    description: formData.description || undefined,
                });
            }
            onSuccess();
        } catch (err) {
            toast.error('Failed to save menu item', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-card rounded-xl border border-border w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold text-heading">{service ? 'Edit Menu Item' : 'Add Menu Item'}</h2>
                    <button onClick={onClose} className="p-2 text-muted hover:text-heading hover:bg-surface-raised rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="label">Item Name *</label>
                        <input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="input"
                            placeholder="e.g., Jollof Rice"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Category</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value as ServiceCategory })}
                                className="input"
                            >
                                <option value="food">Food</option>
                                <option value="beverage">Beverage</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Price (₦)</label>
                            <input
                                type="number"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                                className="input"
                                min="0"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="input"
                            rows={2}
                            placeholder="Brief description (optional)"
                        />
                    </div>

                    {service && (
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={formData.is_active}
                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <label htmlFor="is_active" className="text-muted">Active (visible in menu)</label>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} className="mr-2" />{service ? 'Save' : 'Create'}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
