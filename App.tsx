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
    data: ExtractedData,
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

    // 2. DUPLICATE CHECKING (ULTRA STRICT)
    const allRecords = [...existingRecords, ...sheetRecords];

    // A. Strict Transaction ID Match (Most reliable)
    if (data.uniqueTransactionId && data.uniqueTransactionId.length > 3) {
      const idDuplicate = allRecords.find(r =>
        r.uniqueTransactionId &&
        r.uniqueTransactionId.replace(/\D/g, '') === data.uniqueTransactionId?.replace(/\D/g, '')
      );

      if (idDuplicate) {
        return { status: ValidationStatus.DUPLICATE, message: `ID Transacción duplicado: ${data.uniqueTransactionId}` };
      }
    }

    // B. Heuristic Match (If no ID available or ID is short/unreliable)
    // "Ultra-strict": If Amount AND Date AND Client Ref match -> Duplicate
    const heuristicDuplicate = allRecords.find(r => {
      const sameAmount = Math.abs(r.amount - data.amount) < 50; // Strict tolerance
      const sameDate = r.date === data.date;

      // Strict Time check: Only compare if BOTH have time. If exact string match, it's suspicious.
      const sameTime = (r.time && data.time)
        ? r.time === data.time
        : true; // If one is missing time, we can't rule out duplicate based on time

      // Client Reference check (e.g. Cedula)
      const sameRef = (r.paymentReference && data.paymentReference)
        ? normalizeAccount(r.paymentReference) === normalizeAccount(data.paymentReference)
        : false;

      // RULE 1: If Amount + Date + Client Ref match => Duplicate
      // (A client rarely pays exact same amount on same day without a unique ID)
      if (sameAmount && sameDate && sameRef) return true;

      // RULE 2: If Amount + Date + Time match (and time is present) => Duplicate
      // (Exact same minute is very suspicious for Nequi screenshots)
      if (sameAmount && sameDate && sameTime && r.time && data.time) return true;

      return false;
    });

    if (heuristicDuplicate) {
      return { status: ValidationStatus.DUPLICATE, message: 'Duplicado detectado (Fecha, Valor y Referencia/Hora coinciden)' };
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
            try {
              const extractedData = await analyzeConsignmentImage(base64Data);
              resolve({
                ...extractedData,
                id: crypto.randomUUID(),
                imageUrl: base64String,
                createdAt: Date.now()
              });
            } catch (err) {
              console.error(err);
              resolve({
                id: crypto.randomUUID(),
                imageUrl: base64String,
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
        const validation = validateRecord(raw as ExtractedData, currentBatchHistory, allowedAccounts, allowedConvenios);

        const finalRecord: ConsignmentRecord = {
          ...(raw as ExtractedData),
          id: raw.id!,
          imageUrl: raw.imageUrl!,
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
              <p className="font-bold mb-2">Validación Inteligente:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li><strong>Calidad:</strong> Mínimo 3 de 5 estrellas (60/100).</li>
                <li><strong>Recibos Físicos:</strong> Se validan por número de Recibo/RRN.</li>
                <li><strong>Capturas Nequi:</strong> Se validan por Fecha + Hora + Valor + Cédula.</li>
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