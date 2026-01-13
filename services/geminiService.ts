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

export const analyzeConsignmentImage = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<ExtractedData> => {
  const modelId = "gemini-2.5-flash";

  const prompt = `
    Analyze this image of a Colombian bank payment receipt (consignación or comprobante).
    Types: Redeban (Thermal paper), Bancolombia App, Nequi (Purple screenshot), Banco Agrario, Davivienda.

    ⚠️ CRITICAL EXTRACTION RULES - READ CAREFULLY:
    
    🔒 SEGURIDAD ANTI-FRAUDE:
    - Si un número NO se ve CLARAMENTE, marca hasAmbiguousNumbers=true y agrega el campo a ambiguousFields
    - Si hay caracteres borrosos o que podrían confundirse (3/8, 1/7, 0/O, 5/S), reporta incertidumbre
    - NUNCA adivines números. Si no estás 100% seguro, es mejor reportar baja confianza
    - El confidenceScore debe reflejar qué tan SEGURO estás de TODOS los números extraídos
    
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
          • Example: "Registro de Operación: 292652588" → "292652588"
       
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
    
    3. **🍺 CERVECERÍA UNIÓN DETECTION**:
       - If you see "Cerveceria Union", "CERVECERÍA UNIÓN", "Cervunion", "RIN CERVECERIA"
       - Set clientCode="10813353" (this is La Paruma's client code with Cervecería Unión)
       - Also look for "Codigo cliente cervunion" field
    
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
    
    8. **🎯 CONFIDENCE SCORE (0-100)**:
       - 95-100: All numbers crystal clear, no ambiguity
       - 80-94: Minor blur but confident in reading
       - 60-79: Some characters unclear, possible errors
       - 0-59: Significant uncertainty, numbers may be wrong
       
       REDUCE confidence if:
       - Paper is wrinkled or torn
       - Numbers are partially obscured
       - Print quality is poor
       - Similar characters that could be confused (3/8, 1/7, 0/O)

    9. **🚫 AMBIGUOUS NUMBERS**:
       - hasAmbiguousNumbers=true if ANY number might be misread
       - ambiguousFields: List which fields have uncertain readings
       - Example: If "33" could be "88", ambiguousFields=["operacion"]

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
