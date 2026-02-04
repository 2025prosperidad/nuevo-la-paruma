import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { Stats } from './components/Stats';
import { ConsignmentTable } from './components/ConsignmentTable';
import { ImageModal } from './components/ImageModal';
import { ConfigModal } from './components/ConfigModal';
import { AuthorizationModal } from './components/AuthorizationModal';
import { VerifyNumbersModal } from './components/VerifyNumbersModal';
import { TrainingModal } from './components/TrainingModal';
import { TrainingSection } from './components/TrainingSection';
import { ReceiptTypeConfigModal } from './components/ReceiptTypeConfig';
import { analyzeReceipt, getAIConfig, saveAIConfig } from './services/aiService';
import { incrementTrainingVersion, cleanExpiredCache, getCacheStats } from './services/cacheService';
import { sendToGoogleSheets, fetchHistoryFromSheets, fetchAccountsFromSheets, saveAccountsToSheets, saveTrainingToSheets, fetchTrainingFromSheets } from './services/sheetsService';
import { ConsignmentRecord, ProcessingStatus, ValidationStatus, ExtractedData, ConfigItem, TrainingRecord, TrainingDecision, ReceiptType, ReceiptTypeConfig, AIModel, AIConfig } from './types';
import { ALLOWED_ACCOUNTS, ALLOWED_CONVENIOS, COMMON_REFERENCES, normalizeAccount, MIN_QUALITY_SCORE, GOOGLE_SCRIPT_URL, CERVECERIA_UNION_CLIENT_CODE, CERVECERIA_UNION_KEYWORDS, CERVECERIA_UNION_CONVENIOS, MIN_CONFIDENCE_SCORE, MIN_THERMAL_QUALITY_SCORE, ALLOWED_CREDIT_CARDS, CERVECERIA_UNION_INTERNAL_REFS, DEFAULT_AI_CONFIG } from './constants';
import { processImageFile } from './utils/imageCompression';

const App: React.FC = () => {
  // Local records (just uploaded/processed in this session)
  const [localRecords, setLocalRecords] = useState<ConsignmentRecord[]>([]);

  // Remote records (fetched from Google Sheets)
  const [sheetRecords, setSheetRecords] = useState<ConsignmentRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'HISTORY' | 'TRAINING'>('UPLOAD');

  // Config State
  const [configOpen, setConfigOpen] = useState(false);
  const [allowedAccounts, setAllowedAccounts] = useState<ConfigItem[]>([]);
  const [allowedConvenios, setAllowedConvenios] = useState<ConfigItem[]>([]);
  const [scriptUrl, setScriptUrl] = useState<string>(GOOGLE_SCRIPT_URL);

  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Authorization Modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [recordToAuthorize, setRecordToAuthorize] = useState<string | null>(null);

  // Verification Modal state
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [recordToVerify, setRecordToVerify] = useState<string | null>(null);

  // Training State
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [recordToTrain, setRecordToTrain] = useState<ConsignmentRecord | null>(null);
  const [isLoadingTraining, setIsLoadingTraining] = useState(false);

  // Receipt Type Configuration
  const [receiptTypeConfigs, setReceiptTypeConfigs] = useState<ReceiptTypeConfig[]>([]);
  const [receiptTypeConfigOpen, setReceiptTypeConfigOpen] = useState(false);

  // AI Model Configuration
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [cacheStats, setCacheStats] = useState({ size: 0, oldestTimestamp: null as number | null });

  // 1. Load Config on Mount
  useEffect(() => {
    const loadConfig = () => {
      const savedAccounts = localStorage.getItem('config_accounts');
      const savedConvenios = localStorage.getItem('config_convenios');
      const savedUrl = localStorage.getItem('config_script_url');

      // Priority: 1. Saved URL (if user customized), 2. Constant
      if (savedUrl) {
        setScriptUrl(savedUrl);
      } else {
        setScriptUrl(GOOGLE_SCRIPT_URL);
      }

      if (savedAccounts) {
        setAllowedAccounts(JSON.parse(savedAccounts));
      } else {
        const defaults = ALLOWED_ACCOUNTS.map((acc, idx) => ({
          id: `default-acc-${idx}`,
          value: acc,
          label: 'Cuenta Autorizada',
          type: 'ACCOUNT' as const
        }));
        setAllowedAccounts(defaults);
      }

      if (savedConvenios) {
        setAllowedConvenios(JSON.parse(savedConvenios));
      } else {
        const defaults = ALLOWED_CONVENIOS.map((cnv, idx) => ({
          id: `default-cnv-${idx}`,
          value: cnv,
          label: 'Convenio Autorizado',
          type: 'CONVENIO' as const
        }));
        setAllowedConvenios(defaults);
      }
    };
    loadConfig();

    // Cargar configuración de IA
    const savedAIConfig = getAIConfig();
    if (savedAIConfig) {
      setAiConfig(savedAIConfig);
    }

    // Actualizar estadísticas de caché
    const stats = getCacheStats();
    setCacheStats(stats);

    // Limpiar caché expirado
    cleanExpiredCache(aiConfig.cacheExpiration);
  }, []);

  // Force update URL if the constant changes (Auto-fix for user)
  useEffect(() => {
    if (GOOGLE_SCRIPT_URL && scriptUrl !== GOOGLE_SCRIPT_URL) {
      setScriptUrl(GOOGLE_SCRIPT_URL);
      localStorage.setItem('config_script_url', GOOGLE_SCRIPT_URL);
    }
  }, [scriptUrl]);

  // 2. Fetch History on Mount (Auto-load)
  useEffect(() => {
    if (scriptUrl) {
      loadSheetHistory(scriptUrl);
      loadAccountsFromSheets(scriptUrl); // También cargar configuración de cuentas
      loadTrainingData(scriptUrl); // Cargar datos de entrenamiento
    }
  }, [scriptUrl]);

  const loadSheetHistory = async (url = scriptUrl) => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      // By default fetch accepted records to show in history
      const history = await fetchHistoryFromSheets(url, { limit: 100 });
      setSheetRecords(history);
    } catch (err: any) {
      console.error("Failed to load history", err);
      setHistoryError(err.message || "Error al conectar. Revisa la URL y permisos.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // 3. Cargar configuración de cuentas desde Google Sheets
  const loadAccountsFromSheets = async (url = scriptUrl) => {
    if (!url) return;

    try {
      const config = await fetchAccountsFromSheets(url);

      // Si la hoja está vacía, sincronizar valores por defecto
      if (config.accounts.length === 0 && config.convenios.length === 0) {
        console.log("Hoja Cuentas vacía. Sincronizando valores por defecto...");
        await syncAccountsToSheets();
        return;
      }

      if (config.accounts.length > 0) {
        setAllowedAccounts(config.accounts);
        localStorage.setItem('config_accounts', JSON.stringify(config.accounts));
      }

      if (config.convenios.length > 0) {
        setAllowedConvenios(config.convenios);
        localStorage.setItem('config_convenios', JSON.stringify(config.convenios));
      }

      console.log(`Cuentas y convenios cargados desde Google Sheets: ${config.accounts.length} cuentas, ${config.convenios.length} convenios`);
    } catch (err: any) {
      console.error("Failed to load accounts from sheets", err);
    }
  };

  // 4. Sincronizar configuración actual a Google Sheets
  const syncAccountsToSheets = async () => {
    if (!scriptUrl) {
      alert("Configura la URL del Script primero");
      return;
    }

    try {
      const result = await saveAccountsToSheets(allowedAccounts, allowedConvenios, scriptUrl);
      alert(result.message);

      if (result.success) {
        console.log("Configuración sincronizada exitosamente");
      }
    } catch (err: any) {
      console.error("Failed to sync accounts", err);
      alert("Error al sincronizar configuración");
    }
  };

  // 5. Cargar datos de entrenamiento desde Google Sheets
  const loadTrainingData = async (url = scriptUrl) => {
    setIsLoadingTraining(true);
    try {
      const data = await fetchTrainingFromSheets(url);
      // Eliminar duplicados por imageHash o ID
      const uniqueData: TrainingRecord[] = [];
      const seenHashes = new Set<string>();
      const seenIds = new Set<string>();

      for (const record of data) {
        // Verificar por ID primero
        if (record.id && seenIds.has(record.id)) {
          continue;
        }
        if (record.id) seenIds.add(record.id);

        // Verificar por imageHash
        if (record.imageHash && seenHashes.has(record.imageHash)) {
          continue;
        }
        if (record.imageHash) seenHashes.add(record.imageHash);

        uniqueData.push(record);
      }

      setTrainingRecords(uniqueData);
      // Guardar también en localStorage para uso offline
      localStorage.setItem('training_records', JSON.stringify(uniqueData));
      console.log(`Datos de entrenamiento cargados desde Sheets: ${uniqueData.length} registros únicos`);
    } catch (err: any) {
      console.error("Failed to load training data", err);
      // Si falla, intentar cargar desde localStorage
      const saved = localStorage.getItem('training_records');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setTrainingRecords(parsed);
          console.log(`Datos de entrenamiento cargados desde localStorage: ${parsed.length} registros`);
        } catch (e) {
          console.error('Error parsing training records from localStorage', e);
        }
      }
    } finally {
      setIsLoadingTraining(false);
    }
  };

  // 6. Guardar datos de entrenamiento a Google Sheets
  const syncTrainingToSheets = async () => {
    if (!scriptUrl) {
      alert("Configura la URL del Script primero");
      return;
    }

    if (trainingRecords.length === 0) {
      alert("No hay datos de entrenamiento para sincronizar");
      return;
    }

    try {
      const result = await saveTrainingToSheets(trainingRecords, scriptUrl);
      alert(result.message);

      if (result.success) {
        console.log("Datos de entrenamiento sincronizados exitosamente");
      }
    } catch (err: any) {
      console.error("Failed to sync training data", err);
      alert("Error al sincronizar datos de entrenamiento");
    }
  };

  // 7. Abrir modal de entrenamiento para un registro
  const handleTrainRecord = (record: ConsignmentRecord) => {
    setRecordToTrain(record);
    setTrainingModalOpen(true);
  };

  // 8. Guardar entrenamiento
  const handleSaveTraining = async (trainingData: {
    decision: TrainingDecision;
    decisionReason: string;
    correctData: ExtractedData;
    receiptType: ReceiptType;
    notes: string;
    trainedBy: string;
  }) => {
    if (!recordToTrain) return;

    // Verificar si ya existe un entrenamiento con el mismo imageHash
    if (recordToTrain.imageHash) {
      const existingTraining = trainingRecords.find(r => r.imageHash === recordToTrain.imageHash);
      if (existingTraining) {
        if (!confirm(`⚠️ Ya existe un entrenamiento para esta imagen.\n\n¿Deseas reemplazarlo?`)) {
          return;
        }
        // Eliminar el entrenamiento existente
        setTrainingRecords(prev => prev.filter(r => r.imageHash !== recordToTrain.imageHash));
      }
    }

    const newTrainingRecord: TrainingRecord = {
      id: crypto.randomUUID(),
      imageUrl: recordToTrain.imageUrl,
      imageHash: recordToTrain.imageHash,
      createdAt: Date.now(),
      decision: trainingData.decision,
      decisionReason: trainingData.decisionReason,
      correctData: trainingData.correctData,
      aiExtractedData: {
        bankName: recordToTrain.bankName,
        city: recordToTrain.city,
        accountOrConvenio: recordToTrain.accountOrConvenio,
        amount: recordToTrain.amount,
        date: recordToTrain.date,
        time: recordToTrain.time,
        uniqueTransactionId: recordToTrain.uniqueTransactionId,
        rrn: recordToTrain.rrn,
        recibo: recordToTrain.recibo,
        apro: recordToTrain.apro,
        operacion: recordToTrain.operacion,
        comprobante: recordToTrain.comprobante,
        paymentReference: recordToTrain.paymentReference,
        clientCode: recordToTrain.clientCode,
        creditCardLast4: recordToTrain.creditCardLast4,
        isCreditCardPayment: recordToTrain.isCreditCardPayment,
        confidenceScore: recordToTrain.confidenceScore,
        hasAmbiguousNumbers: recordToTrain.hasAmbiguousNumbers,
        ambiguousFields: recordToTrain.ambiguousFields,
        isScreenshot: recordToTrain.isScreenshot,
        hasPhysicalReceipt: recordToTrain.hasPhysicalReceipt,
        imageQualityScore: recordToTrain.imageQualityScore,
        isReadable: recordToTrain.isReadable,
        rawText: recordToTrain.rawText
      },
      receiptType: trainingData.receiptType,
      trainedBy: trainingData.trainedBy,
      trainedAt: Date.now(),
      notes: trainingData.notes
    };

    // Actualizar estado
    setTrainingRecords(prev => [newTrainingRecord, ...prev]);
    setTrainingModalOpen(false);
    setRecordToTrain(null);

    // Incrementar versión de entrenamiento (invalida cachés)
    incrementTrainingVersion();
    console.log('📚 Versión de entrenamiento incrementada - cachés invalidados');

    // Guardar automáticamente en localStorage
    const updatedRecords = [newTrainingRecord, ...trainingRecords.filter(r => !r.imageHash || r.imageHash !== recordToTrain.imageHash)];
    localStorage.setItem('training_records', JSON.stringify(updatedRecords));

    // Guardar automáticamente en Google Sheets
    if (scriptUrl) {
      try {
        const result = await saveTrainingToSheets([newTrainingRecord], scriptUrl);
        if (result.success) {
          alert(`✅ Entrenamiento guardado y sincronizado con Google Sheets.`);
        } else {
          alert(`✅ Entrenamiento guardado localmente.\n\n⚠️ Error al sincronizar: ${result.message}`);
        }
      } catch (err: any) {
        console.error("Error saving training to Sheets:", err);
        alert(`✅ Entrenamiento guardado localmente.\n\n⚠️ Error al sincronizar: ${err.message || 'Error desconocido'}`);
      }
    } else {
      alert(`✅ Entrenamiento guardado localmente.\n\n⚠️ URL del Script no configurada. Configúrala para sincronizar automáticamente.`);
    }
  };

  // 9. Eliminar registro de entrenamiento
  const handleDeleteTraining = (id: string) => {
    if (!confirm('¿Eliminar este registro de entrenamiento?')) return;

    setTrainingRecords(prev => {
      const updated = prev.filter(r => r.id !== id);
      localStorage.setItem('training_records', JSON.stringify(updated));
      return updated;
    });
  };

  // 10. Exportar dataset de entrenamiento
  const handleExportTraining = () => {
    const dataStr = JSON.stringify(trainingRecords, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `training-dataset-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    alert(`✅ Dataset exportado: ${trainingRecords.length} registros`);
  };

  // 11. Cargar datos de entrenamiento desde localStorage al iniciar (solo si no se cargaron desde Sheets)
  // Esta función se ejecuta solo si loadTrainingData falla o no hay scriptUrl
  useEffect(() => {
    // Solo cargar desde localStorage si no hay scriptUrl o si loadTrainingData no se ha ejecutado aún
    // loadTrainingData ya maneja la carga desde Sheets y localStorage como fallback
    if (!scriptUrl) {
      const saved = localStorage.getItem('training_records');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Validar que los datos tengan la estructura correcta
          const validRecords = parsed.filter((record: any) => {
            return record &&
              record.id &&
              record.decision &&
              record.correctData &&
              record.aiExtractedData &&
              typeof record.correctData === 'object' &&
              typeof record.aiExtractedData === 'object';
          });

          if (validRecords.length !== parsed.length) {
            console.warn(`Se encontraron ${parsed.length - validRecords.length} registros corruptos que fueron eliminados`);
            // Guardar solo los registros válidos
            localStorage.setItem('training_records', JSON.stringify(validRecords));
          }

          setTrainingRecords(validRecords);
          console.log(`Datos de entrenamiento cargados desde localStorage: ${validRecords.length} registros`);
        } catch (e) {
          console.error('Error parsing training records from localStorage', e);
          // Limpiar datos corruptos
          localStorage.removeItem('training_records');
          setTrainingRecords([]);
        }
      }
    }
  }, [scriptUrl]);

  // 12. Cargar configuración de tipos de recibo desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem('receipt_type_configs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setReceiptTypeConfigs(parsed);
        console.log(`Configuración de tipos de recibo cargada: ${parsed.length} tipos`);
      } catch (e) {
        console.error('Error parsing receipt type configs from localStorage', e);
      }
    }
  }, []);

  // 13. Guardar configuración de tipos de recibo
  const handleSaveReceiptTypeConfig = (configs: ReceiptTypeConfig[]) => {
    setReceiptTypeConfigs(configs);
    localStorage.setItem('receipt_type_configs', JSON.stringify(configs));
    console.log('Configuración de tipos de recibo guardada:', configs.length);
  };

  // 14. Guardar configuración de IA
  const handleSaveAIConfig = (config: AIConfig) => {
    setAiConfig(config);
    saveAIConfig(config);
    console.log('Configuración de IA guardada:', config);

    // Actualizar estadísticas de caché
    const stats = getCacheStats();
    setCacheStats(stats);
  };

  // 15. Limpiar caché manualmente
  const handleClearCache = () => {
    if (confirm('¿Estás seguro de que quieres limpiar todo el caché de análisis?')) {
      cleanExpiredCache(0); // Limpiar todo
      const stats = getCacheStats();
      setCacheStats(stats);
      alert('✅ Caché limpiado exitosamente');
    }
  };

  // Helper: Generate simple hash from image data (to detect exact duplicate images)
  const generateImageHash = async (base64Data: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(base64Data.substring(0, 5000)); // Use first 5000 chars for hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Persist Config changes
  useEffect(() => {
    if (allowedAccounts.length > 0) localStorage.setItem('config_accounts', JSON.stringify(allowedAccounts));
  }, [allowedAccounts]);

  useEffect(() => {
    if (allowedConvenios.length > 0) localStorage.setItem('config_convenios', JSON.stringify(allowedConvenios));
  }, [allowedConvenios]);

  useEffect(() => {
    if (scriptUrl) localStorage.setItem('config_script_url', scriptUrl);
  }, [scriptUrl]);

  const handleResetDefaults = () => {
    const defAccounts = ALLOWED_ACCOUNTS.map((acc, idx) => ({
      id: `default-acc-${idx}`,
      value: acc,
      label: 'Cuenta Autorizada',
      type: 'ACCOUNT' as const
    }));
    const defConvenios = ALLOWED_CONVENIOS.map((cnv, idx) => ({
      id: `default-cnv-${idx}`,
      value: cnv,
      label: 'Convenio Autorizado',
      type: 'CONVENIO' as const
    }));
    setAllowedAccounts(defAccounts);
    setAllowedConvenios(defConvenios);
    setScriptUrl(GOOGLE_SCRIPT_URL);
    setConfigOpen(false);
  };

  // Helper: Detectar tipo de recibo
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

  const validateRecord = (
    data: ExtractedData & { imageHash?: string },
    existingRecords: ConsignmentRecord[],
    currentAccounts: ConfigItem[],
    currentConvenios: ConfigItem[]
  ): { status: ValidationStatus, message: string } => {
    // DEBUG: Log para ver qué entrenamientos hay disponibles
    console.log('🔍 Validando recibo. Entrenamientos disponibles:', trainingRecords.length);
    if (trainingRecords.length > 0) {
      console.log('📚 Tipos de entrenamiento:', trainingRecords.map(tr => `${tr.receiptType} (${tr.decision})`).join(', '));
    }

    // =====================================================
    // 0. VALIDACIÓN POR TIPO DE RECIBO (PRIMERO)
    // =====================================================
    const receiptType = detectReceiptType(data);
    const typeConfig = receiptTypeConfigs.find(c => c.type === receiptType);

    // Si el tipo de recibo no está aceptado, rechazar inmediatamente
    if (typeConfig && !typeConfig.isAccepted) {
      return {
        status: ValidationStatus.INVALID_ACCOUNT,
        message: `⛔ RECHAZADO: Tipo de recibo "${typeConfig.label}" no aceptado por configuración del sistema.`
      };
    }

    // Verificar calidad mínima según el tipo de recibo
    const minQualityRequired = typeConfig?.minQualityScore || MIN_QUALITY_SCORE;
    if (data.imageQualityScore < minQualityRequired) {
      return {
        status: ValidationStatus.LOW_QUALITY,
        message: `⛔ RECHAZADO: Calidad insuficiente para ${typeConfig?.label || 'este tipo'} (${data.imageQualityScore}/100, requiere ${minQualityRequired}).`
      };
    }

    // Verificar si requiere número de recibo físico
    if (typeConfig && typeConfig.requiresPhysicalReceipt) {
      const hasPhysicalNumber = Boolean(data.rrn || data.recibo || data.apro);
      if (!hasPhysicalNumber) {
        return {
          status: ValidationStatus.MISSING_RECEIPT_NUMBER,
          message: `⛔ RECHAZADO: ${typeConfig.label} requiere número de recibo físico (RRN/RECIBO/APRO).`
        };
      }
    }

    // =====================================================
    // 1. VALIDACIONES CRÍTICAS DE SEGURIDAD
    // =====================================================

    // 1-A. VERIFICAR FECHA (CRÍTICO - SIN FECHA = RECHAZO)
    if (!data.date || data.date.trim() === '') {
      return {
        status: ValidationStatus.MISSING_DATE,
        message: '⛔ RECHAZADO: Sin fecha visible. La fecha es obligatoria para validar el pago.'
      };
    }

    // 0-B. VERIFICAR CALIDAD DE IMAGEN ESPECIAL PARA RECIBOS TÉRMICOS
    // Los recibos Redeban/térmicos necesitan mayor calidad
    const isThermalReceipt = data.rawText?.toLowerCase().includes('redeban') ||
      data.rawText?.toLowerCase().includes('recaudo') ||
      data.rawText?.toLowerCase().includes('corresponsal') ||
      (data.rrn || data.recibo || data.apro);

    if (isThermalReceipt && data.imageQualityScore < MIN_THERMAL_QUALITY_SCORE) {
      return {
        status: ValidationStatus.LOW_QUALITY,
        message: `⛔ RECHAZADO: Recibo térmico con calidad insuficiente (${data.imageQualityScore}/100, requiere ${MIN_THERMAL_QUALITY_SCORE}). Los recibos Redeban borrosos no se pueden validar con seguridad.`
      };
    }

    // 0-D. VALIDACIÓN GENÉRICA CON ENTRENAMIENTOS - APLICA A TODOS LOS TIPOS DE RECIBO
    // Verificar si hay entrenamientos que indican que este tipo de recibo debe aceptarse
    // (receiptType ya fue declarado arriba en la línea 514)
    const hasPhysicalReceiptNumber = Boolean(data.rrn || data.recibo || data.apro);
    const hasAnyTransactionId = Boolean(data.rrn || data.recibo || data.apro || data.operacion || data.comprobante || data.uniqueTransactionId);

    console.log(`🔍 Validando recibo. Tipo: ${receiptType}, Banco: ${data.bankName}, isScreenshot: ${data.isScreenshot}, hasPhysicalReceipt: ${hasPhysicalReceiptNumber}`);

    // Buscar entrenamientos ACCEPT para este tipo de recibo (genérico para cualquier banco)
    const acceptTrainings = trainingRecords.filter(tr =>
      tr.receiptType === receiptType && tr.decision === TrainingDecision.ACCEPT
    );

    console.log(`📚 Encontrados ${acceptTrainings.length} entrenamientos ACCEPT para tipo ${receiptType}`);

    // Si hay entrenamientos ACCEPT, verificar si el recibo cumple las condiciones
    // Si cumple, marcar como "aprobado por entrenamiento" para saltar validaciones estrictas
    let approvedByTraining = false;

    if (acceptTrainings.length > 0) {
      // Verificar condiciones EXACTAS según los entrenamientos:
      // Los entrenamientos dicen: "valor, comprobante, producto destino y fecha sean legibles"
      // - Valor legible (amount > 0)
      // - Comprobante legible (comprobante no vacío) - IMPORTANTE: según entrenamiento
      // - Producto destino legible (accountOrConvenio no vacío) - IMPORTANTE: según entrenamiento
      // - Fecha legible (date no vacío)
      const hasComprobante = Boolean(data.comprobante && data.comprobante.trim() !== '');
      const hasProductoDestino = Boolean(data.accountOrConvenio && data.accountOrConvenio.trim() !== '');
      const hasValor = Boolean(data.amount && data.amount > 0);
      const hasFecha = Boolean(data.date && data.date.trim() !== '');

      // Condiciones según entrenamiento: valor, comprobante, producto destino y fecha
      const hasRequiredData = hasValor && hasComprobante && hasProductoDestino && hasFecha;

      console.log(`✅ Verificando condiciones EXACTAS del entrenamiento:`, {
        hasValor,
        hasComprobante,
        hasProductoDestino,
        hasFecha,
        comprobante: data.comprobante,
        accountOrConvenio: data.accountOrConvenio,
        amount: data.amount,
        date: data.date,
        hasRequiredData
      });

      if (hasRequiredData) {
        console.log(`✅ Recibo cumple TODAS las condiciones del entrenamiento para ${receiptType}. Aprobado por entrenamiento.`);
        approvedByTraining = true;
        // Marcar que este recibo fue aprobado por entrenamiento - esto permitirá saltar validaciones estrictas
      } else {
        console.log(`⚠️ Recibo NO cumple todas las condiciones del entrenamiento. Faltan:`, {
          valor: !hasValor,
          comprobante: !hasComprobante,
          productoDestino: !hasProductoDestino,
          fecha: !hasFecha
        });
        // Si es captura sin recibo físico y no cumple condiciones, pedir autorización
        if (data.isScreenshot && !hasPhysicalReceiptNumber) {
          if (!hasAnyTransactionId) {
            return {
              status: ValidationStatus.MISSING_RECEIPT_NUMBER,
              message: '📱 REQUIERE AUTORIZACIÓN: Captura sin número de recibo. Suba el certificado de autorización.'
            };
          }
          return {
            status: ValidationStatus.REQUIRES_AUTHORIZATION,
            message: '📱 REQUIERE AUTORIZACIÓN: Captura sin recibo físico. Suba documento de autorización para validar.'
          };
        }
      }
    } else {
      // Si NO hay entrenamientos ACCEPT para este tipo, aplicar reglas por defecto
      // Para capturas de pantalla sin recibo físico, pedir autorización
      if (data.isScreenshot && !hasPhysicalReceiptNumber) {
        console.log(`⚠️ No hay entrenamientos ACCEPT para ${receiptType}. Aplicando reglas por defecto.`);
        if (!hasAnyTransactionId) {
          return {
            status: ValidationStatus.MISSING_RECEIPT_NUMBER,
            message: '📱 REQUIERE AUTORIZACIÓN: Captura de pantalla sin número de recibo. Suba el certificado de autorización.'
          };
        }
        return {
          status: ValidationStatus.REQUIRES_AUTHORIZATION,
          message: '📱 REQUIERE AUTORIZACIÓN: Captura de app sin recibo físico. Suba documento de autorización para validar.'
        };
      }
    }

    // =====================================================
    // 1. CALIDAD DE IMAGEN
    // =====================================================
    // Si fue aprobado por entrenamiento, ser más flexible con la calidad
    const minQualityForThisRecord = approvedByTraining ? Math.max(MIN_QUALITY_SCORE - 10, 50) : MIN_QUALITY_SCORE;

    if (!data.isReadable || data.imageQualityScore < minQualityForThisRecord) {
      if (approvedByTraining) {
        console.log(`⚠️ Calidad baja pero aprobado por entrenamiento: ${data.imageQualityScore}/100 (mínimo: ${minQualityForThisRecord})`);
        // Continuar con la validación, pero con advertencia
      } else {
        return {
          status: ValidationStatus.LOW_QUALITY,
          message: `Calidad insuficiente (${data.imageQualityScore}/100, requiere ${MIN_QUALITY_SCORE}).`
        };
      }
    }

    // =====================================================
    // 2. VERIFICACIÓN DE DUPLICADOS (EXHAUSTIVA)
    // =====================================================
    const allRecords = [...existingRecords, ...sheetRecords];

    // 2-A. IMAGE HASH CHECK (Detect exact same image file)
    if (data.imageHash) {
      const sameImageDuplicate = allRecords.find(r =>
        r.imageHash && r.imageHash === data.imageHash
      );

      if (sameImageDuplicate) {
        return {
          status: ValidationStatus.DUPLICATE,
          message: 'Imagen duplicada: Esta misma foto ya fue subida anteriormente'
        };
      }
    }

    // 2-B. MÚLTIPLES NÚMEROS DE APROBACIÓN - TODOS DEBEN SER ÚNICOS
    const uniqueIds = [
      { field: 'RRN', value: data.rrn },
      { field: 'RECIBO', value: data.recibo },
      { field: 'APRO', value: data.apro },
      { field: 'OPERACION', value: data.operacion },
      { field: 'COMPROBANTE', value: data.comprobante },
      { field: 'ID TRANSACCIÓN', value: data.uniqueTransactionId }
    ];

    for (const idEntry of uniqueIds) {
      if (!idEntry.value || String(idEntry.value).trim().length === 0) continue;

      const rawNewId = String(idEntry.value).trim();
      const fieldName = idEntry.field;

      // NIVEL 1: Verificación EXACTA
      const exactDuplicate = allRecords.find(r => {
        const existingIds = [r.rrn, r.recibo, r.apro, r.operacion, r.comprobante, r.uniqueTransactionId];
        return existingIds.some(existingId => {
          if (!existingId) return false;
          const rawExisting = String(existingId).trim();
          if (rawExisting.length === 0) return false;
          return rawExisting.toLowerCase() === rawNewId.toLowerCase();
        });
      });

      if (exactDuplicate) {
        return {
          status: ValidationStatus.DUPLICATE,
          message: `⛔ ${fieldName} DUPLICADO: "${rawNewId}" ya existe en la base de datos`
        };
      }

      // NIVEL 2: Verificación NUMÉRICA
      const normalizedNew = rawNewId.replace(/\D/g, '');
      if (normalizedNew.length >= 4) {
        const numericDuplicate = allRecords.find(r => {
          const existingIds = [r.rrn, r.recibo, r.apro, r.operacion, r.comprobante, r.uniqueTransactionId];
          return existingIds.some(existingId => {
            if (!existingId) return false;
            const normalizedExisting = String(existingId).replace(/\D/g, '');
            return normalizedExisting.length >= 4 && normalizedExisting === normalizedNew;
          });
        });

        if (numericDuplicate) {
          return {
            status: ValidationStatus.DUPLICATE,
            message: `⛔ ${fieldName} DUPLICADO: "${rawNewId}" (coincide numéricamente: ${normalizedNew})`
          };
        }
      }
    }

    // 2-C. Validación heurística si no hay IDs únicos
    const hasUniqueIds = Boolean(
      data.rrn || data.recibo || data.apro || data.operacion || data.comprobante || data.uniqueTransactionId
    );

    if (!hasUniqueIds) {
      const exactTimeDuplicate = allRecords.find(r => {
        const exactAmount = r.amount === data.amount;
        const sameDate = r.date === data.date;
        const sameTime = r.time && data.time && r.time.substring(0, 5) === data.time.substring(0, 5);
        return exactAmount && sameDate && sameTime;
      });

      if (exactTimeDuplicate) {
        return {
          status: ValidationStatus.DUPLICATE,
          message: `Duplicado: Monto ($${data.amount}), fecha (${data.date}) y hora (${data.time})`
        };
      }

      // Verificación por monto + fecha + banco + referencia
      const exactRefDuplicate = allRecords.find(r => {
        const exactAmount = r.amount === data.amount;
        const sameDate = r.date === data.date;
        const sameBank = r.bankName && data.bankName &&
          normalizeAccount(r.bankName) === normalizeAccount(data.bankName);
        const ref1 = r.paymentReference ? normalizeAccount(r.paymentReference) : '';
        const ref2 = data.paymentReference ? normalizeAccount(data.paymentReference) : '';
        const sameClientRef = ref1.length > 3 && ref2.length > 3 && ref1 === ref2;
        return exactAmount && sameDate && sameBank && sameClientRef;
      });

      if (exactRefDuplicate) {
        return {
          status: ValidationStatus.DUPLICATE,
          message: `Duplicado: Monto ($${data.amount}), fecha, banco y referencia de cliente`
        };
      }
    }

    // =====================================================
    // 3. VALIDACIÓN DE CUENTA/CONVENIO
    // =====================================================
    let extractedAcc = normalizeAccount(data.accountOrConvenio || '');
    const validAccountValues = currentAccounts.map(item => normalizeAccount(item.value));
    const validConvenioValues = currentConvenios.map(item => normalizeAccount(item.value));

    // Verificar si es pago con tarjeta de crédito autorizada
    const rawText = data.rawText?.toLowerCase() || '';

    // Detectar tarjeta autorizada por múltiples métodos:
    // 1. Por el campo isCreditCardPayment de Gemini
    // 2. Por creditCardLast4 de Gemini
    // 3. Por búsqueda en rawText
    let detectedCardLast4: string | null = null;

    // Método 1: Gemini detectó tarjeta
    if (data.isCreditCardPayment && data.creditCardLast4) {
      detectedCardLast4 = data.creditCardLast4;
    }

    // Método 2: Buscar en rawText los últimos 4 dígitos
    if (!detectedCardLast4) {
      for (const card of ALLOWED_CREDIT_CARDS) {
        if (rawText.includes(card) || rawText.includes(`****${card}`) || rawText.includes(`*${card}`)) {
          detectedCardLast4 = card;
          break;
        }
      }
    }

    const isCreditCardPayment = detectedCardLast4 !== null &&
      ALLOWED_CREDIT_CARDS.includes(detectedCardLast4);

    // Si es pago con tarjeta, usar los últimos 4 dígitos como referencia
    if (isCreditCardPayment && detectedCardLast4) {
      console.log(`💳 Pago con tarjeta detectado: ****${detectedCardLast4}`);
      data.paymentReference = detectedCardLast4;
      data.creditCardLast4 = detectedCardLast4;
      data.isCreditCardPayment = true;
    }

    // Verificar si es pago a Cervecería Unión por MÚLTIPLES MÉTODOS:
    // 1. Por palabras clave en el texto
    const isCerveceriaByKeyword = CERVECERIA_UNION_KEYWORDS.some(keyword =>
      rawText.includes(keyword.toLowerCase())
    );

    // 2. Por número de convenio
    const normalizedConvenio = normalizeAccount(data.accountOrConvenio || '');
    const isCerveceriaByConvenio = CERVECERIA_UNION_CONVENIOS.some(conv =>
      normalizeAccount(conv) === normalizedConvenio
    );

    // 3. Por referencia que contenga el código cliente
    const hasClientCodeInRef = data.paymentReference?.includes(CERVECERIA_UNION_CLIENT_CODE) ||
      data.paymentReference?.includes('10813353') ||
      rawText.includes('10813353');

    // Combinar todas las detecciones
    const isCerveceriaUnion = isCerveceriaByKeyword || isCerveceriaByConvenio || hasClientCodeInRef;

    // Si es Cervecería Unión, el código cliente debe ser 10813353
    if (isCerveceriaUnion && data.clientCode !== CERVECERIA_UNION_CLIENT_CODE) {
      // Auto-asignar el código si no lo detectó
      data.clientCode = CERVECERIA_UNION_CLIENT_CODE;
    }

    // Si es Cervecería Unión y la referencia es un número interno del banco, reemplazarla
    if (isCerveceriaUnion && data.paymentReference) {
      const normalizedRef = normalizeAccount(data.paymentReference);
      const isInternalRef = CERVECERIA_UNION_INTERNAL_REFS.some(
        internalRef => normalizeAccount(internalRef) === normalizedRef
      );

      if (isInternalRef) {
        console.log(`🔄 Reemplazando referencia interna ${data.paymentReference} por código cliente ${CERVECERIA_UNION_CLIENT_CODE}`);
        data.paymentReference = CERVECERIA_UNION_CLIENT_CODE;
      }
    }

    if (!extractedAcc && data.paymentReference) {
      const possibleAccountInRef = currentAccounts.find(accItem =>
        normalizeAccount(data.paymentReference || '').includes(normalizeAccount(accItem.value))
      );
      if (possibleAccountInRef) {
        extractedAcc = normalizeAccount(possibleAccountInRef.value);
      }
    }

    const isAccountValid = validAccountValues.includes(extractedAcc);
    const isConvenioValid = validConvenioValues.includes(extractedAcc);
    const isRefValid = COMMON_REFERENCES.some(ref => normalizeAccount(ref) === extractedAcc);

    // Permitir si es tarjeta autorizada, Cervecería Unión, O si fue aprobado por entrenamiento
    if (!isAccountValid && !isConvenioValid && !isRefValid && !isCreditCardPayment && !isCerveceriaUnion && !approvedByTraining) {
      const relaxedMatch = [...currentAccounts, ...currentConvenios].some(item => {
        const normAllowed = normalizeAccount(item.value);
        return extractedAcc.includes(normAllowed) || (data.rawText && data.rawText.replace(/\s/g, '').includes(normAllowed));
      });

      if (!relaxedMatch) {
        return {
          status: ValidationStatus.INVALID_ACCOUNT,
          message: `Cuenta/Convenio '${data.accountOrConvenio || 'No detectado'}' no autorizado.`
        };
      }
    }

    // Si fue aprobado por entrenamiento, log para debug
    if (approvedByTraining) {
      console.log(`✅ Recibo aprobado por entrenamiento - saltando validación estricta de cuenta/convenio`);
    }

    // =====================================================
    // VERIFICACIÓN INTELIGENTE: Solo pedir verificación
    // cuando hay EVIDENCIA CLARA de problemas
    // =====================================================
    const confidenceScore = data.confidenceScore ?? 100;

    // Solo pedir verificación si:
    // 1. hasAmbiguousNumbers es true Y hay campos específicos listados (no genérico)
    // 2. O la confianza es MUY baja (menor a 70%)

    const hasSpecificAmbiguity = data.hasAmbiguousNumbers === true &&
      data.ambiguousFields &&
      data.ambiguousFields.length > 0;

    const hasVeryLowConfidence = confidenceScore < 55; // Solo si es MUY bajo (sin consenso en triple verificación)

    // Verificación solo para casos claros de duda
    if (hasSpecificAmbiguity || hasVeryLowConfidence) {
      const reasons = [];
      if (hasSpecificAmbiguity) {
        reasons.push(`campos dudosos: ${data.ambiguousFields!.join(', ')}`);
      }
      if (hasVeryLowConfidence) {
        reasons.push(`confianza muy baja: ${confidenceScore}%`);
      }

      return {
        status: ValidationStatus.PENDING_VERIFICATION,
        message: `🔍 VERIFICAR: ${reasons.join(', ')}. Compare los números con la imagen.`
      };
    }

    // Si la confianza está entre 70-80%, aprobar pero con nota
    // Si está por encima de 80%, aprobar normalmente
    return { status: ValidationStatus.VALID, message: 'OK' };
  };

  const handleFileSelect = useCallback(async (files: File[]) => {
    setStatus(ProcessingStatus.ANALYZING);
    setErrorMsg(null);
    setActiveTab('UPLOAD');

    try {
      const processFile = async (file: File): Promise<Partial<ConsignmentRecord> | null> => {
        try {
          // 1. Validar y comprimir imagen
          const compressionResult = await processImageFile(file);

          if (!compressionResult.success) {
            console.error('Error procesando imagen:', compressionResult.error);
            return {
              id: crypto.randomUUID(),
              imageUrl: '',
              status: ValidationStatus.UNKNOWN_ERROR,
              statusMessage: compressionResult.error || "Error al procesar imagen",
              createdAt: Date.now(),
              bankName: 'Error',
              city: null,
              amount: 0,
              date: '',
              time: null,
              uniqueTransactionId: null,
              rrn: null,
              recibo: null,
              apro: null,
              operacion: null,
              comprobante: null,
              paymentReference: null,
              clientCode: null,
              accountOrConvenio: '',
              confidenceScore: 0,
              hasAmbiguousNumbers: false,
              ambiguousFields: [],
              isScreenshot: false,
              hasPhysicalReceipt: false,
              imageQualityScore: 0,
              isReadable: false,
              rawText: ''
            };
          }

          const base64Data = compressionResult.data!;
          const base64String = `data:${compressionResult.mimeType};base64,${base64Data}`;

          // 2. Generar hash de la imagen para detectar duplicados exactos
          const imageHash = await generateImageHash(base64Data);

          // 3. Analizar con sistema multi-modelo (Gemini/GPT-4/Consenso)
          try {
            console.log(`🤖 Analizando con modelo: ${aiConfig.preferredModel}`);

            const analysisResult = await analyzeReceipt(
              base64Data,
              imageHash,
              aiConfig.preferredModel as AIModel,
              compressionResult.mimeType,
              aiConfig.enableCache,
              aiConfig.useTrainingExamples,
              aiConfig.maxTrainingExamples
            );

            console.log(`✅ Análisis completado en ${analysisResult.analysisTime}ms`);
            console.log(`📦 Desde caché: ${analysisResult.fromCache ? 'Sí' : 'No'}`);
            console.log(`🔷 Modelo usado: ${analysisResult.model}`);

            return {
              ...analysisResult.data,
              id: crypto.randomUUID(),
              imageUrl: base64String,
              imageHash: imageHash,
              createdAt: Date.now(),
              analyzedWith: analysisResult.model,
              fromCache: analysisResult.fromCache,
              analysisTime: analysisResult.analysisTime
            };
          } catch (err: any) {
            console.error('Error en análisis IA:', err);
            return {
              id: crypto.randomUUID(),
              imageUrl: base64String,
              imageHash: imageHash,
              status: ValidationStatus.UNKNOWN_ERROR,
              statusMessage: err?.message || "Error lectura IA",
              createdAt: Date.now(),
              bankName: 'Error',
              city: null,
              amount: 0,
              date: '',
              time: null,
              uniqueTransactionId: null,
              rrn: null,
              recibo: null,
              apro: null,
              operacion: null,
              comprobante: null,
              paymentReference: null,
              clientCode: null,
              accountOrConvenio: '',
              confidenceScore: 0,
              hasAmbiguousNumbers: false,
              ambiguousFields: [],
              isScreenshot: false,
              hasPhysicalReceipt: false,
              imageQualityScore: 0,
              isReadable: false,
              rawText: ''
            };
          }
        } catch (error: any) {
          console.error('Error general procesando archivo:', error);
          return {
            id: crypto.randomUUID(),
            imageUrl: '',
            status: ValidationStatus.UNKNOWN_ERROR,
            statusMessage: error?.message || "Error inesperado al procesar imagen",
            createdAt: Date.now(),
            bankName: 'Error',
            city: null,
            amount: 0,
            date: '',
            time: null,
            uniqueTransactionId: null,
            rrn: null,
            recibo: null,
            apro: null,
            operacion: null,
            comprobante: null,
            paymentReference: null,
            clientCode: null,
            accountOrConvenio: '',
            confidenceScore: 0,
            hasAmbiguousNumbers: false,
            ambiguousFields: [],
            isScreenshot: false,
            hasPhysicalReceipt: false,
            imageQualityScore: 0,
            isReadable: false,
            rawText: ''
          };
        }
      };

      const rawResults = await Promise.all(files.map(processFile));
      const validRawResults = rawResults.filter((r): r is Partial<ConsignmentRecord> => r !== null);

      if (validRawResults.length === 0 && files.length > 0) {
        setErrorMsg("No se pudieron leer los archivos.");
        setStatus(ProcessingStatus.ERROR);
        return;
      }

      const newRecords: ConsignmentRecord[] = [];
      // Use local records for duplication check within the same batch
      let currentBatchHistory = [...localRecords];

      for (const raw of validRawResults) {
        if (raw.status === ValidationStatus.UNKNOWN_ERROR) {
          newRecords.push(raw as ConsignmentRecord);
          continue;
        }

        // Pass raw data with imageHash to validation
        const validation = validateRecord(
          raw as (ExtractedData & { imageHash?: string }),
          currentBatchHistory,
          allowedAccounts,
          allowedConvenios
        );

        const finalRecord: ConsignmentRecord = {
          ...(raw as ExtractedData),
          id: raw.id!,
          imageUrl: raw.imageUrl!,
          imageHash: raw.imageHash, // Include image hash
          createdAt: raw.createdAt!,
          status: validation.status,
          statusMessage: validation.message
        };

        newRecords.push(finalRecord);
        // Add to batch history if valid, to prevent duplicates within same upload
        if (finalRecord.status === ValidationStatus.VALID) {
          currentBatchHistory = [finalRecord, ...currentBatchHistory];
        }
      }

      setLocalRecords(prev => [...newRecords, ...prev]);
      setStatus(ProcessingStatus.SUCCESS);
    } catch (error) {
      console.error(error);
      setErrorMsg("Error inesperado.");
      setStatus(ProcessingStatus.ERROR);
    }
  }, [localRecords, sheetRecords, allowedAccounts, allowedConvenios, trainingRecords]);

  const handleSync = async () => {
    const validRecords = localRecords.filter(r => r.status === ValidationStatus.VALID);

    if (validRecords.length === 0) {
      alert("No hay registros 'Aprobados' nuevos para enviar.");
      return;
    }

    setIsSyncing(true);
    const result = await sendToGoogleSheets(validRecords, scriptUrl);
    setIsSyncing(false);

    alert(result.message);

    if (result.success) {
      // Clear valid local records after sync
      setLocalRecords(prev => prev.filter(r => r.status !== ValidationStatus.VALID));
      // Refresh history
      loadSheetHistory();
      setActiveTab('HISTORY');
    }
  };

  const handleDelete = (id: string) => {
    setLocalRecords(prev => prev.filter(r => r.id !== id));
  };

  // Handle authorization request
  const handleAuthorizeRequest = (id: string) => {
    setRecordToAuthorize(id);
    setAuthModalOpen(true);
  };

  // Handle authorization submission
  const handleAuthorizeSubmit = (authData: { imageUrl: string; authorizedBy: string }) => {
    if (!recordToAuthorize) return;

    setLocalRecords(prev => prev.map(record => {
      if (record.id === recordToAuthorize) {
        return {
          ...record,
          status: ValidationStatus.VALID,
          statusMessage: `✓ Autorizado manualmente por ${authData.authorizedBy}`,
          authorizationUrl: authData.imageUrl,
          authorizedBy: authData.authorizedBy,
          authorizedAt: Date.now()
        };
      }
      return record;
    }));

    setRecordToAuthorize(null);
    setAuthModalOpen(false);
  };

  // Get record to authorize for modal
  const getRecordToAuthorize = () => {
    if (!recordToAuthorize) return null;
    return localRecords.find(r => r.id === recordToAuthorize);
  };

  // Handle verification request
  const handleVerifyRequest = (id: string) => {
    setRecordToVerify(id);
    setVerifyModalOpen(true);
  };

  // Helper: Verificar si un número ya existe en los registros
  const checkDuplicateNumber = (value: string | undefined, currentRecordId: string): { isDuplicate: boolean; field?: string } => {
    if (!value || value.trim() === '') return { isDuplicate: false };

    const normalizedValue = String(value).trim().toLowerCase();
    const numericValue = normalizedValue.replace(/\D/g, '');

    // Buscar en registros locales (excluyendo el registro actual)
    const allRecordsToCheck = [
      ...localRecords.filter(r => r.id !== currentRecordId),
      ...sheetRecords
    ];

    for (const record of allRecordsToCheck) {
      const existingIds = [
        { field: 'OPERACION', value: record.operacion },
        { field: 'RRN', value: record.rrn },
        { field: 'RECIBO', value: record.recibo },
        { field: 'APRO', value: record.apro },
        { field: 'COMPROBANTE', value: record.comprobante },
        { field: 'ID', value: record.uniqueTransactionId }
      ];

      for (const existing of existingIds) {
        if (!existing.value) continue;
        const existingNormalized = String(existing.value).trim().toLowerCase();
        const existingNumeric = existingNormalized.replace(/\D/g, '');

        // Comparación exacta o numérica
        if (existingNormalized === normalizedValue ||
          (numericValue.length >= 4 && existingNumeric === numericValue)) {
          return { isDuplicate: true, field: existing.field };
        }
      }
    }

    return { isDuplicate: false };
  };

  // Handle verification submission
  const handleVerifySubmit = (verifiedData: {
    operacion?: string;
    rrn?: string;
    recibo?: string;
    apro?: string;
    comprobante?: string;
    verifiedBy: string;
  }) => {
    if (!recordToVerify) return;

    // ⛔ VALIDACIÓN CRÍTICA: Verificar que los números NO sean duplicados
    const numbersToCheck = [
      { field: 'OPERACION', value: verifiedData.operacion },
      { field: 'RRN', value: verifiedData.rrn },
      { field: 'RECIBO', value: verifiedData.recibo },
      { field: 'APRO', value: verifiedData.apro },
      { field: 'COMPROBANTE', value: verifiedData.comprobante }
    ];

    for (const num of numbersToCheck) {
      if (!num.value) continue;
      const duplicateCheck = checkDuplicateNumber(num.value, recordToVerify);
      if (duplicateCheck.isDuplicate) {
        // ⛔ DUPLICADO ENCONTRADO - No aprobar, marcar como duplicado
        setLocalRecords(prev => prev.map(record => {
          if (record.id === recordToVerify) {
            return {
              ...record,
              operacion: verifiedData.operacion || record.operacion,
              rrn: verifiedData.rrn || record.rrn,
              recibo: verifiedData.recibo || record.recibo,
              apro: verifiedData.apro || record.apro,
              comprobante: verifiedData.comprobante || record.comprobante,
              status: ValidationStatus.DUPLICATE,
              statusMessage: `⛔ DUPLICADO: ${num.field} "${num.value}" ya existe en la base de datos`,
              verifiedNumbers: true,
              verifiedBy: verifiedData.verifiedBy,
              verifiedAt: Date.now()
            };
          }
          return record;
        }));

        alert(`⛔ ERROR: El número ${num.field} "${num.value}" ya existe en la base de datos.\n\nEste recibo NO puede ser aprobado porque sería un DUPLICADO.`);
        setRecordToVerify(null);
        setVerifyModalOpen(false);
        return;
      }
    }

    // ✅ No hay duplicados - Aprobar el registro
    setLocalRecords(prev => prev.map(record => {
      if (record.id === recordToVerify) {
        const originalNumbers = {
          operacion: record.operacion || undefined,
          rrn: record.rrn || undefined,
          recibo: record.recibo || undefined,
          apro: record.apro || undefined,
          comprobante: record.comprobante || undefined,
        };

        return {
          ...record,
          operacion: verifiedData.operacion || record.operacion,
          rrn: verifiedData.rrn || record.rrn,
          recibo: verifiedData.recibo || record.recibo,
          apro: verifiedData.apro || record.apro,
          comprobante: verifiedData.comprobante || record.comprobante,
          status: ValidationStatus.VALID,
          statusMessage: `✓ Números verificados por ${verifiedData.verifiedBy}`,
          verifiedNumbers: true,
          verifiedBy: verifiedData.verifiedBy,
          verifiedAt: Date.now(),
          originalNumbers
        };
      }
      return record;
    }));

    setRecordToVerify(null);
    setVerifyModalOpen(false);
  };

  // Get record to verify for modal
  const getRecordToVerify = () => {
    if (!recordToVerify) return null;
    return localRecords.find(r => r.id === recordToVerify);
  };

  // Determine what to show
  const displayedRecords = activeTab === 'UPLOAD' ? localRecords : sheetRecords;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        onOpenConfig={() => setConfigOpen(true)}
        onSync={handleSync}
        isSyncing={isSyncing}
      />

      <main className="flex-grow max-w-[95%] w-full mx-auto px-4 py-8">

        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('UPLOAD')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'UPLOAD'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Validación en Curso (Nuevos)
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'HISTORY'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Historial Base de Datos {isLoadingHistory && '(Cargando...)'}
          </button>
          <button
            onClick={() => setActiveTab('TRAINING')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'TRAINING'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            🎓 Entrenamiento IA ({trainingRecords.length})
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-6">
            {activeTab === 'UPLOAD' && (
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Cargar Imágenes</h2>
                <UploadZone onFileSelect={handleFileSelect} status={status} />
                {errorMsg && (
                  <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                    {errorMsg}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'HISTORY' && (
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Estado</h2>
                {historyError ? (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg mb-3">
                    {historyError}
                  </div>
                ) : (
                  <p className="text-sm text-green-600 mb-4">Conectado a Google Sheets</p>
                )}

                <button
                  onClick={() => loadSheetHistory()}
                  className="w-full bg-brand-100 text-brand-700 py-2 rounded-lg hover:bg-brand-200 transition-colors mb-4"
                >
                  Actualizar Datos
                </button>
                <div className="text-xs text-gray-500">
                  Mostrando las últimas 100 consignaciones aceptadas.
                </div>
              </div>
            )}

            {activeTab === 'TRAINING' && (
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">🎓 Entrenamiento</h2>
                <p className="text-sm text-gray-600 mb-4">
                  {trainingRecords.length} registros de entrenamiento guardados
                </p>

                <button
                  onClick={() => loadTrainingData()}
                  className="w-full bg-brand-100 text-brand-700 py-2 rounded-lg hover:bg-brand-200 transition-colors mb-3"
                  disabled={isLoadingTraining}
                >
                  {isLoadingTraining ? '⏳ Cargando...' : '📥 Actualizar desde Sheets'}
                </button>

                <button
                  onClick={handleExportTraining}
                  className="w-full bg-purple-100 text-purple-700 py-2 rounded-lg hover:bg-purple-200 transition-colors"
                  disabled={trainingRecords.length === 0}
                >
                  💾 Exportar JSON
                </button>

                <div className="mt-4 p-3 bg-green-50 rounded-lg text-xs text-green-800">
                  <strong>✅ Sincronización Automática:</strong>
                  <p className="mt-1">Los entrenamientos se guardan automáticamente en Google Sheets cuando los creas.</p>
                </div>

                <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-xs text-yellow-800">
                  <strong>💡 Cómo entrenar:</strong>
                  <ol className="mt-2 space-y-1 list-decimal pl-4">
                    <li>Sube recibos en "Validación en Curso"</li>
                    <li>Haz clic en "🎓 Entrenar IA"</li>
                    <li>Corrige los datos si hay errores</li>
                    <li>Marca como ACEPTAR o RECHAZAR</li>
                    <li>Se guarda automáticamente en Sheets</li>
                  </ol>
                </div>
              </div>
            )}

            <div className="bg-indigo-50 p-4 rounded-xl text-sm text-indigo-800">
              <p className="font-bold mb-2">Validación Exhaustiva:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li><strong>⛔ Números Únicos:</strong> RRN, RECIBO, APRO, OPERACION deben ser ÚNICOS. Si alguno se repite = DUPLICADO.</li>
                <li><strong>📸 Imagen:</strong> Detecta si la misma foto se sube dos veces (hash).</li>
                <li><strong>✅ Montos/Fechas:</strong> Pueden repetirse si los números de aprobación son diferentes.</li>
                <li><strong>✅ Convenios:</strong> Pueden repetirse (múltiples clientes al mismo convenio).</li>
                <li><strong>Calidad:</strong> Mínimo 3 de 5 estrellas (60/100).</li>
                <li><strong>Prioridad:</strong> Los números únicos son definitivos. Heurísticas solo si no hay números.</li>
              </ul>
            </div>
          </div>

          <div className="lg:col-span-3">
            {activeTab === 'TRAINING' ? (
              <TrainingSection
                records={trainingRecords}
                onDelete={handleDeleteTraining}
                onViewImage={(url) => setSelectedImage(url)}
                onExport={handleExportTraining}
              />
            ) : (
              <>
                <Stats records={displayedRecords} />

                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {activeTab === 'UPLOAD' ? 'Registros Locales (Sin Sincronizar)' : 'Registros en la Nube'} ({displayedRecords.length})
                  </h2>
                  {activeTab === 'UPLOAD' && localRecords.length > 0 && (
                    <button onClick={() => setLocalRecords([])} className="text-sm text-red-600 hover:underline">
                      Limpiar Todo
                    </button>
                  )}
                </div>

                <ConsignmentTable
                  records={displayedRecords}
                  onDelete={activeTab === 'UPLOAD' ? handleDelete : () => { }}
                  onViewImage={(url) => setSelectedImage(url)}
                  onAuthorize={activeTab === 'UPLOAD' ? handleAuthorizeRequest : undefined}
                  onVerifyNumbers={activeTab === 'UPLOAD' ? handleVerifyRequest : undefined}
                  onTrain={activeTab === 'UPLOAD' ? handleTrainRecord : undefined}
                  accounts={allowedAccounts}
                  convenios={allowedConvenios}
                />
              </>
            )}
          </div>
        </div>
      </main>

      <ImageModal
        isOpen={!!selectedImage}
        imageUrl={selectedImage}
        onClose={() => setSelectedImage(null)}
      />

      <ConfigModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        accounts={allowedAccounts}
        convenios={allowedConvenios}
        onUpdateAccounts={setAllowedAccounts}
        onUpdateConvenios={setAllowedConvenios}
        onResetDefaults={handleResetDefaults}
        onSyncToSheets={syncAccountsToSheets}
        onLoadFromSheets={() => loadAccountsFromSheets(scriptUrl)}
        onOpenReceiptTypeConfig={() => {
          setConfigOpen(false);
          setReceiptTypeConfigOpen(true);
        }}
        aiConfig={aiConfig}
        onSaveAIConfig={handleSaveAIConfig}
        cacheStats={cacheStats}
        onClearCache={handleClearCache}
      />

      <ReceiptTypeConfigModal
        isOpen={receiptTypeConfigOpen}
        onClose={() => setReceiptTypeConfigOpen(false)}
        onSave={handleSaveReceiptTypeConfig}
        initialConfigs={receiptTypeConfigs}
      />

      <AuthorizationModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setRecordToAuthorize(null);
        }}
        onAuthorize={handleAuthorizeSubmit}
        recordAmount={getRecordToAuthorize()?.amount}
        recordDate={getRecordToAuthorize()?.date}
      />

      <VerifyNumbersModal
        isOpen={verifyModalOpen}
        record={getRecordToVerify()}
        onClose={() => {
          setVerifyModalOpen(false);
          setRecordToVerify(null);
        }}
        onVerify={handleVerifySubmit}
      />

      <TrainingModal
        isOpen={trainingModalOpen}
        onClose={() => {
          setTrainingModalOpen(false);
          setRecordToTrain(null);
        }}
        onSave={handleSaveTraining}
        imageUrl={recordToTrain?.imageUrl || ''}
        aiExtractedData={recordToTrain ? {
          bankName: recordToTrain.bankName,
          city: recordToTrain.city,
          accountOrConvenio: recordToTrain.accountOrConvenio,
          amount: recordToTrain.amount,
          date: recordToTrain.date,
          time: recordToTrain.time,
          uniqueTransactionId: recordToTrain.uniqueTransactionId,
          rrn: recordToTrain.rrn,
          recibo: recordToTrain.recibo,
          apro: recordToTrain.apro,
          operacion: recordToTrain.operacion,
          comprobante: recordToTrain.comprobante,
          paymentReference: recordToTrain.paymentReference,
          clientCode: recordToTrain.clientCode,
          creditCardLast4: recordToTrain.creditCardLast4,
          isCreditCardPayment: recordToTrain.isCreditCardPayment,
          confidenceScore: recordToTrain.confidenceScore,
          hasAmbiguousNumbers: recordToTrain.hasAmbiguousNumbers,
          ambiguousFields: recordToTrain.ambiguousFields,
          isScreenshot: recordToTrain.isScreenshot,
          hasPhysicalReceipt: recordToTrain.hasPhysicalReceipt,
          imageQualityScore: recordToTrain.imageQualityScore,
          isReadable: recordToTrain.isReadable,
          rawText: recordToTrain.rawText
        } : {
          bankName: '',
          city: null,
          accountOrConvenio: '',
          amount: 0,
          date: '',
          time: null,
          uniqueTransactionId: null,
          rrn: null,
          recibo: null,
          apro: null,
          operacion: null,
          comprobante: null,
          paymentReference: null,
          clientCode: null,
          creditCardLast4: null,
          isCreditCardPayment: false,
          confidenceScore: 0,
          hasAmbiguousNumbers: false,
          ambiguousFields: [],
          isScreenshot: false,
          hasPhysicalReceipt: false,
          imageQualityScore: 0,
          isReadable: false,
          rawText: ''
        }}
      />
    </div>
  );
};

export default App;