import { useState, useEffect, useRef } from 'react';
import { getHotel, updateHotel, getHotelSettings, updateHotelSettings } from '@/db/settings';
import { uploadHotelLogo, deleteHotelLogo, isCloudLinked } from '@/lib/supabase';
import { getHotelId } from '@/lib/api';
import { toast } from '@/lib/errorMessages';
import type { Hotel, HotelSettings } from '@/types';
import {
    Building,
    Clock,
    Save,
    Loader2,
    Upload,
    Image,
    X,
} from 'lucide-react';

export function HotelSettingsPanel() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [settings, setSettings] = useState<HotelSettings | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function load() {
            const hotelData = await getHotel();
            const settingsData = await getHotelSettings();
            setHotel(hotelData ?? null);
            setSettings(settingsData ?? null);
            setIsLoading(false);
        }
        load();
    }, []);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.warn('Invalid file', 'Please select an image file.');
            return;
        }

        // Validate file size (max 2MB for Storage)
        if (file.size > 2 * 1024 * 1024) {
            toast.warn('File too large', 'Image must be less than 2 MB.');
            return;
        }

        // Keep the File for upload on save, show preview immediately
        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = () => {
            setLogoPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveLogo = async () => {
        // Delete from Supabase Storage if cloud is linked
        const cloudLinked = await isCloudLinked();
        if (cloudLinked) {
            const hotelId = await getHotelId();
            await deleteHotelLogo(hotelId);
        }
        setHotel(h => h ? { ...h, logo_url: undefined } : null);
        setLogoFile(null);
        setLogoPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSaveHotel = async () => {
        if (!hotel) return;
        setIsSaving(true);
        try {
            let logoUrl = hotel.logo_url;

            // If a new logo file was selected, upload to Supabase Storage
            if (logoFile) {
                const cloudLinked = await isCloudLinked();
                if (cloudLinked) {
                    const hotelId = await getHotelId();
                    const publicUrl = await uploadHotelLogo(hotelId, logoFile);
                    if (publicUrl) {
                        logoUrl = publicUrl;
                        setLogoFile(null);
                        setLogoPreview(null);
                    } else {
                        toast.warn('Logo upload failed', 'Logo saved locally only.');
                    }
                }
                // If not cloud linked, keep the base64 preview as logo_url
                if (!logoUrl || logoUrl === hotel.logo_url) {
                    logoUrl = logoPreview || hotel.logo_url;
                }
            }

            await updateHotel({
                name: hotel.name,
                logo_url: logoUrl,
                address: hotel.address,
                phone: hotel.phone,
                email: hotel.email,
            });
            // Update local state with the new URL
            setHotel(h => h ? { ...h, logo_url: logoUrl } : null);
            toast.success('Hotel info saved');
        } catch (err: any) {
            toast.error('Failed to save hotel info', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await updateHotelSettings(settings);
            toast.success('Settings saved');
        } catch (err) {
            toast.error('Failed to save settings', err);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="card p-8 text-center">
                <Loader2 className="animate-spin mx-auto text-primary-400" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Hotel Info */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Building size={18} />
                    Hotel Information
                </h3>

                <div className="space-y-4">
                    {/* Logo Upload */}
                    <div>
                        <label className="label flex items-center gap-1">
                            <Image size={14} />
                            Hotel Logo
                        </label>
                        <div className="flex items-start gap-4">
                            {(logoPreview || hotel?.logo_url) ? (
                                <div className="relative">
                                    <img
                                        src={logoPreview || hotel?.logo_url}
                                        alt="Hotel Logo"
                                        className="w-24 h-24 object-contain bg-slate-700 rounded-lg border border-slate-600"
                                    />
                                    <button
                                        onClick={handleRemoveLogo}
                                        className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-24 h-24 flex flex-col items-center justify-center bg-slate-700/50 rounded-lg border border-dashed border-slate-500 cursor-pointer hover:border-primary-400 transition-colors"
                                >
                                    <Upload size={20} className="text-slate-400" />
                                    <span className="text-xs text-slate-400 mt-1">Upload</span>
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                            />
                            <div className="text-xs text-slate-500">
                                <p>Recommended: Square image (e.g., 200x200px)</p>
                                <p>Max size: 500KB</p>
                                <p>Formats: PNG, JPG, GIF</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="label">Hotel Name</label>
                        <input
                            value={hotel?.name ?? ''}
                            onChange={(e) => setHotel(h => h ? { ...h, name: e.target.value } : null)}
                            className="input"
                        />
                    </div>

                    <div>
                        <label className="label">Address</label>
                        <textarea
                            value={hotel?.address ?? ''}
                            onChange={(e) => setHotel(h => h ? { ...h, address: e.target.value } : null)}
                            className="input"
                            rows={2}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Phone</label>
                            <input
                                value={hotel?.phone ?? ''}
                                onChange={(e) => setHotel(h => h ? { ...h, phone: e.target.value } : null)}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="label">Email</label>
                            <input
                                value={hotel?.email ?? ''}
                                onChange={(e) => setHotel(h => h ? { ...h, email: e.target.value } : null)}
                                className="input"
                            />
                        </div>
                    </div>

                    <button onClick={handleSaveHotel} disabled={isSaving} className="btn btn-primary">
                        <Save size={16} className="mr-2" />
                        Save Hotel Info
                    </button>
                </div>
            </div>

            {/* System Settings */}
            <div className="card p-4">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Clock size={18} />
                    System Settings
                </h3>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Default Checkout Time</label>
                            <input
                                type="time"
                                value={settings?.checkout_time ?? '12:00'}
                                onChange={(e) => setSettings(s => s ? { ...s, checkout_time: e.target.value } : null)}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="label">Night Audit Time</label>
                            <input
                                type="time"
                                value={settings?.night_audit_time ?? '03:00'}
                                onChange={(e) => setSettings(s => s ? { ...s, night_audit_time: e.target.value } : null)}
                                className="input"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="short_rest_enabled"
                            checked={settings?.short_rest_enabled ?? true}
                            onChange={(e) => setSettings(s => s ? { ...s, short_rest_enabled: e.target.checked } : null)}
                            className="w-4 h-4"
                        />
                        <label htmlFor="short_rest_enabled" className="text-slate-400">Enable Short Rest bookings</label>
                    </div>

                    {settings?.short_rest_enabled && (
                        <div className="grid grid-cols-2 gap-4 pl-7">
                            <div>
                                <label className="label">Min Hours</label>
                                <input
                                    type="number"
                                    value={settings?.short_rest_min_hours ?? 2}
                                    onChange={(e) => setSettings(s => s ? { ...s, short_rest_min_hours: Number(e.target.value) } : null)}
                                    className="input"
                                    min="1"
                                    max="12"
                                />
                            </div>
                            <div>
                                <label className="label">Max Hours</label>
                                <input
                                    type="number"
                                    value={settings?.short_rest_max_hours ?? 6}
                                    onChange={(e) => setSettings(s => s ? { ...s, short_rest_max_hours: Number(e.target.value) } : null)}
                                    className="input"
                                    min="1"
                                    max="12"
                                />
                            </div>
                        </div>
                    )}

                    {/* Credit Limit Settings */}
                    <div className="border-t border-slate-700 pt-4 mt-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="credit_limit_enabled"
                                checked={settings?.credit_limit_enabled ?? false}
                                onChange={(e) => setSettings(s => s ? { ...s, credit_limit_enabled: e.target.checked } : null)}
                                className="w-4 h-4"
                            />
                            <label htmlFor="credit_limit_enabled" className="text-slate-400">Enable Credit Limit Warnings</label>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 ml-7">
                            Warn staff when guest balance exceeds the limit
                        </p>

                        {settings?.credit_limit_enabled && (
                            <div className="mt-3 pl-7">
                                <label className="label">Credit Limit Amount</label>
                                <div className="relative max-w-xs">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₦</span>
                                    <input
                                        type="number"
                                        value={settings?.credit_limit_amount ?? 50000}
                                        onChange={(e) => setSettings(s => s ? { ...s, credit_limit_amount: Number(e.target.value) } : null)}
                                        className="input pl-8"
                                        min="0"
                                        step="1000"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <button onClick={handleSaveSettings} disabled={isSaving} className="btn btn-primary">
                        <Save size={16} className="mr-2" />
                        Save System Settings
                    </button>
                </div>
            </div>
        </div>
    );
}

