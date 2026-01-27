import React, { useState, useEffect } from 'react';
import { ReceiptType, ReceiptTypeConfig } from '../types';

interface ReceiptTypeConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (configs: ReceiptTypeConfig[]) => void;
  initialConfigs: ReceiptTypeConfig[];
}

const DEFAULT_CONFIGS: ReceiptTypeConfig[] = [
  {
    type: ReceiptType.REDEBAN_THERMAL,
    label: '📜 Redeban (Térmico)',
    isAccepted: true,
    minQualityScore: 65,
    requiresPhysicalReceipt: true,
    notes: 'Recibos térmicos requieren buena calidad. Deben tener RRN, RECIBO y APRO.'
  },
  {
    type: ReceiptType.BANCOLOMBIA_APP,
    label: '📱 Bancolombia App',
    isAccepted: true,
    minQualityScore: 60,
    requiresPhysicalReceipt: false,
    notes: 'Capturas de app aceptadas con número de comprobante.'
  },
  {
    type: ReceiptType.NEQUI,
    label: '💜 Nequi',
    isAccepted: true,
    minQualityScore: 60,
    requiresPhysicalReceipt: false,
    notes: 'Capturas de Nequi aceptadas con número de transacción.'
  },
  {
    type: ReceiptType.BANCO_AGRARIO,
    label: '🌾 Banco Agrario',
    isAccepted: true,
    minQualityScore: 60,
    requiresPhysicalReceipt: true,
    notes: 'Recibos del Banco Agrario con número de operación.'
  },
  {
    type: ReceiptType.DAVIVIENDA,
    label: '🔴 Davivienda',
    isAccepted: true,
    minQualityScore: 60,
    requiresPhysicalReceipt: false,
    notes: 'Recibos de Davivienda con número de transacción.'
  },
  {
    type: ReceiptType.BANCO_BOGOTA,
    label: '🔵 Banco de Bogotá',
    isAccepted: true,
    minQualityScore: 60,
    requiresPhysicalReceipt: true,
    notes: 'Comprobantes de recaudos con formato Srv XXXX AQXXXXXX.'
  },
  {
    type: ReceiptType.OCCIDENTE,
    label: '🟠 Banco de Occidente',
    isAccepted: true,
    minQualityScore: 60,
    requiresPhysicalReceipt: false,
    notes: 'Recibos del Banco de Occidente.'
  },
  {
    type: ReceiptType.CREDIT_CARD,
    label: '💳 Tarjeta de Crédito',
    isAccepted: true,
    minQualityScore: 60,
    requiresPhysicalReceipt: false,
    notes: 'Pagos con tarjeta de crédito autorizada (últimos 4 dígitos).'
  },
  {
    type: ReceiptType.OTHER,
    label: '❓ Otro Tipo',
    isAccepted: false,
    minQualityScore: 70,
    requiresPhysicalReceipt: true,
    notes: 'Otros tipos de recibo no categorizados. Revisar manualmente.'
  }
];

export const ReceiptTypeConfigModal: React.FC<ReceiptTypeConfigProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfigs
}) => {
  const [configs, setConfigs] = useState<ReceiptTypeConfig[]>(initialConfigs.length > 0 ? initialConfigs : DEFAULT_CONFIGS);

  useEffect(() => {
    if (initialConfigs.length > 0) {
      setConfigs(initialConfigs);
    }
  }, [initialConfigs]);

  const updateConfig = (type: ReceiptType, updates: Partial<ReceiptTypeConfig>) => {
    setConfigs(prev => prev.map(config => 
      config.type === type ? { ...config, ...updates } : config
    ));
  };

  const handleSave = () => {
    onSave(configs);
    onClose();
  };

  const handleReset = () => {
    if (confirm('¿Restaurar configuración por defecto?')) {
      setConfigs(DEFAULT_CONFIGS);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">⚙️ Configuración de Tipos de Recibo</h2>
              <p className="text-sm text-gray-600 mt-1">
                Configura qué tipos de recibo acepta el sistema y sus requisitos de calidad
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Importante:</h3>
            <p className="text-sm text-yellow-800">
              Esta configuración determina qué recibos son aceptados automáticamente. Los recibos que no cumplan 
              los requisitos serán rechazados o requerirán autorización manual.
            </p>
          </div>

          <div className="space-y-4">
            {configs.map((config) => (
              <div key={config.type} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Columna Izquierda */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={config.isAccepted}
                        onChange={(e) => updateConfig(config.type, { isAccepted: e.target.checked })}
                        className="w-5 h-5 text-brand-600 rounded focus:ring-2 focus:ring-brand-500"
                      />
                      <label className="text-lg font-semibold text-gray-900">
                        {config.label}
                      </label>
                      {!config.isAccepted && (
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                          RECHAZADO
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Calidad Mínima Requerida (0-100)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={config.minQualityScore}
                        onChange={(e) => updateConfig(config.type, { minQualityScore: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                        disabled={!config.isAccepted}
                      />
                      <div className="mt-1 text-xs text-gray-500">
                        {config.minQualityScore < 50 && '🔴 Muy bajo - Casi todos aceptados'}
                        {config.minQualityScore >= 50 && config.minQualityScore < 65 && '🟡 Bajo - Mayoría aceptados'}
                        {config.minQualityScore >= 65 && config.minQualityScore < 75 && '🟢 Normal - Balance'}
                        {config.minQualityScore >= 75 && '🔵 Alto - Solo recibos claros'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.requiresPhysicalReceipt}
                        onChange={(e) => updateConfig(config.type, { requiresPhysicalReceipt: e.target.checked })}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-2 focus:ring-brand-500"
                        disabled={!config.isAccepted}
                      />
                      <label className="text-sm text-gray-700">
                        Requiere número de recibo físico (RRN/RECIBO/APRO)
                      </label>
                    </div>
                  </div>

                  {/* Columna Derecha */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                    <textarea
                      value={config.notes}
                      onChange={(e) => updateConfig(config.type, { notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 text-sm min-h-[100px]"
                      placeholder="Notas sobre este tipo de recibo..."
                      disabled={!config.isAccepted}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* RESUMEN */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📊 Resumen:</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• <strong>Tipos Aceptados:</strong> {configs.filter(c => c.isAccepted).length} de {configs.length}</p>
              <p>• <strong>Tipos Rechazados:</strong> {configs.filter(c => !c.isAccepted).length}</p>
              <p>• <strong>Requieren recibo físico:</strong> {configs.filter(c => c.isAccepted && c.requiresPhysicalReceipt).length}</p>
            </div>
          </div>
        </div>

        {/* BOTONES */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-between">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-sm"
          >
            🔄 Restaurar Defaults
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-semibold"
            >
              💾 Guardar Configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
