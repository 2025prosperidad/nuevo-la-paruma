import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData, TrainingRecord, ReceiptType } from "../types";

// Access API key - Vite will replace process.env.API_KEY at build time via define
// Using a function to ensure it's evaluated at runtime
const getApiKey = (): string => {
  try {
    // @ts-ignore - Vite defines these via define config
    const key = (typeof process !== 'undefined' && process.env?.API_KEY)
      || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY)
      || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY);
    return key || '';
  } catch (e) {
    return '';
  }
};

// Get API key - this will be replaced by Vite's define at build time
const apiKey = getApiKey();

if (!apiKey || apiKey === 'missing-key') {
  console.error("GEMINI_API_KEY is missing. AI features will not work.");
  console.error("Please set GEMINI_API_KEY in .env.local file");
  console.error("Current apiKey value:", apiKey ? `${apiKey.substring(0, 10)}...` : 'empty');
} else {
  console.log("API Key loaded successfully:", apiKey.substring(0, 10) + '...');
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'missing-key' });

// Función para obtener ejemplos de entrenamiento del localStorage
const getTrainingExamples = (receiptType?: ReceiptType): string => {
  try {
    const trainingDataRaw = localStorage.getItem('training_records');
    if (!trainingDataRaw) return '';

    const allTrainingRecords: TrainingRecord[] = JSON.parse(trainingDataRaw);

    // Incluir TODOS los entrenamientos (ACCEPT y REJECT) para que la IA aprenda ambos
    const trainedRecords = allTrainingRecords.filter(r =>
      r.decision === 'ACCEPT' || r.decision === 'REJECT_BLURRY' || r.decision === 'REJECT_DUPLICATE'
    );

    if (trainedRecords.length === 0) return '';

    // Si hay tipo de recibo específico, filtrar por ese tipo primero
    let relevantRecords = receiptType
      ? trainedRecords.filter(r => r.receiptType === receiptType)
      : trainedRecords;

    // Si no hay registros del tipo específico, usar todos
    if (relevantRecords.length === 0) {
      relevantRecords = trainedRecords;
    }

    // ELIMINAR DUPLICADOS: Usar imageHash o combinación de campos únicos
    const uniqueRecords: TrainingRecord[] = [];
    const seenHashes = new Set<string>();
    const seenKeys = new Set<string>();

    for (const record of relevantRecords) {
      // Primero intentar por hash de imagen (más preciso)
      if (record.imageHash) {
        if (seenHashes.has(record.imageHash)) {
          continue; // Duplicado por hash
        }
        seenHashes.add(record.imageHash);
      }

      // Si no hay hash, usar combinación de campos únicos
      const uniqueKey = `${record.receiptType}_${record.correctData.bankName}_${record.correctData.comprobante || record.correctData.operacion || record.correctData.rrn || ''}_${record.correctData.amount}_${record.correctData.date}`;
      if (seenKeys.has(uniqueKey)) {
        continue; // Duplicado por campos
      }
      seenKeys.add(uniqueKey);

      uniqueRecords.push(record);
    }

    // Tomar máximo 10 ejemplos más recientes (sin duplicados)
    const examples = uniqueRecords
      .sort((a, b) => (b.trainedAt || 0) - (a.trainedAt || 0))
      .slice(0, 10);

    if (examples.length === 0) return '';

    console.log(`📚 Cargando ${examples.length} ejemplos de entrenamiento${receiptType ? ` para tipo ${receiptType}` : ''}`);

    // Construir texto de ejemplos con TODOS los campos
    const examplesText = examples.map((record, index) => {
      const d = record.correctData;
      const fields = [
        `Tipo: ${record.receiptType}`,
        `Decisión: ${record.decision}`,
        `Banco: ${d.bankName}`,
        d.city ? `Ciudad: ${d.city}` : null,
        `Cuenta/Convenio: ${d.accountOrConvenio}`,
        `Monto: ${d.amount}`,
        `Fecha: ${d.date}`,
        d.time ? `Hora: ${d.time}` : null,
        d.rrn ? `RRN: ${d.rrn}` : null,
        d.recibo ? `RECIBO: ${d.recibo}` : null,
        d.apro ? `APRO: ${d.apro}` : null,
        d.operacion ? `Operación: ${d.operacion}` : null,
        d.comprobante ? `Comprobante: ${d.comprobante}` : null,
        d.paymentReference ? `Referencia Pago: ${d.paymentReference}` : null,
        d.clientCode ? `Código Cliente: ${d.clientCode}` : null,
        d.creditCardLast4 ? `Tarjeta: ${d.creditCardLast4}` : null,
        `Razón: ${record.decisionReason || ''}`,
        record.notes ? `Notas: ${record.notes}` : null,
      ].filter(Boolean).join('\n      ');
      return `  EJEMPLO ${index + 1}:\n      ${fields}`;
    }).join('\n\n');

    return `
    
    🎓 ENTRENAMIENTO OBLIGATORIO — ${examples.length} EJEMPLOS VERIFICADOS POR HUMANOS:
    
    Estos ejemplos son la VERDAD absoluta. Aprende de ellos y aplica las mismas reglas de extracción.
    Las notas y razones del entrenador son INSTRUCCIONES DIRECTAS que debes seguir.
    Si la imagen es similar a un ejemplo, extrae los datos de la MISMA forma.
    Los ejemplos tienen MAYOR PRIORIDAD que cualquier otra regla del prompt.
    
${examplesText}
    `;

  } catch (error) {
    console.warn('Error al cargar ejemplos de entrenamiento:', error);
    return '';
  }
};

// Función interna para una sola llamada a la IA
const singleAnalysis = async (
  base64Image: string,
  mimeType: string,
  attemptNumber: number,
  trainingContext?: string
): Promise<ExtractedData> => {
  const modelId = "gemini-2.5-flash";

  const prompt = `Eres un experto en análisis de recibos bancarios colombianos.

TU TAREA: Analiza la imagen y extrae TODOS los datos visibles con precisión absoluta.

${trainingContext || ''}

CAMPOS A EXTRAER (devuelve JSON estricto):
- bankName (string): Nombre del banco o corresponsal
- city (string|null): Ciudad si es visible
- accountOrConvenio (string): Número de convenio o cuenta destino
- amount (number): Monto sin puntos ni comas ni símbolo $
- date (string): Fecha en YYYY-MM-DD. Meses español: ENE=01, FEB=02, MAR=03, ABR=04, MAY=05, JUN=06, JUL=07, AGO=08, SEP=09, OCT=10, NOV=11, DIC=12
- time (string|null): Hora en HH:MM
- rrn (string|null): Número RRN exacto como aparece (puede ser 6-12+ dígitos)
- recibo (string|null): Número de RECIBO exacto como aparece
- apro (string|null): Número APRO o Aprob exacto como aparece
- operacion (string|null): Número de operación
- comprobante (string|null): Número de comprobante
- uniqueTransactionId (string|null): ID de transacción principal
- paymentReference (string|null): Referencia de pago o código cliente
- clientCode (string|null): Código del cliente si es visible
- creditCardLast4 (string|null): Últimos 4 dígitos de tarjeta si aplica
- isCreditCardPayment (boolean): true si es pago con tarjeta
- imageQualityScore (number): Calidad de imagen 0-100
- confidenceScore (number): Tu confianza en la extracción 0-100
- isScreenshot (boolean): true si es captura de app, false si es recibo físico
- hasPhysicalReceipt (boolean): true si tiene RRN/RECIBO/APRO (estilo Redeban/Wompi)
- isReadable (boolean): true si es legible
- hasAmbiguousNumbers (boolean): true si algún número es dudoso
- ambiguousFields (string[]): Lista de campos con números dudosos
- rawText (string): TODO el texto visible de la imagen, mínimo 500 caracteres. NUNCA truncar.

REGLAS FUNDAMENTALES:
1. NUNCA inventes datos. Si no ves un campo claramente, déjalo null.
2. Extrae números EXACTAMENTE como aparecen, incluyendo ceros iniciales.
3. Si hay entrenamientos arriba, son INSTRUCCIONES DIRECTAS del humano — síguelas al pie de la letra.
4. rawText debe incluir TODAS las líneas del recibo, especialmente RECIBO, RRN, APRO, CONVENIO, REF, VALOR.
5. Para Redeban/Wompi térmicos, RRN + RECIBO + APRO son OBLIGATORIOS — si no los encuentras, baja el score.
6. Sé DETERMINISTA: la misma imagen siempre debe dar el mismo resultado.

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicaciones.`;


  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bankName: { type: Type.STRING, description: "Bank name" },
            city: { type: Type.STRING, description: "City where transaction was made" },
            accountOrConvenio: { type: Type.STRING, description: "Target account or convenio code" },
            amount: { type: Type.NUMBER, description: "Total amount" },
            date: { type: Type.STRING, description: "YYYY-MM-DD format" },
            time: { type: Type.STRING, description: "HH:MM format" },

            // Transaction IDs
            uniqueTransactionId: { type: Type.STRING, description: "Primary transaction ID" },
            rrn: { type: Type.STRING, description: "RRN number from Redeban thermal receipts. Look for 'RRN:' followed by 5-6 digits (e.g., '228331'). CRITICAL: Extract this exactly as printed." },
            recibo: { type: Type.STRING, description: "RECIBO number from Redeban thermal receipts. Look for 'RECIBO:' followed by 5-6 digits (e.g., '224936'). CRITICAL: Extract this exactly as printed." },
            apro: { type: Type.STRING, description: "APRO/Approval code from Redeban thermal receipts. Look for 'APRO:' followed by 5-6 digits (e.g., '096133'). CRITICAL: Extract this exactly as printed." },
            operacion: { type: Type.STRING, description: "Operation number" },
            comprobante: { type: Type.STRING, description: "Comprobante number" },

            // Client references
            paymentReference: { type: Type.STRING, description: "Client Ref, Cedula, NIT, or last 4 digits of credit card" },
            clientCode: { type: Type.STRING, description: "Client code (e.g., Cervunion code 10813353)" },

            // Credit card payment
            creditCardLast4: { type: Type.STRING, description: "Last 4 digits of credit card if payment is by card" },
            isCreditCardPayment: { type: Type.BOOLEAN, description: "True if payment was made with credit card" },

            // Confidence and quality
            confidenceScore: { type: Type.NUMBER, description: "0-100 confidence in extracted numbers" },
            hasAmbiguousNumbers: { type: Type.BOOLEAN, description: "True if any number might be misread" },
            ambiguousFields: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of uncertain fields" },

            // Document type
            isScreenshot: { type: Type.BOOLEAN, description: "True if app screenshot" },
            hasPhysicalReceipt: { type: Type.BOOLEAN, description: "True if has physical receipt number (RRN/RECIBO/APRO)" },

            imageQualityScore: { type: Type.NUMBER, description: "0-100 image quality" },
            isReadable: { type: Type.BOOLEAN, description: "True if legible" },
            rawText: { type: Type.STRING, description: "ALL visible text from the image, especially lines with RECIBO, RRN, APRO, OPERACION, UPC, CONVENIO, REF, VALOR. Include at least 500 characters. Do NOT truncate important fields." }
          },
          required: ["imageQualityScore", "isReadable", "amount", "confidenceScore", "hasAmbiguousNumbers", "isScreenshot", "hasPhysicalReceipt"]
        },
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No response from AI");

    const data = JSON.parse(resultText) as ExtractedData;

    // Ensure arrays are properly initialized
    if (!data.ambiguousFields) {
      data.ambiguousFields = [];
    }

    return data;

  } catch (error: any) {
    console.error("Error calling Gemini:", error);
    console.error("Error details:", {
      message: error?.message,
      status: error?.status,
      statusText: error?.statusText,
      response: error?.response
    });

    // Provide more helpful error messages
    if (error?.message?.includes('API_KEY') || error?.message?.includes('api key')) {
      throw new Error("🔑 API Key de Gemini no configurada. Verifica tu archivo .env.local");
    }
    if (error?.message?.includes('quota') || error?.message?.includes('limit') || error?.message?.includes('429')) {
      throw new Error("📊 Límite de cuota de API excedido. Espera unos minutos o verifica tu plan de Gemini.");
    }
    if (error?.message?.includes('invalid') || error?.message?.includes('unauthorized') || error?.message?.includes('403')) {
      throw new Error("🚫 API Key inválida. Verifica tu clave de Gemini.");
    }
    if (error?.message?.includes('timeout') || error?.message?.includes('ETIMEDOUT')) {
      throw new Error("⏱️ Timeout: La imagen tardó mucho en procesarse. Intenta con una imagen más pequeña.");
    }
    if (error?.message?.includes('network') || error?.message?.includes('ECONNREFUSED')) {
      throw new Error("🌐 Error de red. Verifica tu conexión a internet.");
    }
    if (error?.message?.includes('too large') || error?.message?.includes('size') || error?.status === 413) {
      throw new Error("📦 Imagen demasiado grande. Intenta con una imagen más pequeña (máx 10MB).");
    }
    if (error?.message?.includes('format') || error?.message?.includes('mime')) {
      throw new Error("🖼️ Formato de imagen no soportado. Usa JPG, PNG, WEBP o GIF.");
    }
    if (error?.message?.includes('400')) {
      throw new Error("❌ Solicitud inválida. La imagen puede estar corrupta o en formato no soportado.");
    }
    if (error?.message?.includes('500') || error?.message?.includes('502') || error?.message?.includes('503')) {
      throw new Error("🔧 Error del servidor de Gemini. Intenta de nuevo en unos minutos.");
    }

    // Si no coincide con ningún error conocido, mostrar el mensaje original
    const errorMessage = error?.message || error?.toString() || 'Error desconocido';
    throw new Error(`❌ Error al procesar imagen: ${errorMessage}`);
  }
};

// Comparar dos números extraídos
const numbersMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  // Comparar solo dígitos para ignorar diferencias de formato
  const aDigits = String(a).replace(/\D/g, '');
  const bDigits = String(b).replace(/\D/g, '');
  return aDigits === bDigits;
};

// Función auxiliar para detectar tipo de recibo rápidamente
const detectReceiptTypeFromData = (data: ExtractedData): ReceiptType => {
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

// Función principal con TRIPLE VERIFICACIÓN
export const analyzeConsignmentImage = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<ExtractedData> => {
  console.log('🔍 Iniciando TRIPLE VERIFICACIÓN de imagen...');

  // PASO 1: Hacer un análisis rápido primero para detectar el tipo de recibo
  console.log('🔍 Paso 1: Detectando tipo de recibo...');
  const quickResult = await singleAnalysis(base64Image, mimeType, 0, '');
  const detectedReceiptType = detectReceiptTypeFromData(quickResult);
  console.log(`✅ Tipo de recibo detectado: ${detectedReceiptType}`);

  // PASO 2: Obtener contexto de entrenamiento filtrado por tipo
  const trainingContext = getTrainingExamples(detectedReceiptType);
  if (trainingContext) {
    console.log(`📚 Contexto de entrenamiento cargado para tipo ${detectedReceiptType}`);
  } else {
    console.log('⚠️ No se encontraron entrenamientos para este tipo de recibo');
  }

  // PASO 3: Hacer TRES análisis completos de la misma imagen en paralelo con contexto de entrenamiento
  const [result1, result2, result3] = await Promise.all([
    singleAnalysis(base64Image, mimeType, 1, trainingContext),
    singleAnalysis(base64Image, mimeType, 2, trainingContext),
    singleAnalysis(base64Image, mimeType, 3, trainingContext)
  ]);

  console.log('📊 Análisis 1:', { operacion: result1.operacion, amount: result1.amount, confidence: result1.confidenceScore });
  console.log('📊 Análisis 2:', { operacion: result2.operacion, amount: result2.amount, confidence: result2.confidenceScore });
  console.log('📊 Análisis 3:', { operacion: result3.operacion, amount: result3.amount, confidence: result3.confidenceScore });

  // Función para normalizar valores alfanuméricos (preserva letras importantes como AQ)
  const normalizeValue = (v: string | null | undefined): string => {
    if (!v) return '';
    // Convertir a mayúsculas, quitar espacios y guiones
    // PRESERVAR letras como "AQ" que son parte del código
    return String(v).toUpperCase().replace(/[\s\-\.]/g, '');
  };

  // Función para encontrar el valor más común entre 3 resultados (votación por mayoría)
  const getMajorityValue = (v1: string | null | undefined, v2: string | null | undefined, v3: string | null | undefined): string | null => {
    const values = [normalizeValue(v1), normalizeValue(v2), normalizeValue(v3)];

    // Si 2 o más coinciden, usar el valor original más largo/completo
    if (values[0] && values[0] === values[1]) return v1 || v2 || null;
    if (values[0] && values[0] === values[2]) return v1 || v3 || null;
    if (values[1] && values[1] === values[2]) return v2 || v3 || null;

    // Verificar si hay coincidencia parcial (2 de 3 tienen el mismo contenido numérico)
    const numericOnly = values.map(v => v.replace(/\D/g, ''));
    if (numericOnly[0] && numericOnly[0] === numericOnly[1]) return v1 || v2 || null;
    if (numericOnly[0] && numericOnly[0] === numericOnly[2]) return v1 || v3 || null;
    if (numericOnly[1] && numericOnly[1] === numericOnly[2]) return v2 || v3 || null;

    // Si todos son diferentes, hay discrepancia
    return null;
  };

  // Verificar consenso en números críticos
  const operacionConsensus = getMajorityValue(result1.operacion, result2.operacion, result3.operacion);
  const rrnConsensus = getMajorityValue(result1.rrn, result2.rrn, result3.rrn);
  const reciboConsensus = getMajorityValue(result1.recibo, result2.recibo, result3.recibo);
  const aproConsensus = getMajorityValue(result1.apro, result2.apro, result3.apro);
  const comprobanteConsensus = getMajorityValue(result1.comprobante, result2.comprobante, result3.comprobante);

  // Helper: Contar cuántos resultados tienen un valor para un campo
  const countNonEmpty = (v1: any, v2: any, v3: any): number => {
    return [v1, v2, v3].filter(v => v && String(v).trim() !== '').length;
  };

  // Detectar campos sin consenso SOLO si al menos 2 de 3 análisis encontraron el campo
  // Esto evita marcar como "sin consenso" campos que no existen en el recibo
  const noConsensusFields: string[] = [];

  // Solo verificar operacion si al menos 2 análisis la encontraron
  if (countNonEmpty(result1.operacion, result2.operacion, result3.operacion) >= 2 && !operacionConsensus) {
    noConsensusFields.push(`operacion (${result1.operacion || '-'}/${result2.operacion || '-'}/${result3.operacion || '-'})`);
  }
  // Solo verificar rrn si al menos 2 análisis lo encontraron
  if (countNonEmpty(result1.rrn, result2.rrn, result3.rrn) >= 2 && !rrnConsensus) {
    noConsensusFields.push(`rrn (${result1.rrn || '-'}/${result2.rrn || '-'}/${result3.rrn || '-'})`);
  }
  // Solo verificar recibo si al menos 2 análisis lo encontraron
  if (countNonEmpty(result1.recibo, result2.recibo, result3.recibo) >= 2 && !reciboConsensus) {
    noConsensusFields.push(`recibo (${result1.recibo || '-'}/${result2.recibo || '-'}/${result3.recibo || '-'})`);
  }
  // Solo verificar apro si al menos 2 análisis lo encontraron
  if (countNonEmpty(result1.apro, result2.apro, result3.apro) >= 2 && !aproConsensus) {
    noConsensusFields.push(`apro (${result1.apro || '-'}/${result2.apro || '-'}/${result3.apro || '-'})`);
  }
  // Solo verificar comprobante si al menos 2 análisis lo encontraron
  if (countNonEmpty(result1.comprobante, result2.comprobante, result3.comprobante) >= 2 && !comprobanteConsensus) {
    noConsensusFields.push(`comprobante (${result1.comprobante || '-'}/${result2.comprobante || '-'}/${result3.comprobante || '-'})`);
  }

  // Si hay campos sin consenso (3 valores diferentes), marcar como ambiguo
  // PERO: solo si son campos críticos (operacion, rrn, recibo)
  const criticalNoConsensus = noConsensusFields.filter(f =>
    f.startsWith('operacion') || f.startsWith('rrn') || f.startsWith('recibo')
  );

  if (criticalNoConsensus.length > 0) {
    console.warn('⚠️ SIN CONSENSO en campos CRÍTICOS:', criticalNoConsensus);

    // Usar el resultado con mayor confianza como base
    const results = [result1, result2, result3];
    const baseResult = results.reduce((best, current) =>
      (current.confidenceScore || 0) > (best.confidenceScore || 0) ? current : best
    );

    // Penalizar menos si solo hay 1 campo sin consenso
    const penalizedScore = criticalNoConsensus.length === 1
      ? Math.max((baseResult.confidenceScore || 70) - 15, 55)  // Solo 1 campo: -15 puntos, mínimo 55
      : Math.min(baseResult.confidenceScore || 50, 50);         // Múltiples: máximo 50

    return {
      ...baseResult,
      hasAmbiguousNumbers: true,
      ambiguousFields: [
        ...(baseResult.ambiguousFields || []),
        ...criticalNoConsensus.map(d => d.split(' ')[0])
      ],
      confidenceScore: penalizedScore,
      rawText: `${baseResult.rawText || ''} [TRIPLE VERIFICACIÓN: Sin consenso en ${criticalNoConsensus.join(', ')}]`
    };
  }

  // Campos no críticos sin consenso (apro, comprobante) - no requiere verificación manual
  if (noConsensusFields.length > 0) {
    console.log('ℹ️ Sin consenso en campos NO críticos:', noConsensusFields);
  }

  // ✅ HAY CONSENSO - Usar valores con mayoría
  console.log('✅ TRIPLE VERIFICACIÓN: Consenso alcanzado');

  // Usar el resultado con mayor confianza como base y aplicar valores de consenso
  const results = [result1, result2, result3];
  const bestResult = results.reduce((best, current) =>
    (current.confidenceScore || 0) > (best.confidenceScore || 0) ? current : best
  );

  // Construir resultado final con valores de consenso
  const finalResult: ExtractedData = {
    ...bestResult,
    operacion: operacionConsensus || bestResult.operacion,
    rrn: rrnConsensus || bestResult.rrn,
    recibo: reciboConsensus || bestResult.recibo,
    apro: aproConsensus || bestResult.apro,
    comprobante: comprobanteConsensus || bestResult.comprobante,
    // Aumentar confianza porque hay consenso
    confidenceScore: Math.min((bestResult.confidenceScore || 85) + 10, 100),
    hasAmbiguousNumbers: false,
    ambiguousFields: []
  };

  return finalResult;
};
