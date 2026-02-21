import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: ReactNode;
    iconBg?: string;
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
    iconBg = 'bg-primary-500/20',
    trend,
    trendValue,
    alert = false,
    onClick,
}: KPICardProps) {
    return (
        <div
            className={`card p-4 ${alert ? 'border-red-500/50 bg-red-500/5' : ''} ${onClick ? 'cursor-pointer hover:bg-slate-700/50 transition-colors' : ''}`}
            onClick={onClick}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-400 truncate">{title}</p>
                    <p className={`font-normal mt-1 truncate ${alert ? 'text-red-400' : 'text-white'} ${String(value).length > 12 ? 'text-lg' :
                        String(value).length > 8 ? 'text-xl' :
                            'text-2xl lg:text-3xl'
                        }`}>
                        {value}
                    </p>
                    {subtitle && (
                        <p className="text-xs text-slate-500 mt-1 truncate">{subtitle}</p>
                    )}
                    {trend && trendValue && (
                        <div className={`flex items-center gap-1 text-xs mt-1 ${trend === 'up' ? 'text-green-400' :
                            trend === 'down' ? 'text-red-400' :
                                'text-slate-400'
                            }`}>
                            {trend === 'up' && <TrendingUp size={12} />}
                            {trend === 'down' && <TrendingDown size={12} />}
                            {trend === 'neutral' && <Minus size={12} />}
                            <span>{trendValue}</span>
                        </div>
                    )}
                </div>
                <div className={`p-3 rounded-lg ${iconBg} shrink-0`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
