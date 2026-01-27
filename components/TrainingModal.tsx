import React, { useState, useEffect } from 'react';
import { ExtractedData, TrainingDecision, ReceiptType } from '../types';

interface TrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    decision: TrainingDecision;
    decisionReason: string;
    correctData: ExtractedData;
    receiptType: ReceiptType;
    notes: string;
    trainedBy: string;
  }) => void;
  imageUrl: string;
  aiExtractedData: ExtractedData;
}

export const TrainingModal: React.FC<TrainingModalProps> = ({
  isOpen,
  onClose,
  onSave,
  imageUrl,
  aiExtractedData
}) => {
  const [decision, setDecision] = useState<TrainingDecision>(TrainingDecision.ACCEPT);
  const [decisionReason, setDecisionReason] = useState('');
  const [receiptType, setReceiptType] = useState<ReceiptType>(ReceiptType.OTHER);
  const [notes, setNotes] = useState('');
  const [trainedBy, setTrainedBy] = useState('');
  
  // Datos corregidos por el usuario
  const [correctData, setCorrectData] = useState<ExtractedData>(aiExtractedData);

  useEffect(() => {
    if (isOpen) {
      setCorrectData(aiExtractedData);
      setDecision(TrainingDecision.ACCEPT);
      setDecisionReason('');
      setNotes('');
      setReceiptType(detectReceiptType(aiExtractedData));
    }
  }, [isOpen, aiExtractedData]);

  // Detectar tipo de recibo automáticamente
  const detectReceiptType = (data: ExtractedData): ReceiptType => {
    const text = data.rawText?.toLowerCase() || '';
    const bank = data.bankName?.toLowerCase() || '';
    
    if (text.includes('redeban') || text.includes('corresponsal')) return ReceiptType.REDEBAN_THERMAL;
    if (bank.includes('bancolombia') && data.isScreenshot) return ReceiptType.BANCOLOMBIA_APP;
    if (bank.includes('nequi') || text.includes('nequi')) return ReceiptType.NEQUI;
    if (bank.includes('agrario')) return ReceiptType.BANCO_AGRARIO;
    if (bank.includes('davivienda')) return ReceiptType.DAVIVIENDA;
    if (bank.includes('bogota') || bank.includes('bogotá')) return ReceiptType.BANCO_BOGOTA;
    if (bank.includes('occidente')) return ReceiptType.OCCIDENTE;
    if (data.isCreditCardPayment) return ReceiptType.CREDIT_CARD;
    
    return ReceiptType.OTHER;
  };

  const updateField = (field: keyof ExtractedData, value: any) => {
    setCorrectData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!trainedBy.trim()) {
      alert('Por favor ingresa tu nombre');
      return;
    }
    if (!decisionReason.trim()) {
      alert('Por favor explica la razón de tu decisión');
      return;
    }

    onSave({
      decision,
      decisionReason,
      correctData,
      receiptType,
      notes,
      trainedBy: trainedBy.trim()
    });
  };

  if (!isOpen) return null;

  const isRejected = decision !== TrainingDecision.ACCEPT;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">🎓 Entrenamiento de IA</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Revisa y corrige los datos extraídos por la IA. Tu entrada ayudará a mejorar la precisión.
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* IMAGEN */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">📸 Imagen del Recibo</h3>
              <img src={imageUrl} alt="Recibo" className="w-full rounded-lg border-2 border-gray-300 shadow-sm" />
            </div>

            {/* DECISIÓN Y DATOS */}
            <div className="space-y-6">
              {/* DECISIÓN */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">✅ Decisión</h3>
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as TrainingDecision)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value={TrainingDecision.ACCEPT}>✅ ACEPTAR - Este recibo es válido</option>
                  <option value={TrainingDecision.REJECT_BLURRY}>⛔ RECHAZAR - Borroso/Mala Calidad</option>
                  <option value={TrainingDecision.REJECT_INVALID}>⛔ RECHAZAR - Datos Incorrectos</option>
                  <option value={TrainingDecision.REJECT_DUPLICATE}>⛔ RECHAZAR - Duplicado</option>
                  <option value={TrainingDecision.REJECT_FRAUD}>⛔ RECHAZAR - Sospecha de Fraude</option>
                </select>
              </div>

              {/* TIPO DE RECIBO */}
              <div>
                <label className="block font-semibold text-gray-900 mb-2">🏦 Tipo de Recibo</label>
                <select
                  value={receiptType}
                  onChange={(e) => setReceiptType(e.target.value as ReceiptType)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value={ReceiptType.REDEBAN_THERMAL}>📜 Redeban (Térmico)</option>
                  <option value={ReceiptType.BANCOLOMBIA_APP}>📱 Bancolombia App</option>
                  <option value={ReceiptType.NEQUI}>💜 Nequi</option>
                  <option value={ReceiptType.BANCO_AGRARIO}>🌾 Banco Agrario</option>
                  <option value={ReceiptType.DAVIVIENDA}>🔴 Davivienda</option>
                  <option value={ReceiptType.BANCO_BOGOTA}>🔵 Banco de Bogotá</option>
                  <option value={ReceiptType.OCCIDENTE}>🟠 Banco de Occidente</option>
                  <option value={ReceiptType.CREDIT_CARD}>💳 Tarjeta de Crédito</option>
                  <option value={ReceiptType.OTHER}>❓ Otro</option>
                </select>
              </div>

              {/* RAZÓN DE LA DECISIÓN */}
              <div>
                <label className="block font-semibold text-gray-900 mb-2">
                  📝 Razón de la Decisión *
                </label>
                <textarea
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder="Explica por qué aceptas o rechazas este recibo..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 min-h-[80px]"
                  required
                />
              </div>

              {/* NOMBRE DEL ENTRENADOR */}
              <div>
                <label className="block font-semibold text-gray-900 mb-2">👤 Tu Nombre *</label>
                <input
                  type="text"
                  value={trainedBy}
                  onChange={(e) => setTrainedBy(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* DATOS EXTRAÍDOS - Solo si es ACEPTADO */}
          {!isRejected && (
            <div className="mt-8 border-t pt-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                🔧 Datos Extraídos por la IA (Corrige si hay errores)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Banco */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
                  <input
                    type="text"
                    value={correctData.bankName || ''}
                    onChange={(e) => updateField('bankName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Ciudad */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                  <input
                    type="text"
                    value={correctData.city || ''}
                    onChange={(e) => updateField('city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Cuenta/Convenio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta/Convenio</label>
                  <input
                    type="text"
                    value={correctData.accountOrConvenio || ''}
                    onChange={(e) => updateField('accountOrConvenio', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Monto */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto ($)</label>
                  <input
                    type="number"
                    value={correctData.amount || 0}
                    onChange={(e) => updateField('amount', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Fecha */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    value={correctData.date || ''}
                    onChange={(e) => updateField('date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Hora */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora (HH:MM)</label>
                  <input
                    type="time"
                    value={correctData.time || ''}
                    onChange={(e) => updateField('time', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* RRN */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RRN</label>
                  <input
                    type="text"
                    value={correctData.rrn || ''}
                    onChange={(e) => updateField('rrn', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Recibo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recibo</label>
                  <input
                    type="text"
                    value={correctData.recibo || ''}
                    onChange={(e) => updateField('recibo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* APRO */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">APRO</label>
                  <input
                    type="text"
                    value={correctData.apro || ''}
                    onChange={(e) => updateField('apro', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Operación */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operación</label>
                  <input
                    type="text"
                    value={correctData.operacion || ''}
                    onChange={(e) => updateField('operacion', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Comprobante */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante</label>
                  <input
                    type="text"
                    value={correctData.comprobante || ''}
                    onChange={(e) => updateField('comprobante', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Referencia de Pago */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referencia de Pago</label>
                  <input
                    type="text"
                    value={correctData.paymentReference || ''}
                    onChange={(e) => updateField('paymentReference', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Código Cliente */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código Cliente</label>
                  <input
                    type="text"
                    value={correctData.clientCode || ''}
                    onChange={(e) => updateField('clientCode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Tarjeta (últimos 4) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarjeta (últimos 4)</label>
                  <input
                    type="text"
                    value={correctData.creditCardLast4 || ''}
                    onChange={(e) => updateField('creditCardLast4', e.target.value)}
                    maxLength={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Calidad de Imagen */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calidad Imagen (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={correctData.imageQualityScore || 0}
                    onChange={(e) => updateField('imageQualityScore', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Confianza */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confianza IA (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={correctData.confidenceScore || 0}
                    onChange={(e) => updateField('confidenceScore', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* NOTAS ADICIONALES */}
          <div className="mt-6">
            <label className="block font-semibold text-gray-900 mb-2">📌 Notas Adicionales (Opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cualquier observación adicional sobre este recibo..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 min-h-[60px]"
            />
          </div>
        </div>

        {/* BOTONES */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
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
            💾 Guardar Entrenamiento
          </button>
        </div>
      </div>
    </div>
  );
};
