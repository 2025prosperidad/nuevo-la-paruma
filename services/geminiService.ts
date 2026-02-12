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

    // Filtrar solo registros aceptados
    const acceptedRecords = allTrainingRecords.filter(r => r.decision === 'ACCEPT');

    if (acceptedRecords.length === 0) return '';

    // Si hay tipo de recibo específico, filtrar por ese tipo primero
    let relevantRecords = receiptType
      ? acceptedRecords.filter(r => r.receiptType === receiptType)
      : acceptedRecords;

    // Si no hay registros del tipo específico, usar todos
    if (relevantRecords.length === 0) {
      relevantRecords = acceptedRecords;
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

    // Tomar máximo 3 ejemplos más recientes (sin duplicados)
    const examples = uniqueRecords
      .sort((a, b) => (b.trainedAt || 0) - (a.trainedAt || 0))
      .slice(0, 3);

    if (examples.length === 0) return '';

    console.log(`📚 Cargando ${examples.length} ejemplos de entrenamiento${receiptType ? ` para tipo ${receiptType}` : ''}`);

    // Construir texto de ejemplos
    const examplesText = examples.map((record, index) => {
      const data = record.correctData;
      return `
        📚 EJEMPLO DE ENTRENAMIENTO ${index + 1} (${record.receiptType}):
        Banco: ${data.bankName}
        Cuenta/Convenio: ${data.accountOrConvenio}
        Monto: ${data.amount}
        Fecha: ${data.date}
        ${data.rrn ? `RRN: ${data.rrn}` : ''}
        ${data.recibo ? `RECIBO: ${data.recibo}` : ''}
        ${data.apro ? `APRO: ${data.apro}` : ''}
        ${data.operacion ? `OPERACION: ${data.operacion}` : ''}
        ${data.comprobante ? `COMPROBANTE: ${data.comprobante}` : ''}
        ${data.paymentReference ? `Referencia Pago: ${data.paymentReference}` : ''}
        ${data.clientCode ? `Código Cliente: ${data.clientCode}` : ''}
        
        📝 Razón del entrenador: "${record.decisionReason}"
        ${record.notes ? `📌 Notas: "${record.notes}"` : ''}
      `.trim();
    }).join('\n\n');

    return `
    
    🎓 APRENDIZAJE PREVIO - APLICA ESTAS REGLAS:
    
    Has sido entrenado con estos ${examples.length} ejemplos correctos. 
    DEBES seguir estos patrones y reglas aprendidas:
    
    ${examplesText}
    
    ⚠️ IMPORTANTE: Aplica las mismas reglas y patrones de estos ejemplos al analizar la nueva imagen.
    Si encuentras un recibo similar a alguno de estos ejemplos, usa la misma lógica de extracción.
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

  const prompt = `
    Analyze this image of a Colombian bank payment receipt (consignación or comprobante).
    Types: Redeban (Thermal paper), Wompi/Corresponsal Bancolombia, Bancolombia App, Nequi (Purple screenshot), Banco Agrario, Davivienda.
    
    ⚠️ WOMPI RECEIPTS (Corresponsal Bancolombia via Wompi):
    - Header shows "Wompi" and "Corresponsal Bancolombia"
    - Fields: Recibo, RRN (can be 12+ digits!), Aprob (same as APRO), C. Único, Ter
    - Format: "Recibo:283172  Ter:4MMD4W9338" and "RRN:804289283172 Aprob:747977 C. Único:59839"
    - The RRN in Wompi is LONGER than Redeban (12 digits vs 6). Extract the FULL number.
    - "Aprob" = same as "APRO" in Redeban. Extract it as the apro field.
    - Convenio and Referencia fields are on separate labeled lines.

${trainingContext || ''}

    ${trainingContext ? `🎯 ATENCIÓN CRÍTICA - REGLAS DE ENTRENAMIENTO OBLIGATORIAS:

Los ejemplos de entrenamiento mostrados arriba son REGLAS OBLIGATORIAS que DEBES seguir EXACTAMENTE.

⚠️ REGLAS IMPORTANTES (APLICAN A TODOS LOS TIPOS DE RECIBO Y BANCOS):
1. Si encuentras un recibo que coincide con un ejemplo de entrenamiento ACCEPT y tiene:
   - Valor legible (amount > 0)
   - Fecha legible (date no vacío)
   - Al menos un identificador de transacción (comprobante, operacion, rrn, recibo, apro) O cuenta/convenio legible
   
   ENTONCES: DEBES extraer los datos normalmente y NO marcar como "requiere autorización".
   Estos recibos SON VÁLIDOS según el entrenamiento, independientemente del banco o tipo.

2. Aplica EXACTAMENTE las mismas reglas, patrones y lógica indicadas en la "Razón del entrenador" y "Notas" de cada ejemplo.

3. NO pidas autorización si el recibo cumple las condiciones de los entrenamientos aceptados.

4. Los recibos digitales (capturas de app) con comprobante/operacion son SOPORTES DIGITALES VÁLIDOS según el entrenamiento.

5. Esta regla aplica para TODOS los bancos y tipos de recibo: Bancolombia, Nequi, Banco Agrario, Davivienda, Banco de Bogotá, Occidente, y cualquier otro banco que aparezca en los ejemplos.

6. Si el recibo es similar a un ejemplo de entrenamiento pero de un banco diferente, aplica la misma lógica si el formato es equivalente.` : ''}

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
       
       F) **BANCO DE BOGOTÁ - COMPROBANTE DE RECAUDOS (FORMATO ESPECIAL)**:
          ⚠️ En recibos de "Comprobante de Recaudos" de Banco de Bogotá:
          • El número de aprobación está en formato: "Srv XXXX AQXXXXXX"
          • Ejemplo: "Srv 2121 AQ032201" → operacion="2121AQ032201"
          • EXTRAER COMPLETO incluyendo "AQ" y todos los dígitos
          • NO confundir con:
            - "Usu6150" (usuario, ignorar)
            - "T157" (terminal, ignorar)
            - "Us:749805890937257" (referencia cliente, va en paymentReference)
          
          **EJEMPLO BANCO DE BOGOTÁ:**
          "Srv 2121 AQ032201 Usu6150 T157"
          → operacion = "2121AQ032201" ✅
          → uniqueTransactionId = "2121AQ032201"
          
          "Us:749805890937257"
          → paymentReference = "749805890937257"
          
          "CEO 1709" + "CERVECERIA UNION"
          → accountOrConvenio = "1709"
          → clientCode = "10813353"
       
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
       
       ⚠️ REGLAS CLARAS PARA CADA TIPO DE RECIBO:
       
       **accountOrConvenio** = CUENTA/CONVENIO DESTINO:
       - "Número de producto:", "Cuenta:", "Producto No:", "Convenio:"
       - Este es el número de cuenta o convenio donde se depositó
       
       **paymentReference** = NÚMERO DE CUENTA O CÓDIGO CLIENTE:
       - Para BANCOLOMBIA (depósitos a cuenta): Usar el MISMO número de producto/cuenta
         → "Número de producto: 24500020950" → paymentReference="24500020950"
       - Para RECAUDOS (convenios): Usar el código cliente o referencia
         → "Codigo cliente: 10813353" → paymentReference="10813353"
         → "Ref 1: 10813353" → paymentReference="10813353"
       
       **⚠️ IMPORTANTE - BANCOLOMBIA DEPÓSITOS:**
       Cuando es un DEPÓSITO A CUENTA CORRIENTE/AHORROS de Bancolombia:
       - accountOrConvenio = Número de producto (ej: "24500020950")
       - paymentReference = TAMBIÉN el número de producto (ej: "24500020950")
       - NO usar el "Id Depositante/Pagador" - ese es quien deposita, no es relevante
       
       **EJEMPLO DEPÓSITO BANCOLOMBIA:**
       - "Número de producto: 24500020950" → accountOrConvenio="24500020950"
       - "Número de producto: 24500020950" → paymentReference="24500020950" ✅
       - "Id Depositante/Pagador: 901284158" → IGNORAR (no usar)
       
       **EJEMPLO RECAUDO/CONVENIO:**
       - "Convenio: 32137" → accountOrConvenio="32137"
       - "Codigo cliente cervunion: 10813353" → paymentReference="10813353"
       
       **EJEMPLO BANCO AGRARIO - RECAUDO DE CONVENIOS:**
       Formato típico:
       - "Convenio: 18129 WS - CERVECERIA UNION S.A - RM"
       - "Ref 1: 13937684"
       - "Ref 2: 13937684"
       - "Operación: 604184018"
       
       Extracción correcta:
       - accountOrConvenio = "18129" (solo el número del convenio, sin "WS")
       - paymentReference = "13937684" (el código Ref 1)
       - operacion = "604184018"
       - bankName = "Banco Agrario"
       - city = extraer de "Oficina: 3360-RIOSUCIO (CHOCO)" → "RIOSUCIO"
       
       ⚠️ El Ref 1/Ref 2 es el CÓDIGO DEL CLIENTE - SIEMPRE ponerlo en paymentReference
    
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
          - If reference is "749805890937257" (internal bank reference for Cervunion)
       
       ⚠️ If detected as Cervecería Unión, ALWAYS return clientCode="10813353"
       
       ⚠️ IMPORTANTE - REFERENCIAS INTERNAS DEL BANCO:
       Si el recibo es de Cervecería Unión Y la referencia es "749805890937257":
       - Este es un número interno del banco, NO el código del cliente
       - paymentReference DEBE SER "10813353" (el código real del cliente)
       - NO usar "749805890937257" como paymentReference
       
       EJEMPLO:
       - Convenio: 32137 - CERVECERIA UNION
       - REF: 749805890937257
       → paymentReference = "10813353" ✅ (NO "749805890937257")
    
    4. **💳 PAGOS CON TARJETA DE CRÉDITO (IMPORTANTE)**:
       Si el recibo muestra "TARJETA DE CREDITO" con números enmascarados:
       - "TARJETA DE CREDITO: ************4998"
       - "TARJETA: **** **** **** 4998"
       
       **EXTRAER:**
       - creditCardLast4 = últimos 4 dígitos de la tarjeta (ej: "4998")
       - paymentReference = últimos 4 dígitos de la tarjeta (ej: "4998")
       - isCreditCardPayment = true
       
       **⚠️ NO CONFUNDIR con:**
       - C.UNICO: Este es el código único del corresponsal, NO la referencia de pago
       - El C.UNICO (ej: 3007012166) NO debe usarse como accountOrConvenio
       
       **EJEMPLO PAGO CON TARJETA:**
       - "PAGO"
       - "TARJETA DE CREDITO: ************4998"
       - "C.UNICO: 3007012166"
       
       Extracción correcta:
       - paymentReference = "4998" (últimos 4 dígitos tarjeta)
       - creditCardLast4 = "4998"
       - isCreditCardPayment = true
       - accountOrConvenio = "" (no hay cuenta/convenio, es pago con tarjeta)
    
    5. **📱 SCREENSHOT VS PHYSICAL RECEIPT**:
       - isScreenshot=true if: App screenshot, phone status bar visible, Nequi purple background
       - isScreenshot=false if: Thermal paper, physical printer output
       - hasPhysicalReceipt=true ONLY if there's a RECIBO/RRN/APRO number (Redeban style)
       - Screenshots from Bancolombia App usually have "Comprobante" but NO physical receipt number
    
    6. **📅 DATE (CRITICAL - REJECT IF MISSING)**:
       - Extract date in YYYY-MM-DD format
       - Handle text months: "27 Dic 2025" → "2025-12-27"
       - Spanish months: ENE=01, FEB=02, MAR=03, ABR=04, MAY=05, JUN=06, JUL=07, AGO=08, SEP=09, OCT=10, NOV=11, DIC=12
       - ⚠️ If NO date visible, return empty string - this will be REJECTED
    
    7. **⏰ TIME**:
       - Extract time in HH:MM format
       - Normalize to 24h format
    
    8. **💵 AMOUNT**:
       - Extract total amount as NUMBER (no currency symbol)
       - "$ 1.000.000,00" → 1000000
       - "$120,000,000.00" → 120000000
    
    9. **🎯 CONFIDENCE SCORE (0-100) - SÉ ESTRICTO**:
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

    10. **🚫 AMBIGUOUS NUMBERS - OBLIGATORIO REPORTAR**:
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

    11. **📜 RAW TEXT - ABSOLUTAMENTE CRÍTICO**:
       - rawText DEBE contener TODO el texto visible de la imagen, mínimo 500 caracteres.
       - NUNCA truncar rawText. Incluir TODAS las líneas, especialmente las que contienen:
         RECIBO, RRN, APRO, CONVENIO, REF, VALOR, OPERACION, UPC, C.UNICO, TER
       - Para recibos Redeban térmicos, las líneas "RECIBO: XXXXX  RRN: XXXXX  APRO: XXXXX" 
         son LAS MÁS IMPORTANTES y deben aparecer COMPLETAS en rawText.
       - Si no incluyes estas líneas en rawText, la extracción será incorrecta.

    12. **⚠️ REDEBAN TÉRMICO - TRIPLETA OBLIGATORIA**:
       - En TODOS los recibos que digan "Redeban" DEBES extraer RRN, RECIBO y APRO.
       - Estos 3 campos SIEMPRE están en el recibo, generalmente en la misma línea o líneas contiguas.
       - Formato típico: "RECIBO: 224936   RRN: 228331   APRO: 096133"
       - Si NO los encuentras, reduce confidenceScore a 50 y marca hasAmbiguousNumbers=true.
       - NUNCA inventes números. Si no se leen, deja el campo vacío y baja el score.

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
