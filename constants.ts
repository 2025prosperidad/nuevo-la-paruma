
export const COMPANY_NAME = "Distribuidora La Paruma SAS";

// Reemplaza esto con la URL de tu Web App de Google Apps Script
// Si lo dejas vacío, la app te lo pedirá la primera vez que intentes sincronizar
export const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby0vY9L27k4TSvZd5wtuT6J5ZbHZl0WT8p5xvWgHjwNZPXE6zWtKKbcS8_8Sn8i-JtJ/exec"; 

// Normalize strings: remove spaces, dashes, and leading zeros for accurate comparison
export const normalizeAccount = (acc: string) => {
  if (!acc) return '';
  const clean = acc.replace(/[\s-]/g, '');
  // Remove leading zeros: "000245" -> "245"
  return clean.replace(/^0+/, '');
};

export const ALLOWED_ACCOUNTS = [
  // Bancolombia
  '24500020949', // Ahorros
  '24500020950', // Corriente
  // Occidente
  '001305000001000169513', // CTE
  '425832797', // Producto No. CTE
  // Anteriores / Respaldo
  '24500081160',
  '24552844602'
];

export const ALLOWED_CONVENIOS = [
  // Davivienda
  '1352327',
  '1192509',
  // Bancolombia
  '56885',
  '73180',
  // Banco Agrario
  '18129',
  '14311',
  // BBVA
  '3278',
  '29140'
];

export const COMMON_REFERENCES = [
  '10813353',
  '13937684'
];

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