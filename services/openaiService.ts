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
    // Incluir hasta 10 ejemplos con TODOS los campos de entrenamiento
    const examples = trainingExamples.slice(0, 10);
    const examplesText = examples.length > 0
        ? examples.map((t, i) => {
            const d = t.correctData;
            const fields = [
                `Tipo: ${t.receiptType}`,
                `Decisión: ${t.decision}`,
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
                d.creditCardLast4 ? `Tarjeta (últimos 4): ${d.creditCardLast4}` : null,
                `Razón: ${t.decisionReason || ''}`,
                t.notes ? `Notas: ${t.notes}` : null,
            ].filter(Boolean).join('\n  ');
            return `EJEMPLO ${i + 1}:\n  ${fields}`;
        }).join('\n\n')
        : '';

    const trainingSection = examples.length > 0
        ? `
🎓 ENTRENAMIENTO OBLIGATORIO — ${examples.length} EJEMPLOS VERIFICADOS POR HUMANOS:

Estos ejemplos son la VERDAD. Aprende de ellos y aplica las mismas reglas.
Si la imagen es similar a un ejemplo, extrae los datos de la MISMA forma.
Las notas y razones del entrenador son INSTRUCCIONES que DEBES seguir.

${examplesText}

⚠️ PRIORIDAD: Los ejemplos de entrenamiento tienen MAYOR prioridad que cualquier otra regla.
`
        : '';

    return `Eres un experto en análisis de recibos bancarios colombianos.

TU TAREA: Analiza la imagen del recibo y extrae TODOS los datos visibles con precisión.
${trainingSection}
CAMPOS A EXTRAER (devuelve JSON):
- bankName (string): Nombre del banco
- city (string|null): Ciudad si es visible
- accountOrConvenio (string): Cuenta destino o número de convenio
- amount (number): Monto sin puntos ni comas
- date (string): Fecha en YYYY-MM-DD. Meses en español: ENE=01, FEB=02, MAR=03, ABR=04, MAY=05, JUN=06, JUL=07, AGO=08, SEP=09, OCT=10, NOV=11, DIC=12
- time (string|null): Hora en HH:MM
- rrn (string|null): Número RRN exacto como aparece en el recibo
- recibo (string|null): Número de RECIBO exacto como aparece
- apro (string|null): Número APRO o Aprob exacto como aparece
- operacion (string|null): Número de operación
- comprobante (string|null): Número de comprobante
- paymentReference (string|null): Referencia de pago o código cliente
- clientCode (string|null): Código del cliente si es visible
- creditCardLast4 (string|null): Últimos 4 dígitos de tarjeta si aplica
- isCreditCardPayment (boolean): true si es pago con tarjeta
- imageQualityScore (number): Calidad 0-100
- confidenceScore (number): Confianza 0-100
- isScreenshot (boolean): true si es captura de app
- hasPhysicalReceipt (boolean): true si tiene RRN/RECIBO/APRO
- isReadable (boolean): true si es legible
- rawText (string): Texto clave del recibo (líneas con RECIBO, RRN, APRO, CONVENIO, VALOR, REF)
- hasAmbiguousNumbers (boolean): true si algún número es dudoso
- ambiguousFields (string[]): Campos con números dudosos

REGLAS:
1. NUNCA inventes datos. Si no ves un campo, déjalo null.
2. Extrae los números EXACTAMENTE como aparecen, incluyendo ceros iniciales.
3. Si el recibo es similar a un ejemplo de entrenamiento, sigue la misma lógica.
4. Sé DETERMINISTA: la misma imagen siempre debe dar el mismo resultado.

Responde ÚNICAMENTE con JSON válido.`;
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
                max_tokens: 2500,
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

        // Intentar parsear JSON; si está truncado, intentar repararlo
        let parsed: any;
        try {
            parsed = JSON.parse(content);
        } catch (jsonErr) {
            // JSON truncado por max_tokens — intentar reparar
            let fixed = content.trim();
            // Si rawText está abierto y no cerrado, cerrarlo
            fixed = fixed.replace(/("rawText"\s*:\s*"[^"]*?)$/, '$1"');
            // Si ambiguousFields está abierto, cerrarlo
            fixed = fixed.replace(/(\[[^\]]*?)$/, '$1]');
            // Cerrar llaves/corchetes pendientes
            const opens = (fixed.match(/{/g) || []).length;
            const closes = (fixed.match(/}/g) || []).length;
            for (let i = 0; i < opens - closes; i++) fixed += '}';
            // Remover coma trailing antes de }
            fixed = fixed.replace(/,\s*}/g, '}');
            try {
                parsed = JSON.parse(fixed);
                console.warn('⚠️ JSON de GPT truncado — reparado automáticamente');
            } catch {
                throw new Error(`GPT-4o-mini falló: ${(jsonErr as Error).message}`);
            }
        }

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
