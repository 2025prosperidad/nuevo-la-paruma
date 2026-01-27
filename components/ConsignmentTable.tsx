import React from 'react';
import { ConsignmentRecord, ValidationStatus, ConfigItem } from '../types';
import { CERVECERIA_UNION_CLIENT_CODE, normalizeAccount, KNOWN_CLIENTS } from '../constants';

interface ConsignmentTableProps {
  records: ConsignmentRecord[];
  onDelete: (id: string) => void;
  onViewImage: (url: string) => void;
  onAuthorize?: (id: string) => void; // Para autorización
  onVerifyNumbers?: (id: string) => void; // Para verificación de números
  onTrain?: (record: ConsignmentRecord) => void; // Para entrenamiento de IA
  accounts?: ConfigItem[]; // Cuentas autorizadas para mostrar etiquetas
  convenios?: ConfigItem[]; // Convenios autorizados para mostrar etiquetas
}

export const ConsignmentTable: React.FC<ConsignmentTableProps> = ({ records, onDelete, onViewImage, onAuthorize, onVerifyNumbers, onTrain, accounts = [], convenios = [] }) => {
  
  // Helper: Buscar etiqueta de cuenta/convenio
  const getAccountLabel = (accountNumber: string | null | undefined): { number: string; label: string } | null => {
    if (!accountNumber) return null;
    
    const normalized = normalizeAccount(accountNumber);
    
    // Buscar en cuentas
    const foundAccount = accounts.find(acc => normalizeAccount(acc.value) === normalized);
    if (foundAccount) {
      return { number: accountNumber, label: foundAccount.label || 'Cuenta Autorizada' };
    }
    
    // Buscar en convenios
    const foundConvenio = convenios.find(conv => normalizeAccount(conv.value) === normalized);
    if (foundConvenio) {
      return { number: accountNumber, label: foundConvenio.label || 'Convenio Autorizado' };
    }
    
    return { number: accountNumber, label: '' };
  };
  
  // Helper: Convert Google Drive URL to viewable format
  const getViewableImageUrl = (url: string): string => {
    if (!url) return '';
    
    // If it's already base64, return as is
    if (url.startsWith('data:image')) {
      return url;
    }
    
    // If it's a Google Drive URL, convert to direct view format
    if (url.includes('drive.google.com')) {
      const fileIdMatch = url.match(/\/file\/d\/([^\/]+)/);
      const idMatch = url.match(/id=([^&]+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : (idMatch ? idMatch[1] : null);
      
      if (fileId) {
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
      }
    }
    
    return url;
  };
  
  const getStatusBadge = (status: ValidationStatus, message: string) => {
    switch (status) {
      case ValidationStatus.VALID:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800">✓ Aprobado</span>;
      case ValidationStatus.DUPLICATE:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800" title={message}>⚠️ Duplicado</span>;
      case ValidationStatus.INVALID_ACCOUNT:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800" title={message}>⛔ Cuenta Inválida</span>;
      case ValidationStatus.LOW_QUALITY:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-gray-200 text-gray-700" title={message}>📷 Ilegible</span>;
      case ValidationStatus.MISSING_DATE:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800" title={message}>📅 Sin Fecha</span>;
      case ValidationStatus.MISSING_RECEIPT_NUMBER:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-orange-100 text-orange-800" title={message}>🧾 Sin Recibo</span>;
      case ValidationStatus.LOW_CONFIDENCE:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800" title={message}>⚠️ Números Dudosos</span>;
      case ValidationStatus.REQUIRES_AUTHORIZATION:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800" title={message}>📝 Req. Autorización</span>;
      case ValidationStatus.PENDING_VERIFICATION:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800" title={message}>🔍 Verificar Números</span>;
      default:
        return <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800">❌ Error</span>;
    }
  };

  // Helper: Check if record needs authorization button
  const needsAuthorization = (status: ValidationStatus) => {
    return status === ValidationStatus.REQUIRES_AUTHORIZATION || 
           status === ValidationStatus.MISSING_RECEIPT_NUMBER;
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
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Lugar de Consignación</th>
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
                          (e.target as HTMLImageElement).src = record.imageUrl;
                        }}
                      />
                      {/* Indicador de captura de pantalla */}
                      {record.isScreenshot && (
                        <div className="absolute top-0 right-0 bg-blue-500 text-white text-[8px] px-1 rounded-bl">
                          📱
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded border border-gray-300 bg-gray-50 flex items-center justify-center">
                      <span className="text-xs text-gray-400">Sin img</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{record.date || <span className="text-red-500 font-bold">SIN FECHA</span>}</div>
                  <div className="text-xs text-gray-500">{record.time || '--:--'}</div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    // Mostrar TODOS los números únicos disponibles
                    const ids = [];
                    if (record.rrn) ids.push({ label: 'RRN', value: record.rrn });
                    if (record.recibo) ids.push({ label: 'RECIBO', value: record.recibo });
                    if (record.apro) ids.push({ label: 'APRO', value: record.apro });
                    if (record.operacion) ids.push({ label: 'OP', value: record.operacion });
                    if (record.comprobante) ids.push({ label: 'COMP', value: record.comprobante });
                    if (record.uniqueTransactionId && !ids.some(id => id.value === record.uniqueTransactionId)) {
                      ids.push({ label: 'ID', value: record.uniqueTransactionId });
                    }
                    
                    if (ids.length === 0) {
                      return (
                        <div>
                          <span className="text-xs text-red-500 italic font-medium">⚠️ Sin número de recibo</span>
                          {record.isScreenshot && (
                            <div className="text-[10px] text-gray-400 mt-1">Captura de pantalla</div>
                          )}
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-1">
                        {ids.map((id, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">{id.label}:</span>
                            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                              {id.value}
                            </span>
                          </div>
                        ))}
                        {/* Indicador de confianza */}
                        {record.confidenceScore !== undefined && record.confidenceScore < 90 && (
                          <div className="text-[10px] text-amber-600">
                            ⚠️ Confianza: {record.confidenceScore}%
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const ref = record.paymentReference;
                    if (!ref) return <span className="text-gray-400">-</span>;
                    
                    // Buscar si es un cliente conocido
                    const normalizedRef = normalizeAccount(ref);
                    const knownClientName = Object.entries(KNOWN_CLIENTS).find(
                      ([code]) => normalizeAccount(code) === normalizedRef
                    )?.[1];
                    
                    // Buscar etiqueta de cuenta si no es cliente conocido
                    const refInfo = getAccountLabel(ref);
                    
                    return (
                      <div>
                        <div className="font-mono text-gray-900 font-medium">{ref}</div>
                        {knownClientName ? (
                          <div className="text-xs text-amber-600 font-medium mt-0.5">
                            🍺 {knownClientName}
                          </div>
                        ) : refInfo?.label && (
                          <div className="text-xs text-green-600 mt-0.5">{refInfo.label}</div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-xs max-w-[200px]">
                  {/* Mostrar Banco + Ciudad */}
                  <div className="font-medium text-gray-900">{record.bankName || 'Desconocido'}</div>
                  {record.city && (
                    <div className="text-gray-500 mt-0.5">📍 {record.city}</div>
                  )}
                  {(() => {
                    const accInfo = getAccountLabel(record.accountOrConvenio);
                    if (!accInfo) return <div className="text-gray-400">-</div>;
                    
                    return (
                      <div className="mt-1">
                        <div className="font-mono text-gray-700">{accInfo.number}</div>
                        {accInfo.label && (
                          <div className="text-green-600 font-medium">{accInfo.label}</div>
                        )}
                      </div>
                    );
                  })()}
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
                  {/* Botón de autorización para capturas sin recibo */}
                  {needsAuthorization(record.status) && onAuthorize && (
                    <button
                      onClick={() => onAuthorize(record.id)}
                      className="mt-2 w-full px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
                    >
                      📎 Subir Autorización
                    </button>
                  )}
                  {/* Botón de verificación de números */}
                  {record.status === ValidationStatus.PENDING_VERIFICATION && onVerifyNumbers && (
                    <button
                      onClick={() => onVerifyNumbers(record.id)}
                      className="mt-2 w-full px-2 py-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 transition-colors flex items-center justify-center gap-1"
                    >
                      🔍 Verificar Números
                    </button>
                  )}
                  {/* Botón de entrenamiento - siempre disponible */}
                  {onTrain && (
                    <button
                      onClick={() => onTrain(record)}
                      className="mt-2 w-full px-2 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 transition-colors flex items-center justify-center gap-1"
                      title="Entrenar la IA con este recibo"
                    >
                      🎓 Entrenar IA
                    </button>
                  )}
                  {/* Mostrar si ya tiene autorización */}
                  {record.authorizationUrl && (
                    <div className="mt-1 text-xs text-green-600 flex items-center gap-1">
                      ✓ Autorizado
                      {record.authorizedBy && <span>por {record.authorizedBy}</span>}
                    </div>
                  )}
                  {/* Mostrar si fue verificado */}
                  {record.verifiedNumbers && (
                    <div className="mt-1 text-xs text-green-600 flex items-center gap-1">
                      ✓ Verificado
                      {record.verifiedBy && <span>por {record.verifiedBy}</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(record.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    title="Eliminar registro"
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
