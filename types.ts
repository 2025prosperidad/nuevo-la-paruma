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
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ExtractedData {
  bankName: string;
  accountOrConvenio: string; // The destination account or convenio
  amount: number;
  date: string; // ISO format YYYY-MM-DD
  time: string | null; // HH:MM usually found in Nequi or Redeban
  uniqueTransactionId: string | null; // RRN, Approval Code, Receipt Number (MUST BE UNIQUE)
  paymentReference: string | null; // Client ID, Cedula, Ref 1 (CAN BE REPEATED)
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