import React, { useState, useEffect } from 'react';
import { ConfigItem, AIConfig, AIModel } from '../types';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: ConfigItem[];
  convenios: ConfigItem[];
  onUpdateAccounts: (items: ConfigItem[]) => void;
  onUpdateConvenios: (items: ConfigItem[]) => void;
  onResetDefaults: () => void;
  onSyncToSheets: () => void;
  onLoadFromSheets: () => void;
  onOpenReceiptTypeConfig?: () => void;
  // AI Configuration
  aiConfig?: AIConfig;
  onSaveAIConfig?: (config: AIConfig) => void;
  cacheStats?: { size: number; oldestTimestamp: number | null };
  onClearCache?: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  accounts,
  convenios,
  onUpdateAccounts,
  onUpdateConvenios,
  onResetDefaults,
  onSyncToSheets,
  onLoadFromSheets,
  onOpenReceiptTypeConfig,
  aiConfig,
  onSaveAIConfig,
  cacheStats,
  onClearCache
}) => {
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'CONVENIOS' | 'AI'>('ACCOUNTS');
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');

  // Local AI config state
  const [localAIConfig, setLocalAIConfig] = useState<AIConfig>(aiConfig || {
    preferredModel: AIModel.GEMINI,
    enableCache: true,
    cacheExpiration: 720,
    useTrainingExamples: true,
    maxTrainingExamples: 10
  });

  // Update local config when prop changes
  useEffect(() => {
    if (aiConfig) {
      setLocalAIConfig(aiConfig);
    }
  }, [aiConfig]);

  // Reset inputs when tab changes
  useEffect(() => {
    setNewValue('');
    setNewLabel('');
  }, [activeTab]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newValue.trim()) return;

    const newItem: ConfigItem = {
      id: crypto.randomUUID(),
      value: newValue.trim(),
      label: newLabel.trim() || 'Sin descripción',
      type: activeTab === 'ACCOUNTS' ? 'ACCOUNT' : 'CONVENIO'
    };

    if (activeTab === 'ACCOUNTS') {
      onUpdateAccounts([...accounts, newItem]);
    } else {
      onUpdateConvenios([...convenios, newItem]);
    }

    setNewValue('');
    setNewLabel('');
  };

  const handleDelete = (id: string) => {
    if (activeTab === 'ACCOUNTS') {
      onUpdateAccounts(accounts.filter(i => i.id !== id));
    } else {
      onUpdateConvenios(convenios.filter(i => i.id !== id));
    }
  };

  const currentList = activeTab === 'ACCOUNTS' ? accounts : convenios;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Configuración</h2>
            <p className="text-sm text-gray-500">Administra las cuentas y convenios permitidos</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('ACCOUNTS')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'ACCOUNTS'
              ? 'border-b-2 border-brand-600 text-brand-600 bg-blue-50/50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            Cuentas Bancarias ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('CONVENIOS')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'CONVENIOS'
              ? 'border-b-2 border-brand-600 text-brand-600 bg-blue-50/50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            Convenios de Recaudo ({convenios.length})
          </button>
          <button
            onClick={() => setActiveTab('AI')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'AI'
              ? 'border-b-2 border-brand-600 text-brand-600 bg-blue-50/50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            🤖 Configuración de IA
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* AI Configuration Tab */}
          {activeTab === 'AI' && onSaveAIConfig && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">⚙️ Sistema Multi-Modelo</h3>
                <p className="text-sm text-blue-700">
                  Configura qué modelo de IA usar para analizar recibos. El sistema soporta Gemini, GPT-4o-mini, o consenso entre ambos.
                </p>
              </div>

              {/* Model Selection */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Modelo Preferido
                </label>
                <select
                  value={localAIConfig.preferredModel}
                  onChange={(e) => setLocalAIConfig({ ...localAIConfig, preferredModel: e.target.value as AIModel })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value={AIModel.GEMINI}>🔷 Gemini 1.5 Flash (Rápido y económico)</option>
                  <option value={AIModel.GPT4_MINI}>🟢 GPT-4o-mini (Más preciso)</option>
                  <option value={AIModel.CONSENSUS}>🔄 Consenso (Ambos modelos - máxima precisión)</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {localAIConfig.preferredModel === AIModel.GEMINI && '⚡ Rápido y económico. Recomendado para uso general.'}
                  {localAIConfig.preferredModel === AIModel.GPT4_MINI && '🎯 Mayor precisión. Recomendado para recibos complejos.'}
                  {localAIConfig.preferredModel === AIModel.CONSENSUS && '🔒 Máxima precisión. Usa ambos modelos y compara resultados.'}
                </p>
              </div>

              {/* Cache Settings */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-gray-700">
                    Sistema de Caché
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localAIConfig.enableCache}
                      onChange={(e) => setLocalAIConfig({ ...localAIConfig, enableCache: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Guarda resultados de análisis para evitar re-analizar la misma imagen. Ahorra tiempo y costos de API.
                </p>
                {cacheStats && (
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Imágenes en caché:</span>
                      <span className="font-mono font-semibold">{cacheStats.size}</span>
                    </div>
                    {onClearCache && cacheStats.size > 0 && (
                      <button
                        onClick={onClearCache}
                        className="w-full mt-2 px-3 py-1.5 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100"
                      >
                        🗑️ Limpiar Caché
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Training Settings */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-gray-700">
                    Usar Ejemplos de Entrenamiento
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localAIConfig.useTrainingExamples}
                      onChange={(e) => setLocalAIConfig({ ...localAIConfig, useTrainingExamples: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Incluye ejemplos de entrenamientos previos en el análisis para mejorar la precisión.
                </p>
                {localAIConfig.useTrainingExamples && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      Máximo de ejemplos a usar:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={localAIConfig.maxTrainingExamples}
                      onChange={(e) => setLocalAIConfig({ ...localAIConfig, maxTrainingExamples: parseInt(e.target.value) || 10 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                )}
              </div>

              {/* Save Button */}
              <button
                onClick={() => {
                  onSaveAIConfig(localAIConfig);
                  alert('✅ Configuración de IA guardada exitosamente');
                }}
                className="w-full px-4 py-3 bg-brand-600 text-white rounded-md font-medium hover:bg-brand-700 transition-colors"
              >
                💾 Guardar Configuración de IA
              </button>
            </div>
          )}

          {/* Accounts/Convenios Tab Content */}
          {activeTab !== 'AI' && (
            <>
              {/* Add New Form */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Agregar Nuevo</h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      placeholder={activeTab === 'ACCOUNTS' ? "Número de Cuenta" : "Código de Convenio"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      placeholder="Descripción (Opcional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <button
                      onClick={handleAdd}
                      disabled={!newValue.trim()}
                      className="w-full px-3 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>

              {/* List */}
              <div className="space-y-2">
                {currentList.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 italic">No hay elementos configurados</p>
                ) : (
                  currentList.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:shadow-sm transition-shadow group">
                      <div className="flex flex-col">
                        <span className="font-mono font-medium text-gray-900">{item.value}</span>
                        <span className="text-xs text-gray-500">{item.label}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                        title="Eliminar"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <button
              onClick={() => {
                if (window.confirm('¿Estás seguro de restaurar los valores predeterminados? Se borrarán tus cambios personalizados.')) {
                  onResetDefaults();
                }
              }}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Restaurar valores por defecto
            </button>
          </div>

          <div className="flex gap-3">
            {onOpenReceiptTypeConfig && (
              <button
                onClick={onOpenReceiptTypeConfig}
                className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                ⚙️ Tipos de Recibo
              </button>
            )}

            <button
              onClick={() => {
                if (window.confirm('¿Cargar configuración desde Google Sheets? Esto sobrescribirá la configuración local.')) {
                  onLoadFromSheets();
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Cargar desde Sheets
            </button>

            <button
              onClick={() => {
                if (window.confirm('¿Guardar la configuración actual en Google Sheets? Esto sobrescribirá los datos en la hoja "Cuentas".')) {
                  onSyncToSheets();
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Guardar en Sheets
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};