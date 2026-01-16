import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { Stats } from './components/Stats';
import { ConsignmentTable } from './components/ConsignmentTable';
import { ImageModal } from './components/ImageModal';
import { ConfigModal } from './components/ConfigModal';
import { AuthorizationModal } from './components/AuthorizationModal';
import { VerifyNumbersModal } from './components/VerifyNumbersModal';
import { analyzeConsignmentImage } from './services/geminiService';
import { sendToGoogleSheets, fetchHistoryFromSheets, fetchAccountsFromSheets, saveAccountsToSheets } from './services/sheetsService';
import { ConsignmentRecord, ProcessingStatus, ValidationStatus, ExtractedData, ConfigItem } from './types';
import { ALLOWED_ACCOUNTS, ALLOWED_CONVENIOS, COMMON_REFERENCES, normalizeAccount, MIN_QUALITY_SCORE, GOOGLE_SCRIPT_URL, CERVECERIA_UNION_CLIENT_CODE, CERVECERIA_UNION_KEYWORDS, CERVECERIA_UNION_CONVENIOS, MIN_CONFIDENCE_SCORE, MIN_THERMAL_QUALITY_SCORE, ALLOWED_CREDIT_CARDS } from './constants';
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
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'HISTORY'>('UPLOAD');

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

  const validateRecord = (
    data: ExtractedData & { imageHash?: string },
    existingRecords: ConsignmentRecord[],
    currentAccounts: ConfigItem[],
    currentConvenios: ConfigItem[]
  ): { status: ValidationStatus, message: string } => {

    // =====================================================
    // 0. VALIDACIONES CRÍTICAS DE SEGURIDAD (PRIMERO)
    // =====================================================

    // 0-A. VERIFICAR FECHA (CRÍTICO - SIN FECHA = RECHAZO)
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

    // 0-D. CAPTURAS DE PANTALLA SIN NÚMERO DE RECIBO = REQUIERE AUTORIZACIÓN
    const hasPhysicalReceiptNumber = Boolean(data.rrn || data.recibo || data.apro);
    const hasAnyTransactionId = Boolean(data.rrn || data.recibo || data.apro || data.operacion || data.comprobante || data.uniqueTransactionId);

    if (data.isScreenshot && !hasPhysicalReceiptNumber) {
      // Es una captura de pantalla sin número de recibo físico
      // Puede tener número de operación pero necesita autorización humana
      if (!hasAnyTransactionId) {
        return {
          status: ValidationStatus.MISSING_RECEIPT_NUMBER,
          message: '📱 REQUIERE AUTORIZACIÓN: Captura de pantalla sin número de recibo. Suba el certificado de autorización.'
        };
      }
      // Tiene operación/comprobante pero no recibo físico - también necesita revisión
      return {
        status: ValidationStatus.REQUIRES_AUTHORIZATION,
        message: '📱 REQUIERE AUTORIZACIÓN: Captura de app sin recibo físico. Suba documento de autorización para validar.'
      };
    }

    // =====================================================
    // 1. CALIDAD DE IMAGEN
    // =====================================================
    if (!data.isReadable || data.imageQualityScore < MIN_QUALITY_SCORE) {
      return {
        status: ValidationStatus.LOW_QUALITY,
        message: `Calidad insuficiente (${data.imageQualityScore}/100, requiere ${MIN_QUALITY_SCORE}).`
      };
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
    const isCreditCardPayment = ALLOWED_CREDIT_CARDS.some(card =>
      rawText.includes(card) || rawText.includes(`****${card}`) || rawText.includes(`*${card}`)
    );

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

    // Permitir si es tarjeta autorizada o Cervecería Unión
    if (!isAccountValid && !isConvenioValid && !isRefValid && !isCreditCardPayment && !isCerveceriaUnion) {
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

          // 3. Analizar con Gemini
          try {
            const extractedData = await analyzeConsignmentImage(base64Data, compressionResult.mimeType);
            return {
              ...extractedData,
              id: crypto.randomUUID(),
              imageUrl: base64String,
              imageHash: imageHash,
              createdAt: Date.now()
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
  }, [localRecords, sheetRecords, allowedAccounts, allowedConvenios]);

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
              accounts={allowedAccounts}
              convenios={allowedConvenios}
            />
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
    </div>
  );
};

export default App;