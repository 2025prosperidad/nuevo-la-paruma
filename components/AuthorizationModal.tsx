import React, { useState, useRef } from 'react';
import { processImageFile } from '../utils/imageCompression';

interface AuthorizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorize: (authData: { imageUrl: string; authorizedBy: string }) => void;
  recordAmount?: number;
  recordDate?: string;
}

export const AuthorizationModal: React.FC<AuthorizationModalProps> = ({
  isOpen,
  onClose,
  onAuthorize,
  recordAmount,
  recordDate
}) => {
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [authImageUrl, setAuthImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const result = await processImageFile(file);
      if (result.success && result.data) {
        const base64String = `data:${result.mimeType};base64,${result.data}`;
        setAuthImageUrl(base64String);
      } else {
        setError(result.error || 'Error al procesar imagen');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!authImageUrl) {
      setError('Por favor sube el documento de autorización');
      return;
    }
    if (!authorizedBy.trim()) {
      setError('Por favor ingresa el nombre de quien autoriza');
      return;
    }

    onAuthorize({
      imageUrl: authImageUrl,
      authorizedBy: authorizedBy.trim()
    });

    // Reset state
    setAuthorizedBy('');
    setAuthImageUrl(null);
    setError(null);
    onClose();
  };

  const handleClose = () => {
    setAuthorizedBy('');
    setAuthImageUrl(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            📝 Autorización Manual Requerida
          </h2>
          <p className="text-sm text-blue-100 mt-1">
            Este pago requiere verificación humana
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Info del registro */}
          {(recordAmount || recordDate) && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600">
                <strong>Monto:</strong> {recordAmount ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(recordAmount) : 'N/A'}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Fecha:</strong> {recordDate || 'N/A'}
              </p>
            </div>
          )}

          {/* Explicación */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-800">
              <strong>⚠️ ¿Por qué se requiere autorización?</strong>
            </p>
            <ul className="text-xs text-amber-700 mt-2 space-y-1 list-disc pl-4">
              <li>La imagen es una captura de pantalla de una app bancaria</li>
              <li>No tiene número de recibo físico (RRN, RECIBO, APRO)</li>
              <li>Se requiere documento de soporte para validar el pago</li>
            </ul>
          </div>

          {/* Upload de documento */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📎 Documento de Autorización *
            </label>
            <div 
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                authImageUrl ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <div className="text-gray-500">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  Procesando...
                </div>
              ) : authImageUrl ? (
                <div>
                  <img src={authImageUrl} alt="Autorización" className="h-32 mx-auto rounded-lg mb-2 object-contain" />
                  <p className="text-sm text-green-600">✓ Documento cargado - Click para cambiar</p>
                </div>
              ) : (
                <div className="text-gray-500">
                  <svg className="h-8 w-8 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">Click para subir documento de autorización</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP hasta 20MB</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Nombre de quien autoriza */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              👤 Autorizado por *
            </label>
            <input
              type="text"
              value={authorizedBy}
              onChange={(e) => setAuthorizedBy(e.target.value)}
              placeholder="Nombre de quien autoriza"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!authImageUrl || !authorizedBy.trim()}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              authImageUrl && authorizedBy.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            ✓ Autorizar Pago
          </button>
        </div>
      </div>
    </div>
  );
};

