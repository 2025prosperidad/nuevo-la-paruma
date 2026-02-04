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
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',     // Requiere verificación humana de los números
  DATE_OUT_OF_RANGE = 'DATE_OUT_OF_RANGE',           // Fecha fuera del rango permitido
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

  // TARJETA DE CRÉDITO
  creditCardLast4?: string | null; // Últimos 4 dígitos de tarjeta de crédito
  isCreditCardPayment?: boolean; // Si el pago fue con tarjeta de crédito

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

  // VERIFICACIÓN DE NÚMEROS
  verifiedNumbers?: boolean; // Si el usuario verificó que los números son correctos
  verifiedBy?: string; // Nombre de quien verificó
  verifiedAt?: number; // Timestamp de verificación
  originalNumbers?: { // Números originales detectados por IA (antes de corrección)
    operacion?: string;
    rrn?: string;
    recibo?: string;
    apro?: string;
    comprobante?: string;
  };

  // AI MODEL METADATA
  analyzedWith?: AIModel; // Qué modelo de IA analizó este recibo
  fromCache?: boolean; // Si el resultado vino del caché
  analysisTime?: number; // Tiempo de análisis en ms
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

// ==========================================
// TRAINING DATA - DATOS DE ENTRENAMIENTO
// ==========================================

export enum TrainingDecision {
  ACCEPT = 'ACCEPT',         // Este recibo debe ser aceptado
  REJECT_BLURRY = 'REJECT_BLURRY',    // Rechazar por borroso/mala calidad
  REJECT_INVALID = 'REJECT_INVALID',  // Rechazar por datos incorrectos
  REJECT_DUPLICATE = 'REJECT_DUPLICATE', // Rechazar por duplicado
  REJECT_FRAUD = 'REJECT_FRAUD',     // Rechazar por sospecha de fraude
}

export interface TrainingRecord {
  id: string;
  imageUrl: string;
  imageHash?: string;
  createdAt: number;

  // Decisión humana sobre este recibo
  decision: TrainingDecision;
  decisionReason: string; // Explicación de por qué se aceptó/rechazó

  // Datos CORRECTOS según el humano (ground truth)
  correctData: ExtractedData;

  // Datos extraídos originalmente por la IA (para comparación)
  aiExtractedData: ExtractedData;

  // Metadata de entrenamiento
  trainedBy: string; // Nombre de quien entrenó
  trainedAt: number; // Timestamp de entrenamiento

  // Tipo de recibo para categorización
  receiptType: ReceiptType;

  // Notas adicionales
  notes?: string;
}

export enum ReceiptType {
  REDEBAN_THERMAL = 'REDEBAN_THERMAL',        // Recibo térmico Redeban
  BANCOLOMBIA_APP = 'BANCOLOMBIA_APP',        // Captura Bancolombia App
  NEQUI = 'NEQUI',                            // Captura Nequi
  BANCO_AGRARIO = 'BANCO_AGRARIO',            // Recibo Banco Agrario
  DAVIVIENDA = 'DAVIVIENDA',                  // Recibo Davivienda
  BANCO_BOGOTA = 'BANCO_BOGOTA',              // Recibo Banco de Bogotá
  OCCIDENTE = 'OCCIDENTE',                    // Recibo Banco de Occidente
  CREDIT_CARD = 'CREDIT_CARD',                // Pago con tarjeta de crédito
  OTHER = 'OTHER'                             // Otro tipo
}

// Configuración de tipos de recibo aceptados/rechazados
export interface ReceiptTypeConfig {
  type: ReceiptType;
  label: string;
  isAccepted: boolean; // Si este tipo de recibo es aceptado
  minQualityScore: number; // Calidad mínima requerida para este tipo
  requiresPhysicalReceipt: boolean; // Si requiere número de recibo físico
  notes: string; // Notas sobre este tipo de recibo
}

// ==========================================
// AI MODEL CONFIGURATION - MULTI-MODEL SYSTEM
// ==========================================

export enum AIModel {
  GEMINI = 'GEMINI',           // Gemini 1.5 Flash (rápido)
  GPT4_MINI = 'GPT4_MINI',     // GPT-4o-mini (preciso)
  CONSENSUS = 'CONSENSUS'       // Ambos modelos (consenso)
}

export interface AnalysisResult {
  data: ExtractedData;
  model: AIModel;
  fromCache: boolean;
  analysisTime: number;
  consensusAgreement?: number; // 0-100 si es modo consenso
}

export interface AIConfig {
  preferredModel: AIModel;
  enableCache: boolean;
  cacheExpiration: number; // horas
  useTrainingExamples: boolean;
  maxTrainingExamples: number;
}

export interface CachedAnalysis {
  hash: string;
  result: ExtractedData;
  model: AIModel;
  timestamp: number;
  trainingVersion: number; // Invalidar si hay nuevos entrenamientos
}

// Configuración Global del Sistema
export interface GlobalConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}