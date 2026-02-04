import { ExtractedData, AnalysisResult, AIModel, TrainingRecord } from '../types';
import { analyzeConsignmentImage as analyzeWithGemini } from './geminiService';
import { analyzeWithGPT4 } from './openaiService';
import { getCachedAnalysis, setCachedAnalysis } from './cacheService';

/**
 * Servicio orquestador de IA que maneja múltiples modelos
 * y caché de resultados
 */

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
                result = await analyzeWithGemini(base64Image, mimeType);
                usedModel = AIModel.GEMINI;
                break;

            case AIModel.GPT4_MINI:
                console.log('🟢 Analizando con GPT-4o-mini...');
                result = await analyzeWithGPT4(base64Image, mimeType, trainingExamples);
                usedModel = AIModel.GPT4_MINI;
                break;

            case AIModel.CONSENSUS:
                console.log('🔄 Modo consenso: analizando con ambos modelos...');
                const [geminiResult, gpt4Result] = await Promise.all([
                    analyzeWithGemini(base64Image, mimeType),
                    analyzeWithGPT4(base64Image, mimeType, trainingExamples)
                ]);

                // Comparar resultados
                const agreement = calculateAgreement(geminiResult, gpt4Result);
                console.log(`📊 Nivel de acuerdo entre modelos: ${agreement}%`);

                // Si hay alto acuerdo, usar el de mayor confianza
                if (agreement >= 80) {
                    result = geminiResult.confidenceScore >= gpt4Result.confidenceScore
                        ? geminiResult
                        : gpt4Result;
                    usedModel = geminiResult.confidenceScore >= gpt4Result.confidenceScore
                        ? AIModel.GEMINI
                        : AIModel.GPT4_MINI;
                } else {
                    // Bajo acuerdo: usar GPT-4 pero marcar para verificación
                    console.warn('⚠️ Modelos difieren significativamente');
                    result = {
                        ...gpt4Result,
                        confidenceScore: Math.min(gpt4Result.confidenceScore, 70),
                        hasAmbiguousNumbers: true,
                        ambiguousFields: [
                            ...(gpt4Result.ambiguousFields || []),
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
 */
function calculateAgreement(r1: ExtractedData, r2: ExtractedData): number {
    let agreements = 0;
    let comparisons = 0;

    // Comparar campos críticos
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

        // Solo comparar si ambos tienen valor
        if (v1 && v2) {
            comparisons++;

            // Normalizar para comparación
            const normalized1 = String(v1).replace(/\s/g, '').toLowerCase();
            const normalized2 = String(v2).replace(/\s/g, '').toLowerCase();

            if (normalized1 === normalized2) {
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
