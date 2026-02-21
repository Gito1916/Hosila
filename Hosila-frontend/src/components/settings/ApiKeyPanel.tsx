import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { requireSupabase, getHotelId} from '@/lib/api';
import {
    Key,
    Plus,
    Trash2,
    Copy,
    Check,
    Globe,
    Loader2,
    AlertCircle,
    ExternalLink,
} from 'lucide-react';

interface ApiKey {
    id: string;
    key_prefix: string;
    name: string;
    is_active: boolean;
    last_used_at: string | null;
    created_at: string;
    allowed_origins: string[];
}

/**
 * API Key Management Panel for the Website API.
 * Allows generating, viewing, and revoking API keys.
 */
export function ApiKeyPanel() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hotelId, setHotelId] = useState<string | null>(null);

    const loadKeys = useCallback(async () => {
        if (!supabase) return;
        const hotel = await (async () => { const sb = requireSupabase(); const hotelId = await getHotelId(); const { data } = await sb.from('hotels').select('*').eq('id', hotelId).single(); return data; })();
        if (!hotel?.id) return;
        setHotelId(hotel.id);

        const { data, error: err } = await supabase
            .from('api_keys')
            .select('id, key_prefix, name, is_active, last_used_at, created_at, allowed_origins')
            .eq('hotel_id', hotel.id)
            .order('created_at', { ascending: false });

        if (err) {
            setError('Failed to load API keys');
            return;
        }
        setKeys(data || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadKeys();
    }, [loadKeys]);

    const generateKey = async () => {
        if (!supabase || !hotelId) return;
        setGenerating(true);
        setError(null);
        setNewKeyValue(null);

        try {
            // Generate a random API key
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            const rawKey = 'hf_' + Array.from(array)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            // Hash it for storage
            const encoder = new TextEncoder();
            const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            const keyPrefix = rawKey.slice(0, 11); // "hf_" + 8 chars

            const { error: insertErr } = await supabase
                .from('api_keys')
                .insert({
                    hotel_id: hotelId,
                    key_hash: keyHash,
                    key_prefix: keyPrefix,
                    name: 'Website API Key',
                });

            if (insertErr) {
                setError(insertErr.message);
                return;
            }

            setNewKeyValue(rawKey);
            await loadKeys();
        } catch (err) {
            setError('Failed to generate API key');
        } finally {
            setGenerating(false);
        }
    };

    const revokeKey = async (keyId: string) => {
        if (!supabase) return;
        const { error: err } = await supabase
            .from('api_keys')
            .update({ is_active: false })
            .eq('id', keyId);

        if (err) {
            setError('Failed to revoke key');
            return;
        }
        await loadKeys();
    };

    const deleteKey = async (keyId: string) => {
        if (!supabase) return;
        const { error: err } = await supabase
            .from('api_keys')
            .delete()
            .eq('id', keyId);

        if (err) {
            setError('Failed to delete key');
            return;
        }
        await loadKeys();
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
    const apiBaseUrl = `${supabaseUrl}/functions/v1/api`;

    if (!supabase) {
        return (
            <div className="text-slate-400 text-sm">
                Cloud not configured. API keys require cloud sync.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Globe className="text-cyan-400" size={20} />
                    <h4 className="text-white font-medium">Website API</h4>
                </div>
                <button
                    onClick={generateKey}
                    disabled={generating}
                    className="btn btn-primary text-sm"
                >
                    {generating ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Plus size={14} />
                            Generate API Key
                        </>
                    )}
                </button>
            </div>

            <p className="text-xs text-slate-400">
                API keys allow your hotel website to query room availability and create reservations.
            </p>

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            {/* Newly generated key warning */}
            {newKeyValue && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Key className="text-amber-400" size={16} />
                        <p className="text-amber-400 text-sm font-medium">
                            Copy your API key now — it won't be shown again!
                        </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <code className="flex-1 bg-slate-800 text-emerald-400 px-3 py-2 rounded text-xs font-mono break-all">
                            {newKeyValue}
                        </code>
                        <button
                            onClick={() => copyToClipboard(newKeyValue)}
                            className="btn btn-secondary text-xs px-2 py-2 shrink-0"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                    </div>
                </div>
            )}

            {/* Keys list */}
            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-slate-400" size={24} />
                </div>
            ) : keys.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                    No API keys yet. Generate one to get started.
                </div>
            ) : (
                <div className="space-y-2">
                    {keys.map((key) => (
                        <div
                            key={key.id}
                            className={`p-3 rounded-lg border ${key.is_active
                                    ? 'bg-slate-800/50 border-slate-700'
                                    : 'bg-slate-800/20 border-slate-700/50 opacity-60'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Key size={14} className={key.is_active ? 'text-cyan-400' : 'text-slate-500'} />
                                    <code className="text-sm font-mono text-slate-300">
                                        {key.key_prefix}...
                                    </code>
                                    {!key.is_active && (
                                        <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                                            Revoked
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {key.is_active && (
                                        <button
                                            onClick={() => revokeKey(key.id)}
                                            className="text-amber-400 hover:text-amber-300 p-1 rounded transition-colors"
                                            title="Revoke key"
                                        >
                                            <AlertCircle size={14} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => deleteKey(key.id)}
                                        className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                                        title="Delete key"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                                <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                                {key.last_used_at && (
                                    <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* API Docs preview */}
            <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h5 className="text-white text-sm font-medium mb-2 flex items-center gap-2">
                    <ExternalLink size={14} />
                    API Endpoints
                </h5>
                <div className="space-y-1.5 text-xs font-mono">
                    <div>
                        <span className="text-emerald-400">GET</span>{' '}
                        <span className="text-slate-400">{apiBaseUrl}?action=hotel-info&hotel_id={hotelId || '{hotel_id}'}</span>
                    </div>
                    <div>
                        <span className="text-emerald-400">GET</span>{' '}
                        <span className="text-slate-400">{apiBaseUrl}?action=room-types&hotel_id={hotelId || '{hotel_id}'}</span>
                    </div>
                    <div>
                        <span className="text-emerald-400">GET</span>{' '}
                        <span className="text-slate-400">{apiBaseUrl}?action=availability&hotel_id={hotelId || '{hotel_id}'}&check_in=...&check_out=...</span>
                    </div>
                    <div>
                        <span className="text-blue-400">POST</span>{' '}
                        <span className="text-slate-400">{apiBaseUrl}?action=create-reservation</span>
                        <span className="text-amber-400 ml-1">(API key required)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
