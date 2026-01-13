import React, { useState, useEffect } from 'react';
import { ConsignmentRecord } from '../types';

interface VerifyNumbersModalProps {
  isOpen: boolean;
  record: ConsignmentRecord | null;
  onClose: () => void;
  onVerify: (verifiedData: {
    operacion?: string;
    rrn?: string;
    recibo?: string;
    apro?: string;
    comprobante?: string;
    verifiedBy: string;
  }) => void;
}

export const VerifyNumbersModal: React.FC<VerifyNumbersModalProps> = ({
  isOpen,
  record,
  onClose,
  onVerify
}) => {
  const [operacion, setOperacion] = useState('');
  const [rrn, setRrn] = useState('');
  const [recibo, setRecibo] = useState('');
  const [apro, setApro] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset form when record changes
  useEffect(() => {
    if (record) {
      setOperacion(record.operacion || '');
      setRrn(record.rrn || '');
      setRecibo(record.recibo || '');
      setApro(record.apro || '');
      setComprobante(record.comprobante || '');
      setVerifiedBy('');
      setError(null);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleSubmit = () => {
    if (!verifiedBy.trim()) {
      setError('Por favor ingresa tu nombre para confirmar la verificación');
      return;
    }

    // Verificar que al menos un número de transacción esté presente
    if (!operacion && !rrn && !recibo && !apro && !comprobante) {
      setError('Debe haber al menos un número de transacción');
      return;
    }

    onVerify({
      operacion: operacion.trim() || undefined,
      rrn: rrn.trim() || undefined,
      recibo: recibo.trim() || undefined,
      apro: apro.trim() || undefined,
      comprobante: comprobante.trim() || undefined,
      verifiedBy: verifiedBy.trim()
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-amber-500 text-white px-6 py-4 flex-shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            🔍 Verificación Manual de Números
          </h2>
          <p className="text-sm text-amber-100 mt-1">
            Compare los números detectados con la imagen y corrija si es necesario
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Imagen del recibo */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">📷 Imagen del Recibo</h3>
              <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                {record.imageUrl && (
                  <img 
                    src={record.imageUrl} 
                    alt="Recibo" 
                    className="w-full h-auto max-h-[400px] object-contain"
                  />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ⚠️ Verifique cuidadosamente cada dígito. La IA puede confundir: 3↔8, 1↔7, 0↔6
              </p>
            </div>

            {/* Formulario de verificación */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">✏️ Números Detectados (edite si hay error)</h3>
              
              <div className="space-y-4">
                {/* Número de Operación */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Operación
                  </label>
                  <input
                    type="text"
                    value={operacion}
                    onChange={(e) => setOperacion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-lg"
                    placeholder="Ej: 292652533"
                  />
                  {record.operacion && operacion !== record.operacion && (
                    <p className="text-xs text-amber-600 mt-1">
                      Original detectado: <span className="font-mono line-through">{record.operacion}</span>
                    </p>
                  )}
                </div>

                {/* RRN */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RRN (Red de Recaudo)
                  </label>
                  <input
                    type="text"
                    value={rrn}
                    onChange={(e) => setRrn(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-lg"
                    placeholder="Ej: 157307"
                  />
                </div>

                {/* RECIBO */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Recibo
                  </label>
                  <input
                    type="text"
                    value={recibo}
                    onChange={(e) => setRecibo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-lg"
                    placeholder="Ej: 153456"
                  />
                </div>

                {/* APRO */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código de Aprobación (APRO)
                  </label>
                  <input
                    type="text"
                    value={apro}
                    onChange={(e) => setApro(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-lg"
                    placeholder="Ej: 615893"
                  />
                </div>

                {/* COMPROBANTE */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Comprobante
                  </label>
                  <input
                    type="text"
                    value={comprobante}
                    onChange={(e) => setComprobante(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-lg"
                    placeholder="Ej: 0000004930"
                  />
                </div>

                {/* Verificado por */}
                <div className="pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    👤 Verificado por *
                  </label>
                  <input
                    type="text"
                    value={verifiedBy}
                    onChange={(e) => setVerifiedBy(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    placeholder="Tu nombre"
                  />
                </div>
              </div>

              {/* Advertencia */}
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">
                  <strong>⚠️ IMPORTANTE:</strong> Al confirmar, declaras que has verificado 
                  visualmente cada número contra la imagen del recibo. Números incorrectos 
                  pueden causar problemas de duplicados o registros inválidos.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!verifiedBy.trim()}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              verifiedBy.trim()
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            ✓ Confirmar Números Verificados
          </button>
        </div>
      </div>
    </div>
  );
};

