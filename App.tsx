import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { Stats } from './components/Stats';
import { ConsignmentTable } from './components/ConsignmentTable';
import { ImageModal } from './components/ImageModal';
import { ConfigModal } from './components/ConfigModal';
import { analyzeConsignmentImage } from './services/geminiService';
import { sendToGoogleSheets, fetchHistoryFromSheets } from './services/sheetsService';
import { ConsignmentRecord, ProcessingStatus, ValidationStatus, ExtractedData, ConfigItem } from './types';
import { ALLOWED_ACCOUNTS, ALLOWED_CONVENIOS, COMMON_REFERENCES, normalizeAccount, MIN_QUALITY_SCORE, GOOGLE_SCRIPT_URL } from './constants';

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

    // 1. Quality Check
    if (!data.isReadable || data.imageQualityScore < MIN_QUALITY_SCORE) {
      return {
        status: ValidationStatus.LOW_QUALITY,
        message: `Calidad insuficiente (${data.imageQualityScore}/100, requiere ${MIN_QUALITY_SCORE}).`
      };
    }

    // 2. DUPLICATE CHECKING (EXHAUSTIVE - NO DUPLICATES ALLOWED)
    const allRecords = [...existingRecords, ...sheetRecords];

    // A-0. IMAGE HASH CHECK (Detect exact same image file)
    // Si es exactamente la misma imagen -> duplicado inmediato
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

    // A. MÚLTIPLES NÚMEROS DE APROBACIÓN - TODOS DEBEN SER ÚNICOS
    // Validar CADA número único que esté presente (RRN, RECIBO, APRO, OPERACION, COMPROBANTE)
    
    const uniqueIds = [
      { field: 'RRN', value: data.rrn },
      { field: 'RECIBO', value: data.recibo },
      { field: 'APRO', value: data.apro },
      { field: 'OPERACION', value: data.operacion },
      { field: 'COMPROBANTE', value: data.comprobante },
      { field: 'ID TRANSACCIÓN', value: data.uniqueTransactionId }
    ];
    
    for (const idEntry of uniqueIds) {
      if (!idEntry.value || idEntry.value.trim().length === 0) continue;
      
      const rawNewId = idEntry.value.trim();
      const fieldName = idEntry.field;
      
      // NIVEL 1: Verificación EXACTA contra TODOS los campos de IDs en registros existentes
      const exactDuplicate = allRecords.find(r => {
        // Comparar contra TODOS los posibles campos de ID
        const existingIds = [
          r.rrn,
          r.recibo,
          r.apro,
          r.operacion,
          r.comprobante,
          r.uniqueTransactionId
        ];
        
        return existingIds.some(existingId => {
          if (!existingId) return false;
          const rawExisting = existingId.trim();
          // Comparación case-insensitive
          return rawExisting.toLowerCase() === rawNewId.toLowerCase();
        });
      });
      
      if (exactDuplicate) {
        return { 
          status: ValidationStatus.DUPLICATE, 
          message: `⛔ ${fieldName} DUPLICADO: "${rawNewId}" ya existe en la base de datos` 
        };
      }
      
      // NIVEL 2: Verificación NUMÉRICA (solo dígitos, para detectar variaciones de formato)
      const normalizedNew = rawNewId.replace(/\D/g, '');
      
      if (normalizedNew.length >= 4) {
        const numericDuplicate = allRecords.find(r => {
          const existingIds = [
            r.rrn,
            r.recibo,
            r.apro,
            r.operacion,
            r.comprobante,
            r.uniqueTransactionId
          ];
          
          return existingIds.some(existingId => {
            if (!existingId) return false;
            const normalizedExisting = existingId.replace(/\D/g, '');
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
    
    // B. EXACT AMOUNT + DATE + TIME CHECK (For receipts with timestamp)
    // Si tienen mismo monto EXACTO, fecha y hora -> Es duplicado
    const exactTimeDuplicate = allRecords.find(r => {
      const exactAmount = r.amount === data.amount; // Monto EXACTO (sin tolerancia)
      const sameDate = r.date === data.date;
      const sameTime = r.time && data.time && r.time.substring(0, 5) === data.time.substring(0, 5);
      
      // Monto exacto + fecha + hora = duplicado
      if (exactAmount && sameDate && sameTime) return true;
      
      return false;
    });

    if (exactTimeDuplicate) {
      return { 
        status: ValidationStatus.DUPLICATE, 
        message: `Duplicado: Monto exacto ($${data.amount}), fecha (${data.date}) y hora (${data.time})` 
      };
    }

    // C. EXACT AMOUNT + DATE + BANK + CLIENT REFERENCE CHECK
    // Para recibos sin hora pero con referencia de cliente
    const exactRefDuplicate = allRecords.find(r => {
      const exactAmount = r.amount === data.amount;
      const sameDate = r.date === data.date;
      const sameBank = r.bankName && data.bankName && 
        normalizeAccount(r.bankName) === normalizeAccount(data.bankName);
      
      // Normalizar referencias de cliente para comparación
      const ref1 = r.paymentReference ? normalizeAccount(r.paymentReference) : '';
      const ref2 = data.paymentReference ? normalizeAccount(data.paymentReference) : '';
      const sameClientRef = ref1.length > 3 && ref2.length > 3 && ref1 === ref2;

      // Monto exacto + fecha + banco + referencia cliente = duplicado
      if (exactAmount && sameDate && sameBank && sameClientRef) return true;

      return false;
    });

    if (exactRefDuplicate) {
      return { 
        status: ValidationStatus.DUPLICATE, 
        message: `Duplicado: Monto exacto ($${data.amount}), fecha, banco y referencia de cliente` 
      };
    }

    // D. EXACT AMOUNT + DATE + ACCOUNT/CONVENIO + CLIENT REFERENCE
    // Nota: El convenio solo NO es suficiente (muchos clientes pagan al mismo convenio)
    // Pero monto exacto + fecha + convenio + referencia cliente = duplicado
    const exactAccountDuplicate = allRecords.find(r => {
      const exactAmount = r.amount === data.amount;
      const sameDate = r.date === data.date;
      
      // Normalizar cuentas destino
      const acc1 = normalizeAccount(r.accountOrConvenio || '');
      const acc2 = normalizeAccount(data.accountOrConvenio || '');
      const sameAccount = acc1.length > 3 && acc2.length > 3 && acc1 === acc2;

      // Normalizar referencias de cliente
      const ref1 = r.paymentReference ? normalizeAccount(r.paymentReference) : '';
      const ref2 = data.paymentReference ? normalizeAccount(data.paymentReference) : '';
      const sameClientRef = ref1.length > 3 && ref2.length > 3 && ref1 === ref2;

      // Monto exacto + fecha + cuenta + referencia cliente = duplicado
      if (exactAmount && sameDate && sameAccount && sameClientRef) return true;

      return false;
    });

    if (exactAccountDuplicate) {
      return { 
        status: ValidationStatus.DUPLICATE, 
        message: `Duplicado: Monto exacto ($${data.amount}), fecha, cuenta/convenio y cliente` 
      };
    }

    // E. FALLBACK: EXACT AMOUNT + DATE without other identifiers
    // Solo si el monto es > 100,000 (montos grandes son más únicos)
    // Y no hay hora ni referencia para verificar
    if (data.amount >= 100000) {
      const hasNoTime = !data.time || data.time === '';
      const hasNoRef = !data.paymentReference || data.paymentReference === '';
      
      if (hasNoTime && hasNoRef) {
        const suspiciousDuplicate = allRecords.find(r => {
          const exactAmount = r.amount === data.amount;
          const sameDate = r.date === data.date;
          const sameBank = r.bankName && data.bankName && 
            normalizeAccount(r.bankName) === normalizeAccount(data.bankName);
          
          return exactAmount && sameDate && sameBank;
        });

        if (suspiciousDuplicate) {
          return { 
            status: ValidationStatus.DUPLICATE, 
            message: `Posible duplicado: Monto alto ($${data.amount}) y fecha coinciden. Verifique manualmente.` 
          };
        }
      }
    }

    // 3. ACCOUNT/CONVENIO CHECK
    let extractedAcc = normalizeAccount(data.accountOrConvenio || '');
    const validAccountValues = currentAccounts.map(item => normalizeAccount(item.value));
    const validConvenioValues = currentConvenios.map(item => normalizeAccount(item.value));

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

    if (!isAccountValid && !isConvenioValid && !isRefValid) {
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

    return { status: ValidationStatus.VALID, message: 'OK' };
  };

  const handleFileSelect = useCallback(async (files: File[]) => {
    setStatus(ProcessingStatus.ANALYZING);
    setErrorMsg(null);
    setActiveTab('UPLOAD');

    try {
      const processFile = async (file: File): Promise<Partial<ConsignmentRecord> | null> => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onloadend = async () => {
            const base64String = reader.result as string;
            const base64Data = base64String.split(',')[1];
            
            // Generate hash from image data to detect exact duplicate images
            const imageHash = await generateImageHash(base64Data);
            
            try {
              const extractedData = await analyzeConsignmentImage(base64Data);
              resolve({
                ...extractedData,
                id: crypto.randomUUID(),
                imageUrl: base64String,
                imageHash: imageHash,
                createdAt: Date.now()
              });
            } catch (err) {
              console.error(err);
              resolve({
                id: crypto.randomUUID(),
                imageUrl: base64String,
                imageHash: imageHash,
                status: ValidationStatus.UNKNOWN_ERROR,
                statusMessage: "Error lectura IA",
                createdAt: Date.now(),
                bankName: 'Error',
                amount: 0,
                date: '',
                time: null,
                uniqueTransactionId: null,
                paymentReference: null,
                accountOrConvenio: '',
                imageQualityScore: 0,
                isReadable: false,
                rawText: ''
              });
            }
          };
          reader.onerror = () => resolve(null);
        });
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
                <li><strong>⛔ Número de Aprobación:</strong> Debe ser ÚNICO. No se permiten duplicados.</li>
                <li><strong>📸 Imagen:</strong> Detecta si la misma foto se sube dos veces.</li>
                <li><strong>Calidad:</strong> Mínimo 3 de 5 estrellas (60/100).</li>
                <li><strong>Recibos Físicos:</strong> Validados por RRN/Recibo único.</li>
                <li><strong>Capturas Nequi:</strong> Validados por Fecha + Hora + Valor exacto.</li>
                <li><strong>Convenios:</strong> Los convenios pueden repetirse, pero NO los recibos.</li>
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
      />
    </div>
  );
};

export default App;