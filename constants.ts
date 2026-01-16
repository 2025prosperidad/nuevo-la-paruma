
export const COMPANY_NAME = "Distribuidora La Paruma SAS";

// URL del Web App de Google Apps Script (actualizada 11/12/2025)
// Esta URL conecta con la base de datos para leer/guardar consignaciones y configuración
export const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbztmBbxC5Ljnh3eF1GjM0pcFVAE0ft7gBGDCwyEKarzuj-dAA9v1H0Y75myXk-hKWfU/exec"; 

// Normalize strings: remove spaces, dashes, and leading zeros for accurate comparison
export const normalizeAccount = (acc: string | number | null | undefined) => {
  if (acc === null || acc === undefined || acc === '') return '';
  // Convertir a string para manejar valores numéricos de Google Sheets
  const str = String(acc);
  const clean = str.replace(/[\s-]/g, '');
  // Remove leading zeros: "000245" -> "245"
  return clean.replace(/^0+/, '');
};

export const ALLOWED_ACCOUNTS = [
  // Bancolombia - Cuentas principales
  '24500020949',  // Cuenta Ahorros
  '24500020950',  // Cuenta Corriente
  '24500081160',  // Cuenta Ahorros (visto en Nequi)
  '24552844602',  // Cuenta Corriente (visto en Bancolombia App y Nequi)
  '245528446',    // Variante corta de 24552844602
  // Occidente
  '001305000001000169513', // Cuenta Corriente
  '425832797',   // Producto No. Cuenta Corriente
  // Cuentas adicionales
  '1234',        // Cuenta temporal/test
  '1222222',     // Otra cuenta temporal
  '444444'       // Otra cuenta temporal
];

// Tarjetas de crédito autorizadas (últimos 4 dígitos)
export const ALLOWED_CREDIT_CARDS = [
  '4998'  // Tarjeta autorizada terminada en 4998
];

export const ALLOWED_CONVENIOS = [
  // Davivienda
  '1352327',
  '1192509',
  // Bancolombia
  '56885',  // RIN CERVECERÍA UNIÓN (más común)
  '73180',
  '04184',  // DISTRIBUIDORA LA PAR (visto en recibos Redeban)
  // Banco Agrario
  '18129',  // CERVECERÍA UNION S.A - RM
  '14311',
  // BBVA
  '3278',
  '29140',
  // Banco de Bogotá
  '1709',   // CEO - CERVECERÍA UNIÓN S.A. (Comprobante de Recaudos)
  // Otros recaudos
  '32137'   // CERVECERÍA UNIÓN T R (visto en recibos Redeban)
];

export const COMMON_REFERENCES = [
  '10813353',  // Código Cervecería Unión - Cliente La Paruma
  '13937684'   // Cliente Cervecería Unión (otro cliente)
];

// Código de cliente de Cervecería Unión para La Paruma
export const CERVECERIA_UNION_CLIENT_CODE = '10813353';

// Mapa de clientes conocidos (referencia → nombre)
export const KNOWN_CLIENTS: Record<string, string> = {
  '10813353': 'La Paruma - Cervecería Unión',
  '13937684': 'Cliente Cervecería Unión',
  // Tarjetas de crédito autorizadas
  '4998': '💳 Tarjeta de Crédito Autorizada',
};

// Referencias internas del banco que deben reemplazarse por el código de cliente real
// Cuando aparecen estos números en recibos de Cervecería Unión, usar 10813353 en su lugar
export const CERVECERIA_UNION_INTERNAL_REFS = [
  '749805890937257',  // Referencia interna que aparece en recibos Redeban/Bancolombia
  '74980589093725',   // Variantes posibles
  '7498058909372577',
];

// Convenios que corresponden a Cervecería Unión
export const CERVECERIA_UNION_CONVENIOS = [
  '32137',   // CERVECERÍA UNIÓN T R
  '56885',   // RIN CERVECERÍA UNIÓN
  '1709',    // CEO - Cervecería Unión S.A.
  '18129',   // CERVECERÍA UNION S.A - RM (Banco Agrario)
];

// Palabras clave que identifican pagos a Cervecería Unión
export const CERVECERIA_UNION_KEYWORDS = [
  'cerveceria union',
  'cervecería unión',
  'cerveceria unión',
  'cervecería union',
  'cervunion',
  'cerv union',
  'rin cerveceria',
  'rin cervecería',
  'cerveceria uni',    // Para casos abreviados como "CERVECERIA UNI-N"
  'ceo 1709',          // CEO Cervecería
  'cerveceria s.a',
  'cervecería s.a'
];

// Umbral mínimo de confianza de la IA para aprobar automáticamente
// BALANCEADO: 80% es suficiente si no hay números ambiguos
// Umbral de confianza para auto-aprobación
// Reducido de 80 a 50 porque recibos claros estaban siendo marcados con baja confianza
export const MIN_CONFIDENCE_SCORE = 50;

// Umbral de calidad mínima para recibos térmicos (Redeban, etc.)
export const MIN_THERMAL_QUALITY_SCORE = 65;

// Campos críticos que NO pueden tener errores
export const CRITICAL_FIELDS = ['amount', 'date', 'uniqueTransactionId', 'rrn', 'recibo', 'apro', 'operacion'];

// Changed from 70 to 60 to accept "3 out of 5" quality
export const MIN_QUALITY_SCORE = 60;

export const BUILD_INFO = (() => {
  let hash = 'DEV';
  let date = new Date().toISOString().split('T')[0];
  let message = 'Versión Local';
  let author = 'Local';

  try {
    // Intenta leer variables de entorno estándar de Vite
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        if (import.meta.env.VITE_GIT_COMMIT_HASH) hash = import.meta.env.VITE_GIT_COMMIT_HASH;
        // @ts-ignore
        if (import.meta.env.VITE_GIT_COMMIT_DATE) date = import.meta.env.VITE_GIT_COMMIT_DATE;
        // @ts-ignore
        if (import.meta.env.VITE_GIT_COMMIT_MESSAGE) message = import.meta.env.VITE_GIT_COMMIT_MESSAGE;
        // @ts-ignore
        if (import.meta.env.VITE_GIT_COMMIT_AUTHOR) author = import.meta.env.VITE_GIT_COMMIT_AUTHOR;
    }
  } catch (e) {
    // Fallback silencioso
  }

  return { hash, date, message, author };
})();