
import React, { useRef, useState, useMemo } from 'react';
import { StyleEntry } from '../types';
import { COLORS } from '../constants';

interface TimelineProps {
  data: StyleEntry[];
  onStyleSelect: (style: StyleEntry) => void;
}

const DAY_WIDTH = 50; // Pixels per day
const HEADER_HEIGHT = 40;

// Inline Icons
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
);
const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
);

export const Timeline: React.FC<TimelineProps> = ({ data, onStyleSelect }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  // Filter out invalid dates for timeline
  const validData = useMemo(() => data.filter(d => d.startDate && d.endDate), [data]);

  if (validData.length === 0) return <div className="text-zinc-500 p-8 text-center">No timeline data available. Check date detection.</div>;

  const minDate = validData.reduce((min, d) => d.startDate! < min ? d.startDate! : min, validData[0].startDate!);
  const maxDate = validData.reduce((max, d) => d.endDate! > max ? d.endDate! : max, validData[0].endDate!);

  // Buffer days
  const startDate = new Date(minDate);
  startDate.setDate(startDate.getDate() - 2);
  const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 10;

  const getPos = (date: Date) => {
    const diffTime = Math.abs(date.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays * (DAY_WIDTH * zoom);
  };

  // Group by Physical Line
  const lanes = Array.from(new Set(validData.map(d => d.physicalLine || 'Unassigned'))).sort();

  return (
    <div className="flex flex-col h-full bg-[#121214] border border-zinc-800 rounded-lg overflow-hidden">
      {/* Controls */}
      <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-[#18181b]">
        <h3 className="text-zinc-300 font-medium font-mono flex items-center gap-2">
          <CalendarIcon /> Production Schedule
        </h3>
        <div className="flex gap-2">
          <button onClick={() => setZoom(Math.max(0.5, zoom - 0.2))} className="px-3 py-1 bg-zinc-800 rounded text-zinc-400 hover:text-white">-</button>
          <span className="text-zinc-500 text-sm py-1 font-mono">{(zoom * 100).toFixed(0)}%</span>
          <button onClick={() => setZoom(Math.min(2, zoom + 0.2))} className="px-3 py-1 bg-zinc-800 rounded text-zinc-400 hover:text-white">+</button>
        </div>
      </div>

      {/* Gantt Area */}
      <div className="flex-1 overflow-auto relative cursor-grab active:cursor-grabbing" ref={scrollRef}>
        <div
          className="relative"
          style={{ width: totalDays * DAY_WIDTH * zoom, minHeight: '100%' }}
        >
          {/* Date Headers */}
          <div className="sticky top-0 z-20 flex bg-[#18181b] border-b border-zinc-700 h-10">
            <div className="w-48 flex-shrink-0 border-r border-zinc-700 bg-[#18181b] sticky left-0 z-30 flex items-center px-4 font-bold text-xs text-zinc-400">
              PHYSICAL LINE / SUPERVISOR
            </div>
            <div className="flex">
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(startDate.getTime() + (i * 86400000));
                const isFri = d.getDay() === 5; // Friday
                return (
                  <div key={i} className={`flex-shrink-0 border-r border-zinc-800 flex flex-col justify-center items-center text-[10px] font-mono ${isFri ? 'bg-red-900/10 text-red-500' : 'text-zinc-500'}`} style={{ width: DAY_WIDTH * zoom }}>
                    <div>{d.getDate()}</div>
                    <div>{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Swimlanes */}
          <div>
            {lanes.map((lane) => (
              <div key={lane} className="relative border-b border-zinc-800/50 flex">
                {/* Lane Header */}
                <div className="sticky left-0 z-10 bg-zinc-900 border-r border-zinc-700 w-48 flex-shrink-0 p-3 flex flex-col justify-center group hover:bg-zinc-800 transition-colors">
                  <div className="text-xs font-bold text-zinc-300 line-clamp-2" title={lane}>{lane}</div>
                  {validData.find(d => d.physicalLine === lane)?.unit && (
                    <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">{validData.find(d => d.physicalLine === lane)?.unit}</div>
                  )}
                </div>

                {/* Lane Content */}
                <div className="relative flex-grow h-24 bg-[#09090b]">
                  {/* Grid Background */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = new Date(startDate.getTime() + (i * 86400000));
                      const isFri = d.getDay() === 5;
                      return (
                        <div key={i} className={`h-full border-r border-zinc-800/30 flex-shrink-0 ${isFri ? 'bg-red-900/5 pattern-diagonal-lines' : ''}`} style={{ width: DAY_WIDTH * zoom }}></div>
                      );
                    })}
                  </div>

                  {/* Style Bars */}
                  {validData.filter(d => (d.physicalLine || 'Unassigned') === lane).map((style) => {
                    const left = getPos(style.startDate!);
                    const width = Math.max(30, getPos(style.endDate!) - left + (DAY_WIDTH * zoom));

                    // Anomaly coloring
                    const hasError = style.anomalies.some(a => a.severity === 'high');
                    const hasWarn = style.anomalies.length > 0;
                    const borderColor = hasError ? 'border-red-500' : hasWarn ? 'border-yellow-500' : 'border-blue-500';
                    const bgColor = hasError ? 'bg-red-500/10' : hasWarn ? 'bg-yellow-500/10' : 'bg-blue-500/10';

                    return (
                      <div
                        key={style.id}
                        onClick={() => onStyleSelect(style)}
                        className={`absolute top-4 h-16 rounded border-l-4 cursor-pointer overflow-hidden group transition-all duration-200 hover:z-50 hover:shadow-2xl hover:scale-[1.01] ${borderColor} ${bgColor} bg-zinc-900`}
                        style={{
                          left,
                          width: width - 2, // gap
                          transition: 'left 0.3s ease, width 0.3s ease'
                        }}
                      >
                        <div className="p-2">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-xs text-white truncate w-full block">{style.styleName}</span>
                          </div>
                          <div className="flex gap-3 mt-2 text-[10px] text-zinc-400">
                            <div className="flex items-center gap-1">
                              <TargetIcon /> {Math.round(style.totalTarget).toLocaleString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <UsersIcon /> {Math.round(style.totalManpower / style.dailyPlans.length || 0)} avg
                            </div>
                          </div>
                          {style.remarks.length > 0 && (
                            <div className="absolute bottom-1 right-2 w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Has Remarks" />
                          )}
                        </div>

                        {/* Tooltip on Hover */}
                        <div className="absolute top-full left-0 mt-2 w-64 bg-black border border-zinc-700 rounded p-3 z-[60] hidden group-hover:block shadow-xl pointer-events-none">
                          <div className="text-[10px] text-zinc-400 mb-1"><span className="text-zinc-500">Cur:</span> {style.currentRunningStyle}</div>
                          <div className="text-[10px] text-zinc-400 mb-1"><span className="text-zinc-500">Qty:</span> {style.quantity}</div>
                          {style.remarks.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-zinc-800">
                              <div className="text-[9px] text-zinc-500 font-bold mb-1">REMARKS:</div>
                              {style.remarks.map((r, i) => (
                                <div key={i} className="text-[9px] text-yellow-500/80 mb-0.5 leading-tight">{r}</div>
                              ))}
                            </div>
                          )}
                          {style.anomalies.length > 0 && <div className="text-[10px] text-red-400 mt-2 border-t border-zinc-800 pt-1">⚠ {style.anomalies[0].message}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
