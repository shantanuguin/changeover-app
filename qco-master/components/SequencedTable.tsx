import React from 'react';
import { SectionGroup } from '../types';
import { List, CheckSquare } from 'lucide-react';

interface SequencedTableProps {
  sections: SectionGroup[];
}

export const SequencedTable: React.FC<SequencedTableProps> = ({ sections }) => {
  return (
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <div key={idx} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center space-x-2">
            <List className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800">{section.sectionName}</h3>
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
              {section.operations.length} Ops
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">Seq</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operation Name</th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">SMV</th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Machine</th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Floor Ref</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {section.operations.map((op, opIdx) => (
                  <tr key={op.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                      {opIdx + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {op.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      {op.smv}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">
                      {op.machineType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold text-center">
                      {op.quantity > 0 ? op.quantity : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 font-medium">
                      {op.biMachineRef || <span className="text-gray-300 italic">--</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      
      {sections.length === 0 && (
        <div className="text-center py-10 bg-white rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500">No sections found. Check column A for text markers.</p>
        </div>
      )}
    </div>
  );
};