
import React from 'react';
import { StyleEntry } from '../types';
import { COLORS } from '../constants';

interface DashboardProps {
  data: StyleEntry[];
}

// Inline Icons
const LayersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
const AlertTriangleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>;
const TargetIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;

export const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  const totalStyles = data.length;
  const anomalies = data.reduce((sum, d) => sum + d.anomalies.length, 0);
  const totalTarget = data.reduce((sum, d) => sum + d.totalTarget, 0);
  // Calculate Daily Aggregates for the Factory
  const dailyStats = new Map<string, { date: Date, target: number, mp: number }>();

  data.forEach(style => {
    style.dailyPlans.forEach(day => {
      const dateKey = day.date.toISOString().split('T')[0];
      const current = dailyStats.get(dateKey) || { date: day.date, target: 0, mp: 0 };
      current.target += day.target;
      current.mp += day.manpower;
      dailyStats.set(dateKey, current);
    });
  });

  const calendarData = Array.from(dailyStats.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate Average Manpower per Active Style (Naive)
  const avgManpowerPerStyle = Math.round(data.reduce((acc, style) => {
    const styleAvg = style.dailyPlans.length ? style.totalManpower / style.dailyPlans.length : 0;
    return acc + styleAvg;
  }, 0) / (data.length || 1));



  const StatCard = ({ title, value, sub, icon: Icon, color }: any) => (
    <div className="bg-[#18181b] p-6 rounded-lg border border-zinc-800 flex items-start justify-between">
      <div>
        <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest mb-1">{title}</p>
        <h3 className="text-2xl font-mono text-white">{value}</h3>
        {sub && <p className="text-zinc-400 text-xs mt-2">{sub}</p>}
      </div>
      <div className={`p-2 rounded bg-opacity-10 ${color.replace('text', 'bg')}`}>
        <Icon />
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <StatCard
        title="Active Styles"
        value={totalStyles}
        sub="Unique changeovers"
        icon={LayersIcon}
        color="text-blue-500"
      />
      <StatCard
        title="Total Target"
        value={(totalTarget / 1000).toFixed(1) + 'k'}
        sub="Total pieces planned"
        icon={TargetIcon}
        color="text-green-500"
      />
      <StatCard
        title="Avg Line Manpower"
        value={avgManpowerPerStyle}
        sub="Operators per line"
        icon={UsersIcon}
        color="text-orange-500"
      />
      <StatCard
        title="Issues"
        value={anomalies}
        sub="Planning anomalies"
        icon={AlertTriangleIcon}
        color="text-red-500"
      />

      {/* Style Daily Targets Breakdown (Requested by User) */}
      <div className="col-span-1 md:col-span-4 bg-[#18181b] p-6 rounded-lg border border-zinc-800 h-96 flex flex-col">
        <h4 className="text-zinc-300 font-medium mb-4">Style Daily Targets</h4>
        <div className="flex-1 overflow-auto rounded border border-zinc-800/50">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-900 text-zinc-500 sticky top-0 z-10">
              <tr>
                <th className="p-3 sticky left-0 bg-zinc-900 border-r border-zinc-800">Style / Line</th>
                <th className="p-3">Manpower</th>
                {calendarData.slice(0, 14).map((d, i) => (
                  <th key={i} className={`p-3 text-center border-l border-zinc-800/50 ${d.date.getDay() === 5 ? 'text-red-500' : ''}`}>
                    {d.date.getDate()} <span className="text-[9px] uppercase">{d.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.slice(0, 20).map(style => {
                const styleAvgMp = style.dailyPlans.length ? Math.round(style.totalManpower / style.dailyPlans.length) : 0;
                return (
                  <tr key={style.id} className="hover:bg-zinc-800/30">
                    <td className="p-3 font-medium text-zinc-300 sticky left-0 bg-[#18181b] border-r border-zinc-800">
                      <div className="truncate w-32" title={style.styleName}>{style.styleName}</div>
                      <div className="text-[10px] text-zinc-500 truncate w-32">{style.physicalLine}</div>
                    </td>
                    <td className="p-3 text-orange-400 font-mono">{styleAvgMp}</td>
                    {calendarData.slice(0, 14).map((d, i) => {
                      const plan = style.dailyPlans.find(p => p.date.getTime() === d.date.getTime());
                      return (
                        <td key={i} className="p-3 text-center border-l border-zinc-800/50 font-mono text-zinc-400">
                          {plan ? <span className="text-green-400">{plan.target}</span> : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[10px] text-zinc-500 text-right">Showing top 20 styles • Next 14 days</div>
      </div>

      {/* Critical Items */}
      <div className="col-span-1 md:col-span-2 bg-[#18181b] p-6 rounded-lg border border-zinc-800 h-80 flex flex-col">
        <h4 className="text-zinc-300 font-medium mb-4">Critical Items</h4>
        <div className="flex-1 overflow-auto space-y-3 pr-2">
          {data.filter(s => s.anomalies.length > 0 || s.remarks.length > 0).slice(0, 100).map(s => (
            <div key={s.id} className="p-3 rounded bg-zinc-900/50 border border-zinc-800 text-xs">
              <div className="flex justify-between mb-1">
                <span className="font-bold text-white truncate w-2/3" title={s.styleName}>{s.styleName}</span>
                <span className="text-zinc-500">{s.physicalLine}</span>
              </div>
              {s.anomalies.map(a => (
                <div key={a.message} className="text-red-400 flex items-center gap-1 mt-1">
                  <AlertTriangleIcon /> {a.message}
                </div>
              ))}
              {s.remarks.slice(0, 1).map(r => (
                <div key={r} className="text-yellow-500/80 mt-1 italic line-clamp-2">
                  "{r.split(': ')[1] || r}"
                </div>
              ))}
            </div>
          ))}
          {data.every(s => s.anomalies.length === 0 && s.remarks.length === 0) && (
            <div className="text-center text-zinc-500 py-8">No critical items found</div>
          )}
        </div>
      </div>

      {/* Factory Daily Goals */}
      <div className="col-span-1 md:col-span-2 bg-[#18181b] p-6 rounded-lg border border-zinc-800 h-80 flex flex-col">
        <h4 className="text-zinc-300 font-medium mb-4">Factory Daily Goals</h4>
        <div className="flex-1 overflow-auto rounded border border-zinc-800/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-500 sticky top-0 outline outline-1 outline-zinc-800">
              <tr>
                <th className="p-2 font-medium">Date</th>
                <th className="p-2 font-medium text-right">Target</th>
                <th className="p-2 font-medium text-right">MP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {calendarData.slice(0, 14).map((d, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="p-2 font-mono text-zinc-300">{d.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</td>
                  <td className="p-2 text-right font-mono text-green-400 font-bold">{d.target.toLocaleString()}</td>
                  <td className="p-2 text-right font-mono text-orange-400">{d.mp.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};