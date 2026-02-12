import OpenAI from 'openai';
import { ExtractedData, ReceiptType, TrainingRecord } from '../types';
import { OPENAI_API_KEY } from '../constants';

// Inicializar cliente de OpenAI
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true // Solo para desarrollo, en producción usar proxy
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRateLimitError = (error: any): boolean => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('rate limit') || message.includes('429') || error?.status === 429;
};

const getRetryDelayMs = (error: any, fallbackMs: number): number => {
    const message = String(error?.message || '');
    const match = message.match(/try again in\s+(\d+)ms/i);
    if (match) return Number(match[1]) + 250;
    return fallbackMs;
};

/**
 * Construir prompt mejorado con ejemplos de entrenamiento
 */
function buildPromptWithTraining(trainingExamples: TrainingRecord[]): string {
    const compactExamples = trainingExamples.slice(0, 4);
    const examplesText = compactExamples.length > 0
        ? compactExamples.map((t, i) => `
EJEMPLO ${i + 1} (${t.receiptType}):
- Decisión: ${t.decision}
- Razón: ${String(t.decisionReason || '').substring(0, 180)}
- Banco: ${t.correctData.bankName}
- Monto: ${t.correctData.amount}
- Comprobante: ${t.correctData.comprobante || t.correctData.operacion || 'N/A'}
- Fecha: ${t.correctData.date}
`).join('\n')
        : 'No hay ejemplos de entrenamiento disponibles aún.';

    return `Eres un experto en análisis de recibos bancarios colombianos. Tu tarea es extraer información de forma PRECISA y DETERMINISTA.

INSTRUCCIONES CRÍTICAS PARA BANCOLOMBIA APP:

Basado en entrenamientos previos, estos recibos SIEMPRE deben ser aceptados si:
1. ✅ Comprobante visible y legible (10 dígitos)
2. ✅ Monto claramente visible
3. ✅ Fecha presente
4. ✅ Producto destino (cuenta/convenio) visible
5. ✅ No hay signos de manipulación

EJEMPLOS DE ENTRENAMIENTOS PREVIOS:
${examplesText}

REGLAS ESPECÍFICAS BANCOLOMBIA APP:
- Capturas de "¡Pago exitoso!" o "¡Transferencia exitosa!" son VÁLIDAS.
- Para "Transferencia exitosa", el "Producto destino" es el número de cuenta.
- "Distribuidora La Paruma Sas" o "La Paruma" es nuestra empresa. Extráelo como bankName o verifica su cuenta destino.
- Comprobante de 10 dígitos es el número único principal (campo "comprobante").
- Código cliente 10813353 = La Paruma (Cervecería Unión).
- Convenio 32137 = Cervecería Unión T R.
- Cuenta destino puede aparecer parcial (*8520, *1640, *8421, *4586) o completa (245-000209-50).

CAMPOS A EXTRAER:

1. **bankName** (string): Nombre del banco o Receptor (ej: "Bancolombia", "Distribuidora La Paruma Sas").

2. **city** (string | null): Ciudad donde se hizo la transacción (si está visible).

3. **accountOrConvenio** (string): 
   - Para Bancolombia App: el número de cuenta destino completo o parcial. Look for "Producto destino".
   - Para recibos de convenio: el código del convenio (ej: "32137", "56885").
   - Si solo ves últimos 4 dígitos (*8520), extraer esos 4 dígitos: "8520".

4. **amount** (number): Monto en pesos colombianos SIN puntos ni comas (ej: 1400000, 335000, 1197742).

5. **date** (string): Fecha en formato YYYY-MM-DD (ej: "2026-01-23").

6. **time** (string | null): Hora en formato HH:MM (ej: "12:30", "09:17", "13:19").

7. **comprobante** (string | null): Número de comprobante de 10 dígitos (ej: "0000003046", "0000048062", "0000010115").
   - Este es el número MÁS IMPORTANTE en Bancolombia App.
   - Aparece como "Comprobante No." en la pantalla.

8. **operacion** (string | null): Número de operación (si es diferente al comprobante).

9. **paymentReference** (string | null): Referencia de pago o código cliente (puede repetirse).

10. **clientCode** (string | null): Código cliente Cervunión (10813353) si está visible.

11. **imageQualityScore** (number): Calidad de 0-100 (90-100 para capturas de app).

12. **confidenceScore** (number): Tu confianza en la extracción de 0-100 (95-100 si es claro).

13. **isScreenshot** (boolean): true si es captura de app, false si es foto de recibo físico.

14. **hasPhysicalReceipt** (boolean): false para capturas de app, true para recibos térmicos.

15. **isReadable** (boolean): true si la imagen es legible.

16. **rawText** (string): TODO el texto visible en la imagen. INCLUIR al menos 500 caracteres. NUNCA truncar las líneas que contengan RECIBO, RRN, APRO, UPC, CONVENIO, REF, VALOR.

17. **rrn** (string | null): Número RRN de recibos térmicos Redeban o Wompi. En Redeban son 6 dígitos (ej: "228331"). En Wompi pueden ser 12+ dígitos (ej: "804289283172"). Extraer el número COMPLETO.
18. **recibo** (string | null): Número de RECIBO de recibos térmicos Redeban o Wompi (ejemplo: "224936", "283172").
19. **apro** (string | null): Número APRO o Aprob de recibos térmicos. En Redeban aparece como "APRO:" (ej: "096133"). En Wompi aparece como "Aprob:" (ej: "747977"). Ambos son el mismo campo.

IMPORTANTE:
- Sé DETERMINISTA: la misma imagen debe dar siempre el mismo resultado.
- Para Bancolombia "Transferencia exitosa", extraer el número de "Producto destino".
- Si aparece "Distribuidora La Paruma Sas", es para nosotros.
- Calidad de capturas de app debe ser 90-100.
- Confianza debe ser 95-100 si todos los campos están claros.

Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni explicaciones adicionales.`;
}

/**
 * Analizar recibo con GPT-4o-mini
 */
export async function analyzeWithGPT4(
    base64Image: string,
    mimeType: string = 'image/jpeg',
    trainingExamples: TrainingRecord[] = []
): Promise<ExtractedData> {
    const prompt = buildPromptWithTraining(trainingExamples);
    let response: any;

    // Reintento controlado para errores transitorios de cuota/TPM
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Image}`,
                                    detail: 'high'
                                }
                            }
                        ]
                    }
                ],
                temperature: 0, // DETERMINISTA
                max_tokens: 1200,
                response_format: { type: 'json_object' }
            });
            break;
        } catch (error: any) {
            if (!isRateLimitError(error) || attempt === 2) {
                throw error;
            }

            const delayMs = getRetryDelayMs(error, 1200 * (attempt + 1));
            console.warn(`⏳ GPT-4o-mini rate-limited, reintentando en ${delayMs}ms (intento ${attempt + 2}/3)...`);
            await sleep(delayMs);
        }
    }

    try {
        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No se recibió respuesta de GPT-4o-mini');
        }

        const parsed = JSON.parse(content);

        // Normalizar y validar datos
        const extractedData: ExtractedData = {
            bankName: parsed.bankName || 'No especificado',
            city: parsed.city || null,
            accountOrConvenio: String(parsed.accountOrConvenio || ''),
            amount: Number(parsed.amount) || 0,
            date: parsed.date || new Date().toISOString().split('T')[0],
            time: parsed.time || null,

            uniqueTransactionId: parsed.comprobante || parsed.operacion || null,
            rrn: parsed.rrn || null,
            recibo: parsed.recibo || null,
            apro: parsed.apro || null,
            operacion: parsed.operacion || null,
            comprobante: parsed.comprobante || null,

            paymentReference: parsed.paymentReference || null,
            clientCode: parsed.clientCode || null,

            creditCardLast4: parsed.creditCardLast4 || null,
            isCreditCardPayment: parsed.isCreditCardPayment || false,

            confidenceScore: Math.min(100, Math.max(0, Number(parsed.confidenceScore) || 50)),
            hasAmbiguousNumbers: parsed.hasAmbiguousNumbers || false,
            ambiguousFields: parsed.ambiguousFields || [],

            isScreenshot: parsed.isScreenshot !== undefined ? parsed.isScreenshot : true,
            hasPhysicalReceipt: parsed.hasPhysicalReceipt !== undefined ? parsed.hasPhysicalReceipt : false,

            imageQualityScore: Math.min(100, Math.max(0, Number(parsed.imageQualityScore) || 70)),
            isReadable: parsed.isReadable !== undefined ? parsed.isReadable : true,
            rawText: parsed.rawText || ''
        };

        console.log('✅ GPT-4o-mini analysis completed:', {
            model: 'gpt-4o-mini',
            confidence: extractedData.confidenceScore,
            quality: extractedData.imageQualityScore,
            comprobante: extractedData.comprobante
        });

        return extractedData;

    } catch (error: any) {
        console.error('❌ Error en análisis con GPT-4o-mini:', error);
        throw new Error(`GPT-4o-mini falló: ${error.message}`);
    }
}
