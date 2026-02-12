import { ExtractedData, AnalysisResult, AIModel, TrainingRecord } from '../types';
import { analyzeConsignmentImage as analyzeWithGemini } from './geminiService';
import { analyzeWithGPT4 } from './openaiService';
import { getCachedAnalysis, setCachedAnalysis } from './cacheService';
import { CERVECERIA_UNION_CLIENT_CODE, CERVECERIA_UNION_INTERNAL_REFS } from '../constants';

/**
 * Servicio orquestador de IA que maneja múltiples modelos
 * y caché de resultados
 */

/**
 * Reglas determinísticas para recibos "SU RED / MATRIX GIROS / BBVA".
 * Evita que el modelo confunda "Punto" con el identificador único real (UPC).
 */
function normalizeSuredBbvaReceipt(data: ExtractedData): ExtractedData {
    const text = data.rawText || '';
    const isSuredBbva =
        /su\s*red/i.test(text) &&
        /matrix\s+giros/i.test(text) &&
        /bbva/i.test(text);

    if (!isSuredBbva) return data;

    const upcMatch = text.match(/(?:^|\n)\s*upc\s*[:\-]?\s*([A-Z0-9]+)/im);
    const puntoMatch = text.match(/(?:^|\n)\s*punto\s*[:\-]?\s*([A-Z0-9]+)/im);
    const cuentaMatch = text.match(/(?:^|\n)\s*cuenta\s*[:\-]?\s*([Xx\*\d]+)/im);

    const upc = upcMatch?.[1]?.trim() || '';
    const punto = puntoMatch?.[1]?.trim() || '';
    const cuenta = cuentaMatch?.[1]?.trim() || '';

    if (!upc) return data;

    const normalized: ExtractedData = {
        ...data,
        bankName: 'BBVA',
        // Regla crítica: en este formato el identificador único es UPC, no Punto.
        uniqueTransactionId: upc,
        comprobante: upc,
        operacion: upc,
        accountOrConvenio: cuenta || data.accountOrConvenio,
        isScreenshot: false,
    };

    // Si el modelo puso "Punto" en otros campos, lo sobreescribimos por UPC.
    if (punto) {
        if (normalized.paymentReference && String(normalized.paymentReference).trim() === punto) {
            normalized.paymentReference = upc;
        }
        if (normalized.rrn && String(normalized.rrn).trim() === punto) {
            normalized.rrn = null;
        }
        if (normalized.recibo && String(normalized.recibo).trim() === punto) {
            normalized.recibo = null;
        }
        if (normalized.apro && String(normalized.apro).trim() === punto) {
            normalized.apro = null;
        }
    }

    return normalized;
}

function normalizeDigits(value?: string | null): string {
    if (!value) return '';
    return String(value).trim().replace(/\s+/g, '');
}

function applyCerveceriaReferenceRule(data: ExtractedData): ExtractedData {
    const text = (data.rawText || '').toLowerCase();
    const convenio = normalizeDigits(data.accountOrConvenio);
    const ref = normalizeDigits(data.paymentReference);
    const isCerveceria =
        text.includes('cerveceria union') ||
        text.includes('cervecería unión') ||
        text.includes('cervunion') ||
        convenio === '32137' ||
        convenio === '56885' ||
        convenio === '1709' ||
        convenio === '18129';

    if (!isCerveceria) return data;

    const hasInternalRef = CERVECERIA_UNION_INTERNAL_REFS.some(internal =>
        ref.includes(internal) || text.includes(internal)
    );

    return {
        ...data,
        clientCode: CERVECERIA_UNION_CLIENT_CODE,
        paymentReference: hasInternalRef ? CERVECERIA_UNION_CLIENT_CODE : (data.paymentReference || CERVECERIA_UNION_CLIENT_CODE),
    };
}

function normalizeBancolombiaAppReceipt(data: ExtractedData): ExtractedData {
    const text = data.rawText || '';
    const lower = text.toLowerCase();
    const isApp = lower.includes('pago exitoso') || lower.includes('transferencia exitosa') || lower.includes('comprobante no.');
    if (!isApp) return data;

    const comprobanteMatch = text.match(/comprobante\s*no\.?\s*[:\-]?\s*([A-Z0-9]+)/i);
    const convenioMatch = text.match(/(?:empresa o servicio|convenio)\s*[:\-]?\s*.*?(\d{4,8})/i);
    const productoDestinoMatch = text.match(/(?:producto destino|cuenta)\s*[:\-]?\s*([0-9\-* ]{4,})/i);

    const comprobante = normalizeDigits(comprobanteMatch?.[1] || data.comprobante || data.uniqueTransactionId);
    const convenio = normalizeDigits(convenioMatch?.[1] || data.accountOrConvenio);
    const producto = normalizeDigits(productoDestinoMatch?.[1] || '');

    return {
        ...data,
        isScreenshot: true,
        hasPhysicalReceipt: false,
        bankName: data.bankName && data.bankName !== 'No especificado' ? data.bankName : 'Bancolombia',
        comprobante: comprobante || data.comprobante,
        uniqueTransactionId: comprobante || data.uniqueTransactionId,
        operacion: data.operacion || comprobante || data.operacion,
        accountOrConvenio: convenio || data.accountOrConvenio || producto || data.accountOrConvenio,
    };
}

function normalizeRedebanLikeReceipt(data: ExtractedData): ExtractedData {
    const text = data.rawText || '';
    const lower = text.toLowerCase();
    const isRedebanLike = lower.includes('redeban') || lower.includes('corresponsal') || lower.includes('wompi');
    if (!isRedebanLike) return data;

    const rrn = normalizeDigits(text.match(/rrn\s*[:\-]?\s*([A-Z0-9]+)/i)?.[1] || data.rrn);
    const recibo = normalizeDigits(text.match(/recibo\s*[:\-]?\s*([A-Z0-9]+)/i)?.[1] || data.recibo);
    const apro = normalizeDigits(text.match(/apro\s*[:\-]?\s*([A-Z0-9]+)/i)?.[1] || data.apro);
    const convenio = normalizeDigits(text.match(/convenio\s*[:\-]?\s*([0-9]+)/i)?.[1] || data.accountOrConvenio);
    const ref = normalizeDigits(text.match(/ref(?:erencia)?\s*[:\-]?\s*([A-Z0-9]+)/i)?.[1] || data.paymentReference);

    const primaryId = recibo || data.comprobante || data.operacion || data.uniqueTransactionId;

    return {
        ...data,
        rrn: rrn || data.rrn,
        recibo: recibo || data.recibo,
        apro: apro || data.apro,
        accountOrConvenio: convenio || data.accountOrConvenio,
        paymentReference: ref || data.paymentReference,
        comprobante: data.comprobante || primaryId,
        uniqueTransactionId: data.uniqueTransactionId || primaryId,
    };
}

function applyDeterministicReceiptRules(data: ExtractedData): ExtractedData {
    const n1 = normalizeSuredBbvaReceipt(data);
    const n2 = normalizeBancolombiaAppReceipt(n1);
    const n3 = normalizeRedebanLikeReceipt(n2);
    return applyCerveceriaReferenceRule(n3);
}

/**
 * Cargar ejemplos de entrenamiento del localStorage
 */
function loadTrainingExamples(maxExamples: number = 10): TrainingRecord[] {
    try {
        const trainingDataRaw = localStorage.getItem('training_records');
        if (!trainingDataRaw) return [];

        const allRecords: TrainingRecord[] = JSON.parse(trainingDataRaw);

        // Filtrar solo registros aceptados
        const acceptedRecords = allRecords.filter(r => r.decision === 'ACCEPT');

        // Eliminar duplicados por hash
        const uniqueRecords: TrainingRecord[] = [];
        const seenHashes = new Set<string>();

        for (const record of acceptedRecords) {
            if (record.imageHash) {
                if (seenHashes.has(record.imageHash)) continue;
                seenHashes.add(record.imageHash);
            }
            uniqueRecords.push(record);
        }

        // Retornar los más recientes
        return uniqueRecords
            .sort((a, b) => (b.trainedAt || 0) - (a.trainedAt || 0))
            .slice(0, maxExamples);

    } catch (error) {
        console.warn('Error al cargar entrenamientos:', error);
        return [];
    }
}

/**
 * Analizar recibo con el modelo especificado
 */
export async function analyzeReceipt(
    base64Image: string,
    imageHash: string,
    model: AIModel,
    mimeType: string = 'image/jpeg',
    useCache: boolean = true,
    useTraining: boolean = true,
    maxTrainingExamples: number = 10
): Promise<AnalysisResult> {

    const startTime = Date.now();

    // 1. Verificar caché primero
    if (useCache) {
        const cached = getCachedAnalysis(imageHash);
        if (cached) {
            console.log(`📦 Resultado encontrado en caché (modelo: ${cached.model})`);
            return {
                data: cached.result,
                model: cached.model,
                fromCache: true,
                analysisTime: Date.now() - startTime
            };
        }
    }

    // 2. Cargar ejemplos de entrenamiento si está habilitado
    const trainingExamples = useTraining ? loadTrainingExamples(maxTrainingExamples) : [];

    if (trainingExamples.length > 0) {
        console.log(`📚 Cargados ${trainingExamples.length} ejemplos de entrenamiento`);
    }

    // 3. Ejecutar análisis según modelo seleccionado
    let result: ExtractedData;
    let usedModel: AIModel;

    try {
        switch (model) {
            case AIModel.GEMINI:
                console.log('🔷 Analizando con Gemini 1.5 Flash...');
                result = applyDeterministicReceiptRules(await analyzeWithGemini(base64Image, mimeType));
                usedModel = AIModel.GEMINI;
                break;

            case AIModel.GPT4_MINI:
                console.log('🟢 Analizando con GPT-4o-mini...');
                result = applyDeterministicReceiptRules(await analyzeWithGPT4(base64Image, mimeType, trainingExamples));
                usedModel = AIModel.GPT4_MINI;
                break;

            case AIModel.CONSENSUS:
                console.log('🔄 Modo consenso: analizando con ambos modelos...');
                const [geminiResult, gpt4Result] = await Promise.all([
                    analyzeWithGemini(base64Image, mimeType),
                    analyzeWithGPT4(base64Image, mimeType, trainingExamples)
                ]);
                const normalizedGemini = applyDeterministicReceiptRules(geminiResult);
                const normalizedGpt4 = applyDeterministicReceiptRules(gpt4Result);

                // Comparar resultados
                const agreement = calculateAgreement(normalizedGemini, normalizedGpt4);
                console.log(`📊 Nivel de acuerdo entre modelos: ${agreement}%`);

                // Si hay alto acuerdo, usar el de mayor confianza
                if (agreement >= 80) {
                    result = normalizedGemini.confidenceScore >= normalizedGpt4.confidenceScore
                        ? normalizedGemini
                        : normalizedGpt4;
                    usedModel = normalizedGemini.confidenceScore >= normalizedGpt4.confidenceScore
                        ? AIModel.GEMINI
                        : AIModel.GPT4_MINI;
                } else {
                    // Bajo acuerdo: usar GPT-4 pero marcar para verificación
                    console.warn('⚠️ Modelos difieren significativamente');
                    result = {
                        ...normalizedGpt4,
                        confidenceScore: Math.min(normalizedGpt4.confidenceScore, 70),
                        hasAmbiguousNumbers: true,
                        ambiguousFields: [
                            ...(normalizedGpt4.ambiguousFields || []),
                            'consensus_disagreement'
                        ]
                    };
                    usedModel = AIModel.CONSENSUS;
                }

                // Agregar metadata de consenso
                const analysisResult: AnalysisResult = {
                    data: result,
                    model: usedModel,
                    fromCache: false,
                    analysisTime: Date.now() - startTime,
                    consensusAgreement: agreement
                };

                // Guardar en caché
                if (useCache) {
                    setCachedAnalysis(imageHash, {
                        hash: imageHash,
                        result,
                        model: usedModel,
                        timestamp: Date.now(),
                        trainingVersion: 0 // Se actualiza en cacheService
                    });
                }

                return analysisResult;

            default:
                throw new Error(`Modelo no soportado: ${model}`);
        }

        // 4. Guardar en caché
        if (useCache) {
            setCachedAnalysis(imageHash, {
                hash: imageHash,
                result,
                model: usedModel,
                timestamp: Date.now(),
                trainingVersion: 0 // Se actualiza en cacheService
            });
        }

        // 5. Retornar resultado
        return {
            data: result,
            model: usedModel,
            fromCache: false,
            analysisTime: Date.now() - startTime
        };

    } catch (error: any) {
        console.error(`❌ Error en análisis con ${model}:`, error);
        throw error;
    }
}

/**
 * Calcular nivel de acuerdo entre dos resultados (0-100)
 * Optimizado para tolerar diferencias de formato menores
 */
function calculateAgreement(r1: ExtractedData, r2: ExtractedData): number {
    let agreements = 0;
    let comparisons = 0;

    // Campos críticos para validación de dinero
    const criticalFields: (keyof ExtractedData)[] = [
        'amount',
        'date',
        'comprobante',
        'operacion',
        'rrn',
        'accountOrConvenio',
        'bankName'
    ];

    for (const field of criticalFields) {
        const v1 = r1[field];
        const v2 = r2[field];

        // Solo comparar si al menos uno tiene valor
        if (v1 || v2) {
            comparisons++;

            // Si uno es nulo y el otro no, es desacuerdo
            if (!v1 || !v2) continue;

            // Normalización inteligente según el tipo de campo
            let s1 = String(v1).toLowerCase().trim();
            let s2 = String(v2).toLowerCase().trim();

            // 1. Normalización para números (monto, comprobante, etc.)
            if (field === 'amount' || field === 'comprobante' || field === 'operacion' || field === 'rrn' || field === 'accountOrConvenio') {
                s1 = s1.replace(/\D/g, '').replace(/^0+/, ''); // Solo dígitos y sin ceros a la izquierda
                s2 = s2.replace(/\D/g, '').replace(/^0+/, '');
            }
            // 2. Normalización para fechas (YYYY-MM-DD vs variantes)
            else if (field === 'date') {
                s1 = s1.replace(/[-/]/g, ''); // Quitar separadores
                s2 = s2.replace(/[-/]/g, '');
            }
            // 3. Normalización general (quitar espacios sobrantes)
            else {
                s1 = s1.replace(/\s+/g, '');
                s2 = s2.replace(/\s+/g, '');
            }

            if (s1 === s2 && s1 !== '') {
                agreements++;
            }
        }
    }

    return comparisons > 0 ? Math.round((agreements / comparisons) * 100) : 0;
}

/**
 * Obtener configuración de IA del localStorage
 */
export function getAIConfig() {
    try {
        const configStr = localStorage.getItem('ai_config');
        if (!configStr) return null;
        return JSON.parse(configStr);
    } catch (error) {
        console.warn('Error al cargar configuración de IA:', error);
        return null;
    }
}

/**
 * Guardar configuración de IA en localStorage
 */
export function saveAIConfig(config: any): void {
    try {
        localStorage.setItem('ai_config', JSON.stringify(config));
    } catch (error) {
        console.error('Error al guardar configuración de IA:', error);
    }
}
