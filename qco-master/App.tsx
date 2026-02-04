import React, { useState } from 'react';
import { Settings, Play, Save, Loader2, Users, AlertTriangle, Layers, FileText } from 'lucide-react';
import { Dropzone } from './components/Dropzone';
import { parseOBFile } from './services/excelParser';
import { saveChangeoverToFirebase } from './services/firebaseService';
import { ParsedOBData, QCOData, MachineComparison } from './types';
import { MachineTable } from './components/MachineTable';
import { MetricsCard } from './components/MetricsCard';
import { SequencedTable } from './components/SequencedTable';

export default function App() {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [upcomingFile, setUpcomingFile] = useState<File | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [result, setResult] = useState<QCOData | null>(null);
  const [saveStatus, setSaveStatus] = useState<{success: boolean, message: string} | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'sequence'>('summary');

  // Business Logic: Comparison and Generation
  const handleGenerate = async () => {
    if (!currentFile || !upcomingFile) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setSaveStatus(null);
    setActiveTab('summary');

    try {
      // 1. Process Files
      const currentData = await parseOBFile(currentFile);
      const upcomingData = await parseOBFile(upcomingFile);

      // 2. Generate QCO Number (Dynamic)
      // Example: S-10-[CurrStyle]-[NewStyle]-[Rand]
      const qcoNumber = `S-10-${currentData.styleNumber.substring(0,4)}-${upcomingData.styleNumber.substring(0,4)}-${Math.floor(Math.random()*1000)}`;

      // 3. Machine Comparison Logic
      const allMachineTypes = new Set([
        ...Object.keys(currentData.machineCounts),
        ...Object.keys(upcomingData.machineCounts)
      ]);

      const machineSummary: MachineComparison[] = [];
      let totalNeeded = 0;
      let totalSurplus = 0;

      allMachineTypes.forEach(machine => {
        const curr = currentData.machineCounts[machine] || 0;
        const next = upcomingData.machineCounts[machine] || 0;
        const diff = next - curr;

        let status: 'OK' | 'SURPLUS' | 'NEED' = 'OK';
        if (diff > 0) {
          status = 'NEED';
          totalNeeded += diff;
        } else if (diff < 0) {
          status = 'SURPLUS';
          totalSurplus += Math.abs(diff);
        }

        machineSummary.push({
          machineType: machine,
          currentQty: curr,
          upcomingQty: next,
          diff: diff,
          status: status
        });
      });

      // 4. Construct Final Object
      const qcoData: QCOData = {
        qcoNumber,
        lineNumber: 'Line 10', // Hardcoded or could be an input
        currentStyle: currentData,
        upcomingStyle: upcomingData,
        machineSummary,
        timestamp: new Date()
      };

      setResult(qcoData);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while parsing the files.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const resp = await saveChangeoverToFirebase(result);
      setSaveStatus({
        success: resp.success,
        message: resp.message
      });
    } catch (err) {
      setSaveStatus({
        success: false,
        message: "Network error saving data."
      });
    } finally {
      setIsSaving(false);
    }
  };

  const reset = () => {
    setResult(null);
    setCurrentFile(null);
    setUpcomingFile(null);
    setSaveStatus(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">QCO Master</h1>
              <p className="text-xs text-slate-500">Operation Breakdown Parser</p>
            </div>
          </div>
          {result && (
             <button 
             onClick={reset}
             className="text-sm text-slate-500 hover:text-slate-800 font-medium"
           >
             Start New Comparison
           </button>
          )}
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center text-red-700">
            <AlertTriangle className="w-5 h-5 mr-2" />
            {error}
          </div>
        )}

        {/* Input Section - Hide if result generated to clean up view */}
        {!result && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">Import Operation Breakdowns</h2>
              <p className="text-sm text-slate-500 mt-1">Upload the OB Excel sheets for the current running style and the upcoming style.</p>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <Dropzone 
                label="Current Style OB" 
                file={currentFile} 
                onFileSelect={setCurrentFile} 
                onRemove={() => setCurrentFile(null)}
                color="blue"
              />
              <Dropzone 
                label="Upcoming Style OB (Supports Bi-Hourly)" 
                file={upcomingFile} 
                onFileSelect={setUpcomingFile} 
                onRemove={() => setUpcomingFile(null)}
                color="indigo"
              />
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end items-center">
              <button
                onClick={handleGenerate}
                disabled={!currentFile || !upcomingFile || isProcessing}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium text-white shadow-sm transition-all
                  ${!currentFile || !upcomingFile || isProcessing 
                    ? 'bg-slate-300 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95'}`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Settings className="w-4 h-4" />
                    <span>Generate Analysis</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Results Dashboard */}
        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Header + Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Changeover Analysis</h2>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-mono rounded">
                    {result.qcoNumber}
                  </span>
                  <span className="text-slate-400 text-sm">•</span>
                  <span className="text-slate-500 text-sm">
                    {result.currentStyle.styleNumber} <ArrowIcon /> {result.upcomingStyle.styleNumber}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                 <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                       onClick={() => setActiveTab('summary')}
                       className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'summary' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Summary
                    </button>
                    <button
                       onClick={() => setActiveTab('sequence')}
                       className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'sequence' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Line Plan
                    </button>
                 </div>
                 
                 <div className="h-6 w-px bg-slate-300 mx-2"></div>

                <button
                  onClick={handleSave}
                  disabled={isSaving || saveStatus?.success}
                  className={`flex items-center space-x-2 px-5 py-2 rounded-lg font-medium text-white shadow-sm transition-all
                    ${saveStatus?.success 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-slate-900 hover:bg-slate-800'}`}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : saveStatus?.success ? (
                    <Play className="w-4 h-4" /> 
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{isSaving ? 'Saving...' : saveStatus?.success ? 'Saved' : 'Save'}</span>
                </button>
              </div>
            </div>

            {/* Success Message toast */}
            {saveStatus && (
               <div className={`p-4 rounded-lg border ${saveStatus.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                 {saveStatus.message}
               </div>
            )}

            {/* Main Content Tabs */}
            {activeTab === 'summary' ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricsCard 
                    title="Current Manpower" 
                    value={result.currentStyle.manpower} 
                    icon={<Users className="w-6 h-6" />}
                    subValue={`Style: ${result.currentStyle.styleNumber}`}
                  />
                  <MetricsCard 
                    title="Upcoming Manpower" 
                    value={result.upcomingStyle.manpower} 
                    icon={<Users className="w-6 h-6" />}
                    subValue={`Style: ${result.upcomingStyle.styleNumber}`}
                    trend={result.upcomingStyle.manpower > result.currentStyle.manpower ? 'up' : 'down'}
                  />
                  <MetricsCard 
                    title="Additional Machines" 
                    value={result.machineSummary.filter(m => m.diff > 0).reduce((acc, curr) => acc + curr.diff, 0)} 
                    icon={<Settings className="w-6 h-6" />}
                    subValue="Needed for setup"
                    trend="up"
                  />
                  <MetricsCard 
                    title="Surplus Machines" 
                    value={result.machineSummary.filter(m => m.diff < 0).reduce((acc, curr) => acc + Math.abs(curr.diff), 0)} 
                    icon={<Layers className="w-6 h-6" />}
                    subValue="To be returned"
                    trend="down"
                  />
                </div>

                {/* Machine Table */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">Detailed Machine Requirement</h3>
                    <span className="text-xs text-slate-400">Based on OB extraction</span>
                  </div>
                  <MachineTable data={result.machineSummary} />
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                     <h3 className="text-sm font-semibold text-blue-800">Generated Line Plan</h3>
                     <p className="text-xs text-blue-600 mt-1">
                       Operations are grouped by sections found in Column A of the OB. 
                       The sequence is re-ordered based on the Bi-Hourly sheet mapping (if available).
                       Machine types are strictly from the OB.
                     </p>
                  </div>
                </div>
                <SequencedTable sections={result.upcomingStyle.sections} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Helper Components for clean App.tsx
const ArrowIcon = () => (
  <svg className="w-3 h-3 text-slate-400 inline mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
);