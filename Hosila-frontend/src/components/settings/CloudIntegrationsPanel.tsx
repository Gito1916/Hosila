import { useState } from 'react';
import { CloudSettingsPanel } from './CloudSettingsPanel';
import { EmailImportPanel } from './EmailImportPanel';
import { ApiKeyPanel } from './ApiKeyPanel';
import { Cloud, Mail, Globe, ChevronDown, ChevronRight } from 'lucide-react';

type Section = 'cloud_sync' | 'email_import' | 'website_api';

/**
 * Cloud & Integrations — combines Cloud Sync + Email Import + Website API under one settings tab.
 */
export function CloudIntegrationsPanel() {
    const [expandedSection, setExpandedSection] = useState<Section | null>('cloud_sync');

    const toggleSection = (section: Section) => {
        setExpandedSection(prev => prev === section ? null : section);
    };

    return (
        <div className="space-y-3">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-heading">Cloud & Integrations</h3>
                <p className="text-sm text-muted">Manage cloud sync, email import, and website API</p>
            </div>

            {/* Cloud Sync Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('cloud_sync')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-surface-raised/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Cloud className="text-blue-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-heading font-medium text-sm">Cloud Sync</h4>
                        <p className="text-xs text-muted">Sync data across devices</p>
                    </div>
                    {expandedSection === 'cloud_sync'
                        ? <ChevronDown size={18} className="text-muted" />
                        : <ChevronRight size={18} className="text-muted" />
                    }
                </button>
                {expandedSection === 'cloud_sync' && (
                    <div className="px-4 pb-4 border-t border-border/50 pt-4">
                        <CloudSettingsPanel />
                    </div>
                )}
            </div>

            {/* Email Import Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('email_import')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-surface-raised/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Mail className="text-purple-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-heading font-medium text-sm">Email Import</h4>
                        <p className="text-xs text-muted">Auto-import OTA reservations from Gmail</p>
                    </div>
                    {expandedSection === 'email_import'
                        ? <ChevronDown size={18} className="text-muted" />
                        : <ChevronRight size={18} className="text-muted" />
                    }
                </button>
                {expandedSection === 'email_import' && (
                    <div className="px-4 pb-4 border-t border-border/50 pt-4">
                        <EmailImportPanel />
                    </div>
                )}
            </div>

            {/* Website API Section */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => toggleSection('website_api')}
                    className="w-full flex items-center gap-3 p-4 hover:bg-surface-raised/30 transition-colors text-left"
                >
                    <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center shrink-0">
                        <Globe className="text-cyan-400" size={18} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-heading font-medium text-sm">Website API</h4>
                        <p className="text-xs text-muted">API keys & endpoints for your hotel website</p>
                    </div>
                    {expandedSection === 'website_api'
                        ? <ChevronDown size={18} className="text-muted" />
                        : <ChevronRight size={18} className="text-muted" />
                    }
                </button>
                {expandedSection === 'website_api' && (
                    <div className="px-4 pb-4 border-t border-border/50 pt-4">
                        <ApiKeyPanel />
                    </div>
                )}
            </div>
        </div>
    );
}

