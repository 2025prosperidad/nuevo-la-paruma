import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData, TrainingRecord, ReceiptType } from "../types";

// Access API key
const getApiKey = (): string => {
    try {
        // @ts-ignore
        const key = (typeof process !== 'undefined' && process.env?.API_KEY)
            || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY)
            || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY);
        return key || '';
    } catch (e) {
        return '';
    }
};

const apiKey = getApiKey();

if (!apiKey || apiKey === 'missing-key') {
    console.error("GEMINI_API_KEY is missing. AI features will not work.");
} else {
    console.log("Gemini API Key loaded successfully:", apiKey.substring(0, 10) + '...');
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'missing-key' });

/**
 * Construir prompt con ejemplos de entrenamiento
 */
function buildPromptWithTraining(trainingExamples: TrainingRecord[]): string {
    if (trainingExamples.length === 0) {
        return '';
    }

    const examplesText = trainingExamples.map((record, index) => {
        const data = record.correctData;
        return `
📚 EJEMPLO ${index + 1} (${record.receiptType}):
- Banco: ${data.bankName}
- Cuenta/Convenio: ${data.accountOrConvenio}
- Monto: ${data.amount}
- Fecha: ${data.date}
${data.comprobante ? `- Comprobante: ${data.comprobante}` : ''}
${data.operacion ? `- Operación: ${data.operacion}` : ''}
${data.rrn ? `- RRN: ${data.rrn}` : ''}
- Razón: "${record.decisionReason}"
`.trim();
    }).join('\n\n');

    return `
🎓 APRENDIZAJE PREVIO - APLICA ESTAS REGLAS:

Has sido entrenado con ${trainingExamples.length} ejemplos correctos.
DEBES seguir estos patrones:

${examplesText}

⚠️ IMPORTANTE: Si encuentras un recibo similar a estos ejemplos, usa la misma lógica.
`;
}

/**
 * Analizar imagen con Gemini (DETERMINISTA - Temperatura 0)
 */
export async function analyzeConsignmentImage(
    base64Image: string,
    mimeType: string = 'image/jpeg',
    trainingExamples: TrainingRecord[] = []
): Promise<ExtractedData> {

    const trainingContext = buildPromptWithTraining(trainingExamples);

    const prompt = `
Analyze this Colombian bank receipt image. Extract data PRECISELY and DETERMINISTICALLY.

${trainingContext}

CRITICAL RULES FOR BANCOLOMBIA APP:
- Screenshots of "¡Pago exitoso!" or "¡Transferencia exitosa!" are VALID.
- For "Transferencia exitosa", "Producto destino" is the account number.
- "Distribuidora La Paruma Sas" or "La Paruma" is our company. Extract it as bankName or check its destination account.
- Comprobante (10 digits) is the main unique number.
- Client code 10813353 = La Paruma (Cervecería Unión).
- Convenio 32137 = Cervecería Unión T R.
- Partial account numbers (*8520, *1640) or full ones (245-000209-50) are acceptable.

FIELDS TO EXTRACT:

1. **bankName**: Bank name or Receiver name if bank is implicit (e.g., "Bancolombia", "Distribuidora La Paruma Sas").
2. **city**: Transaction city (if visible).
3. **accountOrConvenio**: Destination account number or convenio code. Look for "Producto destino" or "Convenio".
4. **amount**: Amount in COP without formatting (e.g., 1400000).
5. **date**: Date in YYYY-MM-DD format.
6. **time**: Time in HH:MM format.
7. **comprobante**: 10-digit comprobante number.
8. **operacion**: Operation number.
9. **rrn**: RRN number.
10. **recibo**: Receipt number.
11. **apro**: Approval code.
12. **paymentReference**: Payment reference or client code.
13. **clientCode**: Client code (10813353 for Cervunion).
14. **imageQualityScore**: Quality 0-100 (app screenshots should be 90-100).
15. **confidenceScore**: Confidence 0-100 (95-100 if all fields are clear).
16. **isScreenshot**: true if app screenshot.
17. **hasPhysicalReceipt**: false for app screenshots.
18. **isReadable**: true if legible.
19. **rawText**: All visible text.

IMPORTANT:
- Be DETERMINISTIC: same image = same result.
- For Bancolombia "Transferencia exitosa", extract the full account from "Producto destino".
- If "Distribuidora La Paruma Sas" is visible, the receipt is valid for our company.
- Quality of app screenshots should be 90-100.
- Confidence should be 95-100 if all fields are clear.

Return ONLY valid JSON, no markdown.
`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-exp",
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
                temperature: 0, // DETERMINISTA
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        bankName: { type: Type.STRING },
                        city: { type: Type.STRING },
                        accountOrConvenio: { type: Type.STRING },
                        amount: { type: Type.NUMBER },
                        date: { type: Type.STRING },
                        time: { type: Type.STRING },
                        uniqueTransactionId: { type: Type.STRING },
                        rrn: { type: Type.STRING },
                        recibo: { type: Type.STRING },
                        apro: { type: Type.STRING },
                        operacion: { type: Type.STRING },
                        comprobante: { type: Type.STRING },
                        paymentReference: { type: Type.STRING },
                        clientCode: { type: Type.STRING },
                        creditCardLast4: { type: Type.STRING },
                        isCreditCardPayment: { type: Type.BOOLEAN },
                        confidenceScore: { type: Type.NUMBER },
                        hasAmbiguousNumbers: { type: Type.BOOLEAN },
                        ambiguousFields: { type: Type.ARRAY, items: { type: Type.STRING } },
                        isScreenshot: { type: Type.BOOLEAN },
                        hasPhysicalReceipt: { type: Type.BOOLEAN },
                        imageQualityScore: { type: Type.NUMBER },
                        isReadable: { type: Type.BOOLEAN },
                        rawText: { type: Type.STRING }
                    },
                    required: ["imageQualityScore", "isReadable", "amount", "confidenceScore", "isScreenshot"]
                },
            },
        });

        const resultText = response.text;
        if (!resultText) throw new Error("No response from Gemini");

        const data = JSON.parse(resultText) as ExtractedData;

        // Ensure arrays are initialized
        if (!data.ambiguousFields) {
            data.ambiguousFields = [];
        }

        console.log('✅ Gemini analysis completed:', {
            model: 'gemini-2.0-flash-exp',
            confidence: data.confidenceScore,
            quality: data.imageQualityScore,
            comprobante: data.comprobante
        });

        return data;

    } catch (error: any) {
        console.error("Error calling Gemini:", error);

        // Provide helpful error messages
        if (error?.message?.includes('API_KEY')) {
            throw new Error("🔑 Gemini API Key not configured");
        }
        if (error?.message?.includes('quota') || error?.message?.includes('429')) {
            throw new Error("📊 API quota exceeded");
        }
        if (error?.message?.includes('403')) {
            throw new Error("🚫 Invalid API Key");
        }

        throw new Error(`❌ Gemini error: ${error.message}`);
    }
}
