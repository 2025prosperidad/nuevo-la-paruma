import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

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

// Función interna para una sola llamada a la IA
const singleAnalysis = async (base64Image: string, mimeType: string, attemptNumber: number): Promise<ExtractedData> => {
  const modelId = "gemini-2.5-flash";

  const prompt = `
    Analyze this image of a Colombian bank payment receipt (consignación or comprobante).
    Types: Redeban (Thermal paper), Bancolombia App, Nequi (Purple screenshot), Banco Agrario, Davivienda.

    ⚠️ CRITICAL EXTRACTION RULES - READ CAREFULLY:
    
    🔒 SEGURIDAD ANTI-FRAUDE - MÁXIMA PRIORIDAD:
    
    ⛔ REGLA DE ORO: ES MEJOR RECHAZAR UN RECIBO BUENO QUE APROBAR UNO CON NÚMEROS INCORRECTOS
    
    CONFUSIONES COMUNES QUE DEBES DETECTAR:
    - 3 ↔ 8 (MUY COMÚN en impresiones térmicas)
    - 1 ↔ 7
    - 0 ↔ O ↔ 8
    - 5 ↔ S ↔ 6
    - 6 ↔ 8 ↔ 0
    - 2 ↔ Z
    
    INSTRUCCIONES ESTRICTAS:
    1. Si la imagen está BORROSA o tiene mala calidad → imageQualityScore < 50, isReadable=false
    2. Si CUALQUIER dígito de un número de transacción no se ve 100% claro → hasAmbiguousNumbers=true
    3. Si hay CUALQUIER posibilidad de confusión entre dígitos similares → confidenceScore < 80
    4. NUNCA ADIVINES. Si tienes la más mínima duda, reporta ambiguousFields con ese campo
    5. En papel térmico arrugado/borroso, SIEMPRE baja el confidenceScore significativamente
    
    EJEMPLOS DE RECHAZO OBLIGATORIO:
    - Número "292652588" pero el 8 final podría ser 3 → hasAmbiguousNumbers=true, ambiguousFields=["operacion"]
    - Recibo Redeban muy borroso donde no se leen bien los números → imageQualityScore=40, isReadable=false
    - Cualquier dígito con tinta corrida o manchada → confidenceScore < 70
    
    1. **🔑 MÚLTIPLES NÚMEROS ÚNICOS (ABSOLUTELY CRITICAL)**:
       ⛔ CADA UNO ES ÚNICO Y NUNCA SE PUEDE REPETIR
       
       **EXTRACT ALL PRESENT:**
       
       A) **RRN** (Red de Recaudo Nacional):
          • Labels: "RRN:", "RRN", "Red Recaudo"
          • Usually 6-9 digits
          • Example: "RRN: 061010" → "061010"
       
       B) **RECIBO** (Número de Recibo):
          • Labels: "RECIBO:", "No. Recibo", "Num Recibo"
          • Usually 6-7 digits
       
       C) **APRO** (Código de Aprobación):
          • Labels: "APRO:", "APROBACION:", "Cod. Apro", "Autorización"
       
       D) **OPERACION** (Número de Operación):
          • Labels: "Operación:", "No. Operación", "Registro de Operación"
          • Common in Banco Agrario, Bancolombia physical receipts
          • Example: "Registro de Operación: 292652533" → "292652533"
       
       E) **COMPROBANTE** (Número de Comprobante):
          • Labels: "Comprobante No.", "No Comprobante"
       
       ⚠️ CRITICAL:
       - Extract COMPLETE values - NO truncation
       - If unclear, mark confidenceScore LOW and hasAmbiguousNumbers=true
       - Put the most prominent ID in uniqueTransactionId for backward compatibility
    
    2. **🏦 BANCO Y CIUDAD**:
       - Extract bank name: "Bancolombia", "Banco Agrario", "Nequi", "Davivienda", etc.
       - Look for "Sucursal:", "Ciudad:", "Oficina:" for location
       - Example: "Sucursal: 549 - PLAZA DEL RIO, Ciudad: APARTADO" → city="APARTADO"
       - If multiple cities mentioned, use the one most clearly marked
    
    2B. **💳 CUENTA DESTINO vs REFERENCIA DE PAGO (MUY IMPORTANTE)**:
       
       ⚠️ NO CONFUNDIR ESTOS DOS CAMPOS:
       
       **accountOrConvenio** = CUENTA DESTINO (donde se depositó el dinero):
       - "Número de producto:", "Cuenta:", "Producto No:"
       - En Bancolombia: "Número de producto: 24500020950" → accountOrConvenio="24500020950"
       - En recaudos: "Convenio:", "CONVENIO:" → accountOrConvenio="32137"
       - SIEMPRE debe ser un número de cuenta o convenio AUTORIZADO
       
       **paymentReference** = REFERENCIA/QUIEN PAGA (información del cliente):
       - "Id Depositante/Pagador:", "Cédula:", "NIT:", "Ref 1:", "Referencia:"
       - En Bancolombia: "Id Depositante/Pagador: 901284158" → paymentReference="901284158"
       - Este campo puede repetirse (el mismo cliente puede pagar varias veces)
       
       EJEMPLO BANCOLOMBIA:
       - "Número de producto: 24500020950" → accountOrConvenio="24500020950" ✅
       - "Id Depositante/Pagador: 901284158" → paymentReference="901284158" ✅
       
       ⛔ ERROR COMÚN: Poner el Id Depositante como accountOrConvenio. ¡NO HAGAS ESTO!
    
    3. **🍺 CERVECERÍA UNIÓN DETECTION (CRITICAL)**:
       - ALWAYS set clientCode="10813353" if ANY of these conditions are met:
       
       A) **By Keywords**:
          - "Cerveceria Union", "CERVECERÍA UNIÓN", "Cervunion"
          - "RIN CERVECERIA", "RIN CERVECERÍA UNI-N"
          - "CEO 1709", "CERVECERIA S.A"
       
       B) **By Convenio Number**:
          - Convenio 32137 = CERVECERÍA UNIÓN T R
          - Convenio 56885 = RIN CERVECERÍA UNIÓN  
          - Convenio/CEO 1709 = CERVECERÍA UNIÓN S.A
          - Convenio 18129 = CERVECERÍA UNION S.A - RM
       
       C) **By Reference**:
          - If reference contains "10813353"
          - If "Codigo cliente cervunion" shows 10813353
       
       ⚠️ If detected as Cervecería Unión, ALWAYS return clientCode="10813353"
    
    4. **📱 SCREENSHOT VS PHYSICAL RECEIPT**:
       - isScreenshot=true if: App screenshot, phone status bar visible, Nequi purple background
       - isScreenshot=false if: Thermal paper, physical printer output
       - hasPhysicalReceipt=true ONLY if there's a RECIBO/RRN/APRO number (Redeban style)
       - Screenshots from Bancolombia App usually have "Comprobante" but NO physical receipt number
    
    5. **📅 DATE (CRITICAL - REJECT IF MISSING)**:
       - Extract date in YYYY-MM-DD format
       - Handle text months: "27 Dic 2025" → "2025-12-27"
       - Spanish months: ENE=01, FEB=02, MAR=03, ABR=04, MAY=05, JUN=06, JUL=07, AGO=08, SEP=09, OCT=10, NOV=11, DIC=12
       - ⚠️ If NO date visible, return empty string - this will be REJECTED
    
    6. **⏰ TIME**:
       - Extract time in HH:MM format
       - Normalize to 24h format
    
    7. **💵 AMOUNT**:
       - Extract total amount as NUMBER (no currency symbol)
       - "$ 1.000.000,00" → 1000000
       - "$120,000,000.00" → 120000000
    
    8. **🎯 CONFIDENCE SCORE (0-100) - SÉ ESTRICTO**:
       - 95-100: SOLO si TODOS los números son 100% claros, papel perfecto, sin ninguna duda
       - 85-94: Números claros pero papel ligeramente arrugado
       - 70-84: Algunos caracteres con leve borrosidad - DEBE REPORTAR ambiguousFields
       - 50-69: Caracteres borrosos o confusos - DEBE RECHAZARSE
       - 0-49: Ilegible o muy mala calidad - RECHAZO INMEDIATO
       
       ⚠️ BAJA EL SCORE AGRESIVAMENTE SI:
       - Papel térmico arrugado o doblado → máximo 80
       - Cualquier número con posible confusión 3/8/0/6 → máximo 75
       - Imagen borrosa o desenfocada → máximo 60
       - Tinta corrida o manchada → máximo 50
       - Si tienes que "adivinar" algún dígito → máximo 65

    9. **🚫 AMBIGUOUS NUMBERS - OBLIGATORIO REPORTAR**:
       - hasAmbiguousNumbers=true si hay CUALQUIER duda en CUALQUIER número
       - ambiguousFields: LISTA TODOS los campos donde hay incertidumbre
       
       EJEMPLOS OBLIGATORIOS DE REPORTE:
       - Número termina en algo que podría ser 3 u 8 → ambiguousFields=["operacion"]
       - RRN borroso → ambiguousFields=["rrn"]
       - Múltiples campos dudosos → ambiguousFields=["operacion", "rrn", "recibo"]
       
       ⛔ Si la imagen de Redeban está borrosa/desenfocada:
       - imageQualityScore debe ser < 60
       - isReadable debe ser false
       - hasAmbiguousNumbers debe ser true

    Return strictly JSON with all extracted data.
  `;

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
            rrn: { type: Type.STRING, description: "RRN number from Redeban" },
            recibo: { type: Type.STRING, description: "RECIBO number" },
            apro: { type: Type.STRING, description: "APRO/Approval code" },
            operacion: { type: Type.STRING, description: "Operation number" },
            comprobante: { type: Type.STRING, description: "Comprobante number" },
            
            // Client references
            paymentReference: { type: Type.STRING, description: "Client Ref, Cedula, NIT" },
            clientCode: { type: Type.STRING, description: "Client code (e.g., Cervunion code 10813353)" },
            
            // Confidence and quality
            confidenceScore: { type: Type.NUMBER, description: "0-100 confidence in extracted numbers" },
            hasAmbiguousNumbers: { type: Type.BOOLEAN, description: "True if any number might be misread" },
            ambiguousFields: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of uncertain fields" },
            
            // Document type
            isScreenshot: { type: Type.BOOLEAN, description: "True if app screenshot" },
            hasPhysicalReceipt: { type: Type.BOOLEAN, description: "True if has physical receipt number (RRN/RECIBO/APRO)" },
            
            imageQualityScore: { type: Type.NUMBER, description: "0-100 image quality" },
            isReadable: { type: Type.BOOLEAN, description: "True if legible" },
            rawText: { type: Type.STRING, description: "Key extracted text for debug" }
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

// Función principal con TRIPLE VERIFICACIÓN
export const analyzeConsignmentImage = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<ExtractedData> => {
  console.log('🔍 Iniciando TRIPLE VERIFICACIÓN de imagen...');
  
  // Hacer TRES análisis de la misma imagen en paralelo
  const [result1, result2, result3] = await Promise.all([
    singleAnalysis(base64Image, mimeType, 1),
    singleAnalysis(base64Image, mimeType, 2),
    singleAnalysis(base64Image, mimeType, 3)
  ]);
  
  console.log('📊 Análisis 1:', { operacion: result1.operacion, amount: result1.amount, confidence: result1.confidenceScore });
  console.log('📊 Análisis 2:', { operacion: result2.operacion, amount: result2.amount, confidence: result2.confidenceScore });
  console.log('📊 Análisis 3:', { operacion: result3.operacion, amount: result3.amount, confidence: result3.confidenceScore });
  
  // Función para encontrar el valor más común entre 3 resultados (votación por mayoría)
  const getMajorityValue = (v1: string | null | undefined, v2: string | null | undefined, v3: string | null | undefined): string | null => {
    const values = [v1, v2, v3].map(v => v ? String(v).replace(/\D/g, '') : '');
    
    // Si 2 o más coinciden, usar ese valor
    if (values[0] && values[0] === values[1]) return v1 || null;
    if (values[0] && values[0] === values[2]) return v1 || null;
    if (values[1] && values[1] === values[2]) return v2 || null;
    
    // Si todos son diferentes, hay discrepancia
    return null;
  };
  
  // Verificar consenso en números críticos
  const operacionConsensus = getMajorityValue(result1.operacion, result2.operacion, result3.operacion);
  const rrnConsensus = getMajorityValue(result1.rrn, result2.rrn, result3.rrn);
  const reciboConsensus = getMajorityValue(result1.recibo, result2.recibo, result3.recibo);
  const aproConsensus = getMajorityValue(result1.apro, result2.apro, result3.apro);
  const comprobanteConsensus = getMajorityValue(result1.comprobante, result2.comprobante, result3.comprobante);
  
  // Detectar campos sin consenso (los 3 dieron diferentes)
  const noConsensusFields: string[] = [];
  
  if ((result1.operacion || result2.operacion || result3.operacion) && !operacionConsensus) {
    noConsensusFields.push(`operacion (${result1.operacion}/${result2.operacion}/${result3.operacion})`);
  }
  if ((result1.rrn || result2.rrn || result3.rrn) && !rrnConsensus) {
    noConsensusFields.push(`rrn (${result1.rrn}/${result2.rrn}/${result3.rrn})`);
  }
  if ((result1.recibo || result2.recibo || result3.recibo) && !reciboConsensus) {
    noConsensusFields.push(`recibo (${result1.recibo}/${result2.recibo}/${result3.recibo})`);
  }
  if ((result1.apro || result2.apro || result3.apro) && !aproConsensus) {
    noConsensusFields.push(`apro (${result1.apro}/${result2.apro}/${result3.apro})`);
  }
  if ((result1.comprobante || result2.comprobante || result3.comprobante) && !comprobanteConsensus) {
    noConsensusFields.push(`comprobante (${result1.comprobante}/${result2.comprobante}/${result3.comprobante})`);
  }
  
  // Si hay campos sin consenso (3 valores diferentes), marcar como ambiguo
  if (noConsensusFields.length > 0) {
    console.warn('⚠️ SIN CONSENSO en triple verificación:', noConsensusFields);
    
    // Usar el resultado con mayor confianza como base
    const results = [result1, result2, result3];
    const baseResult = results.reduce((best, current) => 
      (current.confidenceScore || 0) > (best.confidenceScore || 0) ? current : best
    );
    
    return {
      ...baseResult,
      hasAmbiguousNumbers: true,
      ambiguousFields: [
        ...(baseResult.ambiguousFields || []),
        ...noConsensusFields.map(d => d.split(' ')[0])
      ],
      confidenceScore: Math.min(baseResult.confidenceScore || 50, 55),
      rawText: `${baseResult.rawText || ''} [TRIPLE VERIFICACIÓN: Sin consenso en ${noConsensusFields.join(', ')}]`
    };
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
