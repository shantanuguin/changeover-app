import React from 'react';

interface MetricsCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, subValue, icon, trend }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-start space-x-4">
      <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
        {subValue && (
          <p className={`text-xs mt-1 font-medium ${
            trend === 'up' ? 'text-red-600' : trend === 'down' ? 'text-green-600' : 'text-gray-400'
          }`}>
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
};