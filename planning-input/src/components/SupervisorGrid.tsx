import React from 'react';
import { StyleEntry } from '../types';

interface SupervisorGridProps {
    data: StyleEntry[];
    onStyleSelect: (style: StyleEntry) => void;
}

const AlertCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;

export const SupervisorGrid: React.FC<SupervisorGridProps> = ({ data, onStyleSelect }) => {
    // Group data by Supervisor
    const groupedData = React.useMemo(() => {
        const groups = new Map<string, StyleEntry[]>();

        data.forEach(style => {
            const sup = style.supervisor || 'Unassigned';
            if (!groups.has(sup)) {
                groups.set(sup, []);
            }
            groups.get(sup)?.push(style);
        });

        // Sort supervisors? Maybe by size or name.
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [data]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-[fadeIn_0.3s_ease-out]">
            {groupedData.map(([supervisor, styles]) => {
                // Calculate aggregates for sorting/display could go here
                const totalStyles = styles.length;
                const unit = styles[0]?.unit || 'N/A';
                const totalTarget = styles.reduce((acc, s) => acc + s.totalTarget, 0);

                return (
                    <div key={supervisor} className="bg-[#18181b] rounded-lg border border-zinc-800 overflow-hidden flex flex-col h-[500px]">
                        {/* Supervisor Header */}
                        <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-start sticky top-0 z-10">
                            <div>
                                <h3 className="text-white font-bold text-lg truncate w-48" title={supervisor}>{supervisor}</h3>
                                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                                    <span className={`px-1.5 py-0.5 rounded border border-zinc-700 ${unit === 'Main Unit' ? 'bg-blue-900/20 text-blue-400' : 'bg-purple-900/20 text-purple-400'}`}>{unit}</span>
                                    <span>• {totalStyles} Styles</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Target</div>
                                <div className="text-green-400 font-mono font-bold">{(totalTarget / 1000).toFixed(1)}k</div>
                            </div>
                        </div>

                        {/* Styles List */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <thead className="text-zinc-500 sticky top-0 bg-[#18181b] shadow-sm z-0">
                                    <tr>
                                        <th className="p-2 pb-3 pl-3 font-medium">Style</th>
                                        <th className="p-2 pb-3 text-right font-medium">Qty</th>
                                        <th className="p-2 pb-3 text-right font-medium">Start</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {styles.map(style => (
                                        <tr
                                            key={style.id}
                                            onClick={() => onStyleSelect(style)}
                                            className="hover:bg-zinc-800/50 cursor-pointer group transition-colors"
                                        >
                                            <td className="p-2 pl-3">
                                                <div className="font-medium text-zinc-300 group-hover:text-white truncate w-32" title={style.styleName}>{style.styleName}</div>
                                                <div className="text-[10px] text-zinc-600 truncate">{style.currentRunningStyle ? `Running: ${style.currentRunningStyle}` : 'New Start'}</div>
                                                {style.anomalies.length > 0 && (
                                                    <div className="mt-1 text-red-400 flex items-center gap-1 text-[10px]">
                                                        <AlertCircleIcon /> Isuse
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-2 text-right font-mono text-zinc-400">
                                                {style.quantity}
                                            </td>
                                            <td className="p-2 text-right font-mono text-zinc-500">
                                                {style.startDate?.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }) || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Card Footer (Optional stats) */}
                        <div className="p-2 bg-zinc-900/50 border-t border-zinc-800 text-[10px] text-center text-zinc-600">
                            {/* Could put average MP here */}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
