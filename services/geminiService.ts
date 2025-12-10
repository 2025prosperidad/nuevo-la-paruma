import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

// Safely access process.env to avoid "process is not defined" runtime errors
const getApiKey = () => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore error
  }
  return '';
};

const apiKey = getApiKey();

if (!apiKey) {
  console.warn("API_KEY is missing. AI features will not work.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'missing-key' });

export const analyzeConsignmentImage = async (base64Image: string): Promise<ExtractedData> => {
  const modelId = "gemini-2.5-flash";
  
  const prompt = `
    Analyze this image of a Colombian bank payment receipt (consignación or comprobante).
    Types: Redeban (Thermal paper), Bancolombia App, Nequi (Purple screenshot), Banco Agrario.

    CRITICAL EXTRACTION RULES:
    
    1. **Unique Transaction ID (THE MOST IMPORTANT FIELD)**:
       - Look for these specific labels: "RRN", "Recibo", "Aprobación", "Apro", "CUS", "Comprobante", "Secuencia".
       - In Redeban tickets, usually "RRN" or "Recibo" are prominent.
       - If multiple exist, prefer "RRN" or "Recibo".
       - Return ONLY the digits/letters, no labels.
    
    2. **Destination Account/Convenio**: 
       - Look for "Cuenta de Ahorros", "Cuenta Corriente", "Convenio", "Producto".
       - If it says "Convenio: 12345", extract "12345".
    
    3. **Payment Reference (Client ID)**:
       - Look for "Ref 1", "Referencia", "Cedula", "NIT".
       - WARNING: Do NOT confuse "Referencia" (Client ID) with "RRN" or "Recibo" (Transaction ID).
    
    4. **Time (Hora)**:
       - Extract the time in HH:MM format (e.g. "14:30", "2:30 PM").
       - Normalize to 24h format if possible.
    
    5. **Date**: 
       - Extract date in YYYY-MM-DD format.
       - HANDLE TEXT MONTHS: If image says "NOV 21 2025", return "2025-11-21".
       - Spanish months: ENE=01, FEB=02, MAR=03, ABR=04, MAY=05, JUN=06, JUL=07, AGO=08, SEP=09, OCT=10, NOV=11, DIC=12.

    6. **Quality Score**:
       - Rate legibility from 0-100.
       - 60 is acceptable for slightly crumpled thermal paper if text is readable.
       - Below 60 is unreadable/blurry.

    Return strictly JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
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
            accountOrConvenio: { type: Type.STRING, description: "Target account or convenio code" },
            amount: { type: Type.NUMBER, description: "Total amount" },
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            time: { type: Type.STRING, description: "HH:MM or HH:MM:SS" },
            uniqueTransactionId: { type: Type.STRING, description: "RRN, Recibo, Apro, CUS, etc." },
            paymentReference: { type: Type.STRING, description: "Client Ref, Cedula, Ref 1" },
            imageQualityScore: { type: Type.NUMBER, description: "0-100" },
            isReadable: { type: Type.BOOLEAN, description: "True if legible" },
            rawText: { type: Type.STRING, description: "Extracted text snippets for debug" }
          },
          required: ["imageQualityScore", "isReadable", "amount"]
        },
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No response from AI");

    const data = JSON.parse(resultText) as ExtractedData;
    return data;

  } catch (error) {
    console.error("Error calling Gemini:", error);
    throw error;
  }
};