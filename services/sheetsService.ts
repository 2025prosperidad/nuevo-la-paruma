
import { ConsignmentRecord, ValidationStatus } from "../types";

// Helper to convert App Status to Sheet Status text
const mapStatusToSheet = (status: ValidationStatus) => {
  if (status === ValidationStatus.VALID) return 'Aceptada';
  return 'Rechazada';
};

// Helper to convert Sheet Status text to App Status
const mapSheetToStatus = (statusText: string): ValidationStatus => {
  if (!statusText) return ValidationStatus.VALID; // Default to valid if status column is missing in GET
  const s = statusText.toString().toLowerCase().trim();
  if (s === 'aceptada' || s === 'valid' || s === 'ok') return ValidationStatus.VALID;
  if (s.includes('duplicado')) return ValidationStatus.DUPLICATE;
  if (s.includes('autorizada') || s.includes('cuenta')) return ValidationStatus.INVALID_ACCOUNT;
  if (s.includes('calidad')) return ValidationStatus.LOW_QUALITY;
  return ValidationStatus.UNKNOWN_ERROR;
};

export const sendToGoogleSheets = async (
  records: ConsignmentRecord[], 
  scriptUrl: string
): Promise<{ success: boolean; message: string }> => {
  
  if (!scriptUrl) {
    return { success: false, message: "URL del Script no configurada" };
  }

  try {
    const payload = records.map(r => {
      // Infer "Tipo Pago" based on logic
      const isConvenio = r.accountOrConvenio && r.accountOrConvenio.length < 9; 
      const tipoPago = isConvenio ? 'recaudo' : 'transferencia';

      // Ensure no undefined values. Matching the specific columns requested by user documentation
      return {
        // Standard fields based on user doc
        estado: mapStatusToSheet(r.status),
        banco: r.bankName || '',
        tipoPago: tipoPago,
        valor: r.amount || 0,
        fechaTransaccion: r.date || '',
        hora: r.time || '',
        numeroReferencia: r.uniqueTransactionId || r.paymentReference || '',
        cuentaDestino: r.accountOrConvenio || '',
        titularCuentaDestino: 'Distribuidora La Paruma SAS',
        ciudad: '', // Optional
        
        // NUEVO: Enviar imagen en base64 para que el App Script la guarde en Drive
        imageBase64: r.imageUrl || '',
        
        // Extra fields for context if the script supports them (legacy support)
        fechaProcesamiento: new Date().toLocaleString('es-CO'),
        motivoRechazo: r.statusMessage !== 'OK' ? r.statusMessage : '',
        archivo: 'Imagen guardada en Drive',
        cuentaOrigen: '', 
        nombreConsignante: '', 
        descripcion: r.rawText ? r.rawText.substring(0, 100) + '...' : '',
        numeroOperacion: r.uniqueTransactionId || '',
        convenio: isConvenio ? r.accountOrConvenio : '',
        sucursal: '',
        cajero: ''
      };
    });

    // POST Request
    // We use "text/plain" content type to prevent the browser from sending an OPTIONS preflight request.
    // Google Apps Script doesn't handle OPTIONS requests well.
    const response = await fetch(scriptUrl, {
      method: "POST",
      redirect: 'follow', // Essential for GAS
      credentials: 'omit', // Prevent Google auth cookies from causing CORS issues
      headers: { "Content-Type": "text/plain" }, 
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (json.status === 'success') {
        return { success: true, message: json.message || "Sincronización completada." };
      } else if (json.status === 'error') {
        return { success: false, message: `Error del Script: ${json.message}` };
      }
    } catch (e) {
      console.warn("Response was not JSON:", text);
    }

    return { success: true, message: "Datos enviados correctamente." };

  } catch (error) {
    console.error("Google Sheets Error:", error);
    return { success: false, message: "Error de conexión. Verifica la URL del script." };
  }
};

export interface FetchOptions {
  limit?: number;
  estado?: string; // 'Aceptada', 'Rechazada'
  banco?: string;
  fechaInicio?: string;
  fechaFin?: string;
}

export const fetchHistoryFromSheets = async (
  scriptUrl: string, 
  options: FetchOptions = { limit: 50 }
): Promise<ConsignmentRecord[]> => {
  if (!scriptUrl) return [];

  try {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.estado) params.append('estado', options.estado);
    if (options.banco) params.append('banco', options.banco);
    if (options.fechaInicio) params.append('fechaInicio', options.fechaInicio);
    
    const fetchUrl = `${scriptUrl}?${params.toString()}`;

    // GET Request optimized for Google Apps Script
    // CRITICAL: DO NOT add custom headers like Content-Type: application/json here.
    // Adding custom headers triggers a CORS Preflight (OPTIONS) request, which Google Apps Script DOES NOT support.
    // By removing headers, this becomes a "Simple Request" and bypasses the preflight check.
    const response = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow', // Follow the 302 redirect from Google
      credentials: 'omit', // Don't send cookies
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      console.error("Invalid JSON response from Sheet:", text);
      throw new Error("La respuesta del servidor no es JSON válido.");
    }

    if (result.status === 'success' && Array.isArray(result.data)) {
      return result.data.map((row: any, index: number) => {
        // POLYGLOT MAPPING: Support multiple column names (Old vs New format)
        
        // 1. ID / Reference
        const id = row['ID Transacción'] || row['Número Operación'] || row['Número Referencia'] || row['numeroReferencia'] || `unknown-${index}`;
        const ref = row['Referencia Cliente'] || row['Número Referencia'] || row['numeroReferencia'] || '';

        // 2. Account / Convenio
        const acc = row['Cuenta/Convenio'] || row['Cuenta Destino'] || row['Convenio'] || row['cuentaDestino'] || '';

        // 3. Date
        const dateRaw = row['Fecha'] || row['Fecha Transacción'] || row['fechaTransaccion'] || '';
        const date = dateRaw ? String(dateRaw).split('T')[0] : '';

        // 4. Time
        const timeRaw = row['Hora'] || row['hora'] || '';
        const time = timeRaw.includes('T') ? timeRaw.split('T')[1].substring(0, 5) : String(timeRaw).substring(0, 5);

        // 5. Amount
        const val = row['Valor'] || row['valor'] || 0;

        // 6. Status
        const statusRaw = row['Estado'] || row['estado'] || 'Aceptada'; // Default to Accepted if column missing

        // 7. Image URL from Drive
        const imageUrl = row['URL Imagen'] || row['urlImagen'] || '';

        return {
          id: `sheet-${index}-${Date.now()}`,
          imageUrl: imageUrl, // URL de Google Drive
          status: mapSheetToStatus(statusRaw),
          statusMessage: row['Motivo Rechazo'] || row['motivoRechazo'] || statusRaw,
          createdAt: 0,
          
          bankName: row['Banco'] || row['banco'] || 'Desconocido',
          amount: Number(val) || 0,
          date: date,
          time: time,
          uniqueTransactionId: String(id),
          paymentReference: String(ref),
          accountOrConvenio: String(acc),
          
          imageQualityScore: 100,
          isReadable: true,
          rawText: `Historial: ${row['Tipo Pago'] || row['tipoPago'] || ''}`
        };
      });
    }
    return [];
  } catch (error) {
    console.error("Error fetching history:", error);
    throw error;
  }
};
