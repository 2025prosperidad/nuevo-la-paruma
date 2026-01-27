import React from 'react';
import { TrainingRecord, TrainingDecision, ReceiptType } from '../types';

interface TrainingSectionProps {
  records: TrainingRecord[];
  onDelete: (id: string) => void;
  onViewImage: (url: string) => void;
  onExport: () => void;
}

export const TrainingSection: React.FC<TrainingSectionProps> = ({
  records,
  onDelete,
  onViewImage,
  onExport
}) => {
  const getDecisionBadge = (decision: TrainingDecision) => {
    switch (decision) {
      case TrainingDecision.ACCEPT:
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">✅ ACEPTAR</span>;
      case TrainingDecision.REJECT_BLURRY:
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">⛔ BORROSO</span>;
      case TrainingDecision.REJECT_INVALID:
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">⛔ INVÁLIDO</span>;
      case TrainingDecision.REJECT_DUPLICATE:
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">⛔ DUPLICADO</span>;
      case TrainingDecision.REJECT_FRAUD:
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">⛔ FRAUDE</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">❓</span>;
    }
  };

  const getReceiptTypeLabel = (type: ReceiptType) => {
    switch (type) {
      case ReceiptType.REDEBAN_THERMAL: return '📜 Redeban';
      case ReceiptType.BANCOLOMBIA_APP: return '📱 Bancolombia';
      case ReceiptType.NEQUI: return '💜 Nequi';
      case ReceiptType.BANCO_AGRARIO: return '🌾 B. Agrario';
      case ReceiptType.DAVIVIENDA: return '🔴 Davivienda';
      case ReceiptType.BANCO_BOGOTA: return '🔵 B. Bogotá';
      case ReceiptType.OCCIDENTE: return '🟠 Occidente';
      case ReceiptType.CREDIT_CARD: return '💳 Tarjeta';
      default: return '❓ Otro';
    }
  };

  const acceptedCount = records.filter(r => r.decision === TrainingDecision.ACCEPT).length;
  const rejectedCount = records.length - acceptedCount;

  return (
    <div className="space-y-6">
      {/* ESTADÍSTICAS */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Estadísticas de Entrenamiento</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-brand-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-brand-700">{records.length}</div>
            <div className="text-sm text-brand-600">Total Registros</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-700">{acceptedCount}</div>
            <div className="text-sm text-green-600">Aceptados</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-700">{rejectedCount}</div>
            <div className="text-sm text-red-600">Rechazados</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-700">
              {records.length > 0 ? Math.round((acceptedCount / records.length) * 100) : 0}%
            </div>
            <div className="text-sm text-purple-600">Tasa Aceptación</div>
          </div>
        </div>
      </div>

      {/* HEADER CON BOTONES */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">
          🎓 Datos de Entrenamiento ({records.length})
        </h3>
        {records.length > 0 && (
          <button
            onClick={onExport}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-semibold"
          >
            📥 Exportar Dataset
          </button>
        )}
      </div>

      {/* TABLA */}
      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-6xl mb-4">🎓</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Sin datos de entrenamiento</h3>
          <p className="text-gray-600">
            Sube recibos en la pestaña de entrenamiento para empezar a mejorar la IA
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Imagen</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Decisión</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Banco</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Monto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Razón</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Entrenador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onViewImage(record.imageUrl)}
                        className="text-brand-600 hover:text-brand-800 text-sm font-medium underline"
                      >
                        Ver
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {getDecisionBadge(record.decision)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-700">
                        {getReceiptTypeLabel(record.receiptType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {record.correctData?.bankName || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      ${(record.correctData?.amount || 0).toLocaleString('es-CO')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {record.correctData?.date || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-600 max-w-xs truncate" title={record.decisionReason}>
                        {record.decisionReason}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {record.trainedBy}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onDelete(record.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INFORMACIÓN */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h4 className="font-semibold text-blue-900 mb-2">💡 Consejos para un buen entrenamiento:</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc pl-5">
          <li><strong>Variedad:</strong> Incluye diferentes tipos de recibos (Redeban, Bancolombia, Nequi, etc.)</li>
          <li><strong>Calidad:</strong> Incluye recibos claros Y borrosos para que la IA aprenda a rechazar</li>
          <li><strong>Precisión:</strong> Corrige TODOS los campos incorrectos, incluso los pequeños errores</li>
          <li><strong>Rechazos:</strong> Marca como rechazados los recibos que NO deberían aceptarse</li>
          <li><strong>Explicaciones:</strong> Escribe razones claras para ayudar a entender el criterio</li>
        </ul>
      </div>
    </div>
  );
};
