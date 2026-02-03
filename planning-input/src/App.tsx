
import React, { useState, useCallback } from 'react';
import { processWorkbook } from './services/excelService';
import { StyleEntry, ViewMode } from './types';
import { Timeline } from './components/Timeline';
import { Dashboard } from './components/Dashboard';
import { SupervisorGrid } from './components/SupervisorGrid';
import { AiAssistant } from './components/AiAssistant';

// Inline Icons
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
const UploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 18 18" /></svg>;
const AlertCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M9 3v4" /><path d="M7 3v4" /><path d="M3 7h4" /><path d="M3 5h4" /></svg>;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-red-500 text-xl font-bold mb-4">Something went wrong.</h2>
          <pre className="text-zinc-500 text-xs bg-zinc-900 p-4 rounded text-left overflow-auto max-w-2xl mx-auto">
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-white"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [data, setData] = useState<StyleEntry[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [view, setView] = useState<ViewMode>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<StyleEntry | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      const parsedData = await processWorkbook(file);
      setData(parsedData);
      localStorage.setItem('cachedData', JSON.stringify(parsedData));
    } catch (err) {
      console.error(err);
      alert("Failed to parse Excel file. Ensure it is a valid XLSX.");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const filteredData = data?.filter(s =>
    s.styleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.physicalLine && s.physicalLine.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-sans selection:bg-orange-500/30">

      {/* Header */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b]/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center text-white font-bold">
            CA
          </div>
          <span className="font-semibold text-white tracking-tight">ChangeoverAI</span>
        </div>

        {data && (
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute left-3 top-2.5 text-zinc-500"><SearchIcon /></div>
              <input
                type="text"
                placeholder="Search styles/lines..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-full py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-orange-500 transition-colors w-64"
              />
            </div>
            <div className="h-6 w-px bg-zinc-800 mx-2"></div>
            <nav className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              {(['dashboard', 'timeline', 'grid'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${view === m ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-6">
        {!data ? (
          <div className="flex flex-col items-center justify-center h-[80vh] animate-[fadeIn_0.5s_ease-out]">
            <div className="w-full max-w-lg border-2 border-dashed border-zinc-800 rounded-xl p-12 text-center hover:border-orange-500/50 transition-colors group bg-zinc-900/50">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-zinc-700 transition-colors">
                {isProcessing ? (
                  <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="text-zinc-400 group-hover:text-white"><UploadIcon /></div>
                )}
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Import Production Schedule</h2>
              <p className="text-zinc-500 mb-8">Drag & drop your apparel planning sheet here. <br /> Compatible with Supervisor/Target/MP layout.</p>
              <label className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-lg font-medium cursor-pointer transition-transform active:scale-95 inline-block">
                Select Excel File
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        ) : (
          <div className="max-w-full mx-auto animate-[fadeIn_0.3s_ease-out]">
            <ErrorBoundary>
              {/* View Switcher Content */}
              {view === 'dashboard' && <Dashboard data={filteredData} />}
              {view === 'timeline' && (
                <div className="h-[75vh]">
                  <Timeline data={filteredData} onStyleSelect={setSelectedStyle} />
                </div>
              )}
              {view === 'grid' && (
                <SupervisorGrid data={filteredData} onStyleSelect={setSelectedStyle} />
              )}
            </ErrorBoundary>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedStyle && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s]"
          onClick={() => setSelectedStyle(null)}
        >
          <div
            className="bg-[#18181b] w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-700 shadow-2xl animate-[scaleIn_0.2s]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start sticky top-0 bg-[#18181b] z-10">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">{selectedStyle.styleName}</h2>
                <p className="text-zinc-400 text-sm">Line: {selectedStyle.physicalLine}</p>
              </div>
              <button onClick={() => setSelectedStyle(null)} className="text-zinc-500 hover:text-white"><XIcon /></button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2 tracking-wider">Context</h4>
                  <div className="bg-zinc-900 p-3 rounded border border-zinc-800 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-zinc-500">Unit</span> <span className="text-white font-mono">{selectedStyle.unit}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Supervisor</span> <span className="text-white">{selectedStyle.supervisor}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Currently Running</span> <span className="text-white">{selectedStyle.currentRunningStyle || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Quantity</span> <span className="text-white">{selectedStyle.quantity}</span></div>
                  </div>
                </div>

                {selectedStyle.remarks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2 tracking-wider">Remarks</h4>
                    <div className="bg-yellow-900/10 border border-yellow-500/20 rounded p-3 space-y-2">
                      {selectedStyle.remarks.map((r, i) => (
                        <div key={i} className="text-xs text-yellow-500 font-mono">{r}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2 tracking-wider">Totals</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-900/20 p-3 rounded border border-green-900/30">
                      <div className="text-xs text-green-500 mb-1">Total Target</div>
                      <div className="text-2xl font-mono text-white">{selectedStyle.totalTarget}</div>
                    </div>
                    <div className="bg-orange-900/20 p-3 rounded border border-orange-900/30">
                      <div className="text-xs text-orange-500 mb-1">Manpower Days</div>
                      <div className="text-2xl font-mono text-white">{selectedStyle.totalManpower}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-2 md:col-span-1">
                <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2 tracking-wider">Daily Plan</h4>
                <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-800 text-zinc-400 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-right">Target</th>
                        <th className="p-2 text-right">MP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStyle.dailyPlans.map((day, i) => (
                        <tr key={i} className={`border-b border-zinc-800 ${day.isHoliday ? 'bg-red-900/10' : ''}`}>
                          <td className="p-2 font-mono text-zinc-300">
                            {day.date.toLocaleDateString()} <span className="text-zinc-600 ml-1">{day.dayName}</span>
                          </td>
                          <td className="p-2 text-right text-green-400">{day.target || '-'}</td>
                          <td className="p-2 text-right text-orange-400">{day.manpower || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant FAB and Panel */}
      {data && (
        <>
          <button
            onClick={() => setIsAiOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40 border border-indigo-400/30"
            title="Open AI Analyst"
          >
            <SparklesIcon />
          </button>

          <AiAssistant
            data={filteredData}
            isOpen={isAiOpen}
            onClose={() => setIsAiOpen(false)}
          />
        </>
      )}
    </div>
  );
}