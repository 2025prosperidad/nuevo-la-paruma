export enum ProcessingStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export enum ValidationStatus {
  VALID = 'VALID',
  DUPLICATE = 'DUPLICATE',
  INVALID_ACCOUNT = 'INVALID_ACCOUNT',
  LOW_QUALITY = 'LOW_QUALITY',
  MISSING_DATE = 'MISSING_DATE',           // Sin fecha visible
  MISSING_RECEIPT_NUMBER = 'MISSING_RECEIPT_NUMBER', // Sin número de recibo - requiere autorización
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',       // IA no está segura de los números
  REQUIRES_AUTHORIZATION = 'REQUIRES_AUTHORIZATION', // Captura que necesita autorización humana
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ExtractedData {
  bankName: string;
  city: string | null; // Ciudad donde se hizo la consignación
  accountOrConvenio: string; // The destination account or convenio
  amount: number;
  date: string; // ISO format YYYY-MM-DD
  time: string | null; // HH:MM usually found in Nequi or Redeban
  
  // MÚLTIPLES NÚMEROS ÚNICOS - Todos deben validarse
  uniqueTransactionId: string | null; // Primary ID (backward compatibility)
  rrn: string | null; // RRN (Red de Recaudo) - Redeban
  recibo: string | null; // Número de Recibo - Redeban
  apro: string | null; // Código de Aprobación - Redeban
  operacion: string | null; // Número de Operación - Banco Agrario, Bancolombia
  comprobante: string | null; // Comprobante - Bancolombia App
  
  paymentReference: string | null; // Client ID, Cedula, Ref 1 (CAN BE REPEATED)
  clientCode: string | null; // Código cliente Cervunión (10813353)
  
  // CONFIANZA DE LA IA
  confidenceScore: number; // 0-100 - Qué tan segura está la IA de los números extraídos
  hasAmbiguousNumbers: boolean; // Si hay números que podrían estar mal leídos
  ambiguousFields: string[]; // Lista de campos con lectura dudosa
  
  // TIPO DE DOCUMENTO
  isScreenshot: boolean; // Es captura de pantalla (no recibo físico)
  hasPhysicalReceipt: boolean; // Tiene número de recibo físico
  
  imageQualityScore: number; // 0-100
  isReadable: boolean;
  rawText: string;
}

export interface ConsignmentRecord extends ExtractedData {
  id: string;
  imageUrl: string;
  imageHash?: string; // SHA-256 hash to detect exact duplicate images
  status: ValidationStatus;
  statusMessage: string;
  createdAt: number;
  
  // AUTORIZACIÓN MANUAL
  authorizationUrl?: string; // URL del documento de autorización subido
  authorizedBy?: string; // Nombre de quien autorizó
  authorizedAt?: number; // Timestamp de autorización
}

export interface ValidationRule {
  isValid: boolean;
  message: string;
}

export interface ConfigItem {
  id: string;
  value: string; // The actual account/convenio number
  label: string; // Description (e.g., "Bancolombia Ahorros")
  type: 'ACCOUNT' | 'CONVENIO';
}