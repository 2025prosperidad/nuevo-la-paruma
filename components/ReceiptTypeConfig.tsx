import React, { useState, useEffect } from 'react';
import { ReceiptType, ReceiptTypeConfig } from '../types';

interface ReceiptTypeConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (configs: ReceiptTypeConfig[]) => void;
  initialConfigs?: ReceiptTypeConfig[];
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
  initialConfigs = []
}) => {
  const [configs, setConfigs] = useState<ReceiptTypeConfig[]>((initialConfigs && initialConfigs.length > 0) ? initialConfigs : DEFAULT_CONFIGS);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeLabel, setNewTypeLabel] = useState('');

  useEffect(() => {
    if (initialConfigs && initialConfigs.length > 0) {
      setConfigs(initialConfigs);
    }
  }, [initialConfigs]);

  const handleAddCustomType = () => {
    if (!newTypeName.trim() || !newTypeLabel.trim()) return;

    const typeId = newTypeName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') as ReceiptType;
    if (configs.some(c => c.type === typeId)) {
      alert('Ya existe un tipo de recibo con ese identificador');
      return;
    }

    const newConfig: ReceiptTypeConfig = {
      type: typeId,
      label: newTypeLabel.trim(),
      isAccepted: true,
      minQualityScore: 60,
      requiresPhysicalReceipt: false,
      notes: ''
    };

    setConfigs(prev => [...prev, newConfig]);
    setNewTypeName('');
    setNewTypeLabel('');
  };

  const handleDeleteType = (type: ReceiptType) => {
    if (confirm(`¿Estás seguro de eliminar el tipo de recibo "${type}"?`)) {
      setConfigs(prev => prev.filter(c => c.type !== type));
    }
  };

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
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">⚙️ Configuración de Tipos de Recibo</h2>
              <p className="text-sm text-gray-600 mt-1">Configura y añade nuevos tipos de recibo para el sistema</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {/* Add New Section */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">🆕 Agregar Nuevo Tipo de Recibo</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="ID (Ej: BANCO_BOGOTA_APP)"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Etiqueta (Ej: 🏦 Bogotá App)"
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={handleAddCustomType}
                disabled={!newTypeName || !newTypeLabel}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm font-semibold"
              >
                + Agregar Tipo
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {configs.map((config) => (
              <div key={config.type} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={config.isAccepted}
                          onChange={(e) => updateConfig(config.type, { isAccepted: e.target.checked })}
                          className="w-5 h-5 text-brand-600 rounded focus:ring-2 focus:ring-brand-500"
                        />
                        <span className="text-lg font-bold text-gray-900">{config.label}</span>
                        {!config.isAccepted && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold rounded uppercase">Rechazado</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteType(config.type)}
                        className="text-gray-400 hover:text-red-500"
                        title="Eliminar"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    <div className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded w-fit">
                      ID: {config.type}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Calidad Mínima ({config.minQualityScore})</label>
                        <input
                          type="range" min="0" max="100"
                          value={config.minQualityScore}
                          onChange={(e) => updateConfig(config.type, { minQualityScore: parseInt(e.target.value) || 0 })}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                          disabled={!config.isAccepted}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.requiresPhysicalReceipt}
                          onChange={(e) => updateConfig(config.type, { requiresPhysicalReceipt: e.target.checked })}
                          className="rounded text-brand-600"
                          disabled={!config.isAccepted}
                        />
                        <label className="text-sm text-gray-700">Requiere recibo físico (RRN/RECIBO)</label>
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1">Notas y Requisitos</label>
                    <textarea
                      value={config.notes}
                      onChange={(e) => updateConfig(config.type, { notes: e.target.value })}
                      className="flex-1 w-full p-3 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-500 min-h-[100px]"
                      placeholder="Describe qué datos buscar..."
                      disabled={!config.isAccepted}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-8 p-4 bg-brand-50 rounded-xl border border-brand-100 flex items-center justify-between">
            <div className="text-brand-900">
              <span className="font-bold">{configs.length}</span> tipos de recibo configurados
            </div>
            <div className="flex gap-4 text-sm font-medium">
              <span className="text-green-700">{configs.filter(c => c.isAccepted).length} Aceptados</span>
              <span className="text-red-700">{configs.filter(c => !c.isAccepted).length} Rechazados</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 border-t border-gray-200 p-6 flex justify-between sticky bottom-0 z-20">
          <button onClick={handleReset} className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">
            🔄 Restaurar Predeterminados
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-200 text-gray-700 font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} className="px-8 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-bold shadow-lg shadow-brand-200 transition-all">
              💾 Guardar y Sincronizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
