import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createGuest } from '@/db/guests';
import type { IdType } from '@/types';
import { X, Loader2 } from 'lucide-react';

interface GuestFormProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface FormData {
    name: string;
    phone: string;
    email: string;
    idType: IdType;
    idNumber: string;
    occupation: string;
    reasonForVisit: 'business' | 'leisure' | 'medical' | 'family_event' | 'transit' | 'other';
    address: string;
}

export function GuestForm({ onClose, onSuccess }: GuestFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        defaultValues: {
            name: '',
            phone: '',
            email: '',
            idType: 'national_id',
            idNumber: '',
            occupation: '',
            reasonForVisit: 'leisure',
            address: '',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);

        try {
            await createGuest({
                name: data.name,
                phone: data.phone || undefined,
                email: data.email || undefined,
                idType: data.idType,
                idNumber: data.idNumber || undefined,
                occupation: data.occupation || undefined,
                reason_for_visit: data.reasonForVisit,
                address: data.address || undefined,
            });

            onSuccess();
        } catch (err) {
            console.error('Error creating guest:', err);
            setError(err instanceof Error ? err.message : 'Failed to create guest');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white">Add New Guest</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="label">Name *</label>
                        <input
                            {...register('name', { required: 'Name is required' })}
                            className={`input ${errors.name ? 'input-error' : ''}`}
                            placeholder="Full name"
                        />
                        {errors.name && (
                            <p className="text-xs text-error mt-1">{errors.name.message}</p>
                        )}
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="label">Phone</label>
                        <input
                            {...register('phone')}
                            className="input"
                            placeholder="+234-xxx-xxx-xxxx"
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="label">Email</label>
                        <input
                            {...register('email')}
                            type="email"
                            className="input"
                            placeholder="guest@email.com"
                        />
                    </div>

                    {/* ID Type & Number */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">ID Type</label>
                            <select {...register('idType')} className="input">
                                <option value="national_id">National ID</option>
                                <option value="passport">Passport</option>
                                <option value="drivers_license">Driver's License</option>
                                <option value="voters_card">Voter's Card</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">ID Number</label>
                            <input
                                {...register('idNumber')}
                                className="input"
                                placeholder="ID number"
                            />
                        </div>
                    </div>

                    {/* Occupation & Reason for Visit */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Occupation</label>
                            <input
                                {...register('occupation')}
                                className="input"
                                placeholder="e.g. Engineer"
                            />
                        </div>
                        <div>
                            <label className="label">Reason for Visit</label>
                            <select {...register('reasonForVisit')} className="input">
                                <option value="leisure">Leisure/Tourism</option>
                                <option value="business">Business</option>
                                <option value="medical">Medical</option>
                                <option value="family_event">Family/Event</option>
                                <option value="transit">Transit/Stopover</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    {/* Address */}
                    <div>
                        <label className="label">Address</label>
                        <textarea
                            {...register('address')}
                            className="input"
                            rows={2}
                            placeholder="Home or business address"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : (
                                'Add Guest'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
