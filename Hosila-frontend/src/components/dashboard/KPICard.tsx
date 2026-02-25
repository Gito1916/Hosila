import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: ReactNode;
    iconBg?: string; // Kept for API compatibility
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    alert?: boolean;
    onClick?: () => void;
}

export function KPICard({
    title,
    value,
    subtitle,
    icon,
    trend,
    trendValue,
    alert = false,
    onClick,
}: KPICardProps) {
    return (
        <div
            className={`bg-surface-card rounded-xl shadow-sm border border-border p-5 ${onClick ? 'cursor-pointer hover:bg-surface-raised transition-colors' : ''} ${alert ? 'border-red-500/50 bg-red-950' : ''}`}
            onClick={onClick}
        >
            <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold tracking-wider text-muted uppercase truncate pr-2">{title}</p>
                <div className="text-muted shrink-0">
                    {icon}
                </div>
            </div>

            <div>
                <p className={`font-bold ${alert ? 'text-red-500' : 'text-heading'} text-3xl truncate`}>
                    {value}
                </p>
            </div>

            {(subtitle || trend) && (
                <div className="mt-3 flex items-center gap-2 text-sm truncate">
                    {trend && trendValue && (
                        <div className={`flex items-center gap-1 font-medium ${trend === 'up' ? 'text-primary-400' :
                            trend === 'down' ? 'text-red-500' :
                                'text-muted'
                            }`}>
                            {trend === 'up' && <TrendingUp size={14} />}
                            {trend === 'down' && <TrendingDown size={14} />}
                            {trend === 'neutral' && <Minus size={14} />}
                            <span>{trendValue}</span>
                        </div>
                    )}
                    {subtitle && <span className="text-muted truncate">{subtitle}</span>}
                </div>
            )}
        </div>
    );
}
