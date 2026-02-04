import React from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';

interface DropzoneProps {
  label: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  color: 'blue' | 'indigo';
}

export const Dropzone: React.FC<DropzoneProps> = ({ label, file, onFileSelect, onRemove, color }) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const borderColor = color === 'blue' ? 'border-blue-300 hover:border-blue-400' : 'border-indigo-300 hover:border-indigo-400';
  const bgColor = color === 'blue' ? 'bg-blue-50' : 'bg-indigo-50';
  const textColor = color === 'blue' ? 'text-blue-600' : 'text-indigo-600';

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      
      {!file ? (
        <div 
          className={`relative border-2 border-dashed ${borderColor} ${bgColor} rounded-lg p-6 flex flex-col items-center justify-center transition-all cursor-pointer h-40`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input 
            type="file" 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
            accept=".xlsx, .xls, .csv"
            onChange={handleChange}
          />
          <Upload className={`w-10 h-10 ${textColor} mb-2`} />
          <p className="text-sm text-gray-500 font-medium">Drag & drop or click to upload</p>
          <p className="text-xs text-gray-400 mt-1">Excel (.xlsx)</p>
        </div>
      ) : (
        <div className={`relative border border-solid border-gray-200 bg-white rounded-lg p-4 flex items-center justify-between shadow-sm h-40`}>
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className={`p-2 rounded-lg ${bgColor}`}>
              <FileSpreadsheet className={`w-8 h-8 ${textColor}`} />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button 
            onClick={onRemove}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400 hover:text-red-500" />
          </button>
        </div>
      )}
    </div>
  );
};