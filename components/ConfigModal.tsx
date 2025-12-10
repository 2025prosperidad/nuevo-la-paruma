import React, { useState, useEffect } from 'react';
import { ConfigItem } from '../types';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: ConfigItem[];
  convenios: ConfigItem[];
  onUpdateAccounts: (items: ConfigItem[]) => void;
  onUpdateConvenios: (items: ConfigItem[]) => void;
  onResetDefaults: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  accounts,
  convenios,
  onUpdateAccounts,
  onUpdateConvenios,
  onResetDefaults
}) => {
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'CONVENIOS'>('ACCOUNTS');
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');

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
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'ACCOUNTS' 
                ? 'border-b-2 border-brand-600 text-brand-600 bg-blue-50/50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Cuentas Bancarias ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('CONVENIOS')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'CONVENIOS' 
                ? 'border-b-2 border-brand-600 text-brand-600 bg-blue-50/50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Convenios de Recaudo ({convenios.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
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
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
            <button 
                onClick={() => {
                    if(window.confirm('¿Estás seguro de restaurar los valores predeterminados? Se borrarán tus cambios personalizados.')) {
                        onResetDefaults();
                    }
                }}
                className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
                Restaurar valores por defecto
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
  );
};