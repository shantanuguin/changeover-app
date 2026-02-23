import React from 'react';
import { MachineComparison } from '../types';
import { ArrowRight, CheckCircle, AlertCircle, MinusCircle } from 'lucide-react';

interface MachineTableProps {
  data: MachineComparison[];
}

export const MachineTable: React.FC<MachineTableProps> = ({ data }) => {
  // Sort: Needs first, then Surplus, then OK
  const sortedData = [...data].sort((a, b) => {
    const priority = { 'NEED': 0, 'SURPLUS': 1, 'OK': 2 };
    return priority[a.status] - priority[b.status];
  });

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Machine Type</th>
            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Current Qty</th>
            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
              <div className="flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-gray-400 mx-1" />
              </div>
            </th>
            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Upcoming Qty</th>
            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Difference</th>
            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sortedData.map((row, idx) => (
            <tr key={idx} className={row.status === 'NEED' ? 'bg-red-50/30' : row.status === 'SURPLUS' ? 'bg-green-50/30' : ''}>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                {row.machineType}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-center">{row.currentQty}</td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400 text-center">→</td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 font-semibold text-center">{row.upcomingQty}</td>
              <td className="whitespace-nowrap px-3 py-4 text-sm font-bold text-center">
                <span className={row.diff > 0 ? 'text-red-600' : row.diff < 0 ? 'text-green-600' : 'text-gray-400'}>
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                <div className="flex justify-center">
                  {row.status === 'NEED' && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                      <AlertCircle className="w-3 h-3 mr-1" /> Need
                    </span>
                  )}
                  {row.status === 'SURPLUS' && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" /> Surplus
                    </span>
                  )}
                  {row.status === 'OK' && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                      <MinusCircle className="w-3 h-3 mr-1" /> No Change
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};