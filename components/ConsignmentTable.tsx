import React from 'react';
import { ConsignmentRecord, ValidationStatus } from '../types';

interface ConsignmentTableProps {
  records: ConsignmentRecord[];
  onDelete: (id: string) => void;
  onViewImage: (url: string) => void;
}

export const ConsignmentTable: React.FC<ConsignmentTableProps> = ({ records, onDelete, onViewImage }) => {
  
  // Helper: Convert Google Drive URL to viewable format
  const getViewableImageUrl = (url: string): string => {
    if (!url) return '';
    
    // If it's already base64, return as is
    if (url.startsWith('data:image')) {
      return url;
    }
    
    // If it's a Google Drive URL, convert to direct view format
    if (url.includes('drive.google.com')) {
      // Extract file ID from various Drive URL formats
      const fileIdMatch = url.match(/\/file\/d\/([^\/]+)/);
      const idMatch = url.match(/id=([^&]+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : (idMatch ? idMatch[1] : null);
      
      if (fileId) {
        // Use Google Drive thumbnail API for preview
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
      }
    }
    
    return url;
  };
  
  const getStatusBadge = (status: ValidationStatus, message: string) => {
    switch (status) {
      case ValidationStatus.VALID:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800">Aprobado</span>;
      case ValidationStatus.DUPLICATE:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800" title={message}>Duplicado</span>;
      case ValidationStatus.INVALID_ACCOUNT:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800" title={message}>Cuenta Inválida</span>;
      case ValidationStatus.LOW_QUALITY:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-gray-200 text-gray-700" title={message}>Ilegible</span>;
      default:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800">Error</span>;
    }
  };

  if (records.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
        <p className="text-gray-500">No hay datos.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Img</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha/Hora</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID Transacción</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Ref Pago (Cliente)</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Destino</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-sm">
            {records.map((record) => (
              <tr key={record.id} className={`hover:bg-gray-50 ${record.status !== ValidationStatus.VALID ? 'bg-red-50/40' : ''}`}>
                <td className="px-4 py-3">
                  {record.imageUrl ? (
                    <div 
                      className="h-12 w-12 rounded overflow-hidden border border-gray-200 bg-gray-100 cursor-zoom-in relative group"
                      onClick={() => onViewImage(record.imageUrl)}
                      title="Click para ver imagen completa"
                    >
                      <img 
                        className="h-full w-full object-cover" 
                        src={getViewableImageUrl(record.imageUrl)} 
                        alt="Recibo"
                        onError={(e) => {
                          // Si falla la carga de miniatura, intentar con URL original
                          (e.target as HTMLImageElement).src = record.imageUrl;
                        }}
                      />
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded border border-gray-300 bg-gray-50 flex items-center justify-center">
                      <span className="text-xs text-gray-400">Sin img</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{record.date || 'N/A'}</div>
                  <div className="text-xs text-gray-500">{record.time || '--:--'}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {record.uniqueTransactionId ? (
                     <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                       {record.uniqueTransactionId}
                     </span>
                  ) : (
                    <span className="text-xs text-gray-400 italic">No detectado</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                  {record.paymentReference || '-'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate" title={record.accountOrConvenio}>
                  {record.bankName}<br/>
                  {record.accountOrConvenio}
                </td>
                <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                  {record.amount 
                    ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(record.amount)
                    : '$0'}
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(record.status, record.statusMessage)}
                  {record.status !== ValidationStatus.VALID && (
                     <div className="text-xs text-red-500 mt-1 max-w-[180px] leading-tight">{record.statusMessage}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(record.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};