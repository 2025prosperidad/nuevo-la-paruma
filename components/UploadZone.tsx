import React from 'react';
import { ProcessingStatus } from '../types';

interface UploadZoneProps {
  onFileSelect: (files: File[]) => void;
  status: ProcessingStatus;
  isSystemLoading?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, status, isSystemLoading }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(Array.from(e.target.files));
      // Reset value so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  const isLoading = status === ProcessingStatus.ANALYZING;
  const isRestricted = isSystemLoading && !isLoading;

  return (
    <div className="w-full">
      <label
        htmlFor="file-upload"
        className={`relative block w-full rounded-xl border-2 border-dashed p-12 text-center transition-colors duration-200 ${isLoading || isRestricted
            ? 'border-gray-300 bg-gray-50 opacity-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-brand-500 hover:bg-brand-50 cursor-pointer focus:outline-none'
          }`}
      >
        {isLoading ? (
          <div className="flex flex-col items-center">
            <svg className="animate-spin h-10 w-10 text-brand-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-medium text-gray-900">Analizando imágenes con IA...</span>
          </div>
        ) : isRestricted ? (
          <div className="flex flex-col items-center">
            <svg className="animate-spin h-10 w-10 text-brand-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-medium text-gray-500">Sincronizando configuraciones...</span>
            <p className="text-xs text-gray-400 mt-2">Espera un momento mientras cargamos los entrenamientos y cuentas.</p>
          </div>
        ) : (
          <>
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-4 flex text-sm text-gray-600 justify-center">
              <span className="relative font-medium text-brand-600 rounded-md">
                Sube fotos
              </span>
              <p className="pl-1">o arrastra y suelta</p>
            </div>
            <p className="text-xs text-gray-500">JPG, PNG, WEBP, GIF, HEIC hasta 20MB (Se comprimen automáticamente)</p>
          </>
        )}
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          className="sr-only"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          disabled={isLoading || isRestricted}
        />
      </label>
    </div>
  );
};