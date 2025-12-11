// ===========================================
// SCRIPT DE GOOGLE APPS PARA VALIDACIÓN DE CONSIGNACIONES
// Guarda datos en Google Sheets e imágenes en Google Drive
// ===========================================

// CONFIGURACIÓN - ACTUALIZA ESTOS IDs
const SPREADSHEET_ID = 'TU_ID_DE_GOOGLE_SHEET_AQUI'; // ID de tu Google Sheet
const DRIVE_FOLDER_ID = 'TU_ID_DE_CARPETA_DRIVE_AQUI'; // ID de carpeta en Drive para guardar imágenes

// Nombre de las hojas (pestañas)
const SHEET_NAME = 'Consignaciones';
const ACCOUNTS_SHEET_NAME = 'Cuentas'; // Hoja para convenios y cuentas autorizadas

// ===========================================
// FUNCIÓN PRINCIPAL - Maneja solicitudes GET y POST
// ===========================================
function doGet(e) {
  try {
    const action = e.parameter.action || 'records';
    
    // Si solicita configuración de cuentas
    if (action === 'accounts') {
      const accounts = getAccounts();
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'success', data: accounts }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Si solicita registros (comportamiento por defecto)
    const limit = parseInt(e.parameter.limit) || 100;
    const estado = e.parameter.estado || null;
    const banco = e.parameter.banco || null;
    
    const data = getRecords(limit, estado, banco);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', data: data }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ 
        status: 'error', 
        message: error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    // Detectar el tipo de solicitud
    if (payload.action === 'saveAccounts') {
      // Guardar configuración de cuentas/convenios
      const result = saveAccounts(payload.accounts);
      return ContentService
        .createTextOutput(JSON.stringify({ 
          status: 'success', 
          message: `${result.saved} cuentas/convenios guardados correctamente`,
          saved: result.saved
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Por defecto: guardar registros de consignaciones
    if (!Array.isArray(payload)) {
      throw new Error('El payload debe ser un array de registros');
    }
    
    const result = saveRecords(payload);
    
    return ContentService
      .createTextOutput(JSON.stringify({ 
        status: 'success', 
        message: `${result.saved} registros guardados correctamente`,
        saved: result.saved,
        errors: result.errors
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ 
        status: 'error', 
        message: error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===========================================
// GUARDAR REGISTROS EN GOOGLE SHEETS
// ===========================================
function saveRecords(records) {
  const sheet = getOrCreateSheet();
  let saved = 0;
  const errors = [];
  
  // Asegurar que existe la fila de encabezados
  ensureHeaders(sheet);
  
  records.forEach((record, index) => {
    try {
      // Procesar imagen si existe
      let imageUrl = '';
      if (record.imageBase64 && record.imageBase64.length > 100) {
        imageUrl = saveImageToDrive(
          record.imageBase64, 
          record.numeroReferencia || `recibo_${Date.now()}_${index}`
        );
      }
      
      // Preparar fila de datos
      const row = [
        new Date(), // Timestamp
        record.estado || 'Aceptada',
        record.banco || '',
        record.tipoPago || '',
        record.valor || 0,
        record.fechaTransaccion || '',
        record.hora || '',
        record.numeroReferencia || '',
        record.cuentaDestino || '',
        record.titularCuentaDestino || 'Distribuidora La Paruma SAS',
        record.ciudad || '',
        record.motivoRechazo || '',
        imageUrl, // URL de la imagen en Drive
        record.cuentaOrigen || '',
        record.nombreConsignante || '',
        record.descripcion || '',
        record.numeroOperacion || '',
        record.convenio || '',
        record.sucursal || '',
        record.cajero || ''
      ];
      
      sheet.appendRow(row);
      saved++;
      
    } catch (err) {
      errors.push(`Registro ${index}: ${err.toString()}`);
    }
  });
  
  return { saved, errors };
}

// ===========================================
// GUARDAR IMAGEN EN GOOGLE DRIVE
// ===========================================
function saveImageToDrive(base64Data, fileName) {
  try {
    // Limpiar el base64 (quitar el prefijo data:image/...)
    let cleanBase64 = base64Data;
    if (base64Data.includes(',')) {
      cleanBase64 = base64Data.split(',')[1];
    }
    
    // Convertir base64 a blob
    const blob = Utilities.newBlob(
      Utilities.base64Decode(cleanBase64),
      'image/jpeg',
      `${fileName}_${Date.now()}.jpg`
    );
    
    // Obtener carpeta de Drive
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // Guardar archivo
    const file = folder.createFile(blob);
    
    // Hacer el archivo público (opcional - comenta estas líneas si quieres mantenerlo privado)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Retornar URL para ver la imagen
    return file.getUrl();
    
  } catch (error) {
    console.error('Error guardando imagen:', error);
    return `Error: ${error.toString()}`;
  }
}

// ===========================================
// OBTENER REGISTROS DE GOOGLE SHEETS
// ===========================================
function getRecords(limit = 100, estadoFilter = null, bancoFilter = null) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return []; // Solo headers o vacío
  }
  
  const headers = data[0];
  const rows = data.slice(1); // Sin headers
  
  // Encontrar índices de columnas
  const colIndexes = {
    timestamp: headers.indexOf('Timestamp'),
    estado: headers.indexOf('Estado'),
    banco: headers.indexOf('Banco'),
    tipoPago: headers.indexOf('Tipo Pago'),
    valor: headers.indexOf('Valor'),
    fechaTransaccion: headers.indexOf('Fecha Transacción'),
    hora: headers.indexOf('Hora'),
    numeroReferencia: headers.indexOf('Número Referencia'),
    cuentaDestino: headers.indexOf('Cuenta Destino'),
    titularCuentaDestino: headers.indexOf('Titular Cuenta Destino'),
    ciudad: headers.indexOf('Ciudad'),
    motivoRechazo: headers.indexOf('Motivo Rechazo'),
    urlImagen: headers.indexOf('URL Imagen'),
  };
  
  // Filtrar y mapear
  let records = rows
    .filter(row => {
      if (estadoFilter && row[colIndexes.estado] !== estadoFilter) return false;
      if (bancoFilter && row[colIndexes.banco] !== bancoFilter) return false;
      return true;
    })
    .map(row => ({
      'Timestamp': row[colIndexes.timestamp] || '',
      'Estado': row[colIndexes.estado] || '',
      'Banco': row[colIndexes.banco] || '',
      'Tipo Pago': row[colIndexes.tipoPago] || '',
      'Valor': row[colIndexes.valor] || 0,
      'Fecha Transacción': row[colIndexes.fechaTransaccion] || '',
      'Hora': row[colIndexes.hora] || '',
      'Número Referencia': row[colIndexes.numeroReferencia] || '',
      'Cuenta Destino': row[colIndexes.cuentaDestino] || '',
      'Titular Cuenta Destino': row[colIndexes.titularCuentaDestino] || '',
      'Ciudad': row[colIndexes.ciudad] || '',
      'Motivo Rechazo': row[colIndexes.motivoRechazo] || '',
      'URL Imagen': row[colIndexes.urlImagen] || '',
    }));
  
  // Ordenar por timestamp descendente (más reciente primero)
  records.reverse();
  
  // Limitar cantidad
  return records.slice(0, limit);
}

// ===========================================
// UTILIDADES
// ===========================================
function getOrCreateSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    ensureHeaders(sheet);
  }
  
  return sheet;
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const headers = [
      'Timestamp',
      'Estado',
      'Banco',
      'Tipo Pago',
      'Valor',
      'Fecha Transacción',
      'Hora',
      'Número Referencia',
      'Cuenta Destino',
      'Titular Cuenta Destino',
      'Ciudad',
      'Motivo Rechazo',
      'URL Imagen',
      'Cuenta Origen',
      'Nombre Consignante',
      'Descripción',
      'Número Operación',
      'Convenio',
      'Sucursal',
      'Cajero'
    ];
    sheet.appendRow(headers);
    
    // Formato de encabezados
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
  }
}

// ===========================================
// GESTIÓN DE CUENTAS Y CONVENIOS
// ===========================================
function getOrCreateAccountsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(ACCOUNTS_SHEET_NAME);
    ensureAccountsHeaders(sheet);
  }
  
  return sheet;
}

function ensureAccountsHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const headers = ['Tipo', 'Valor', 'Etiqueta', 'Activo', 'Fecha Creación'];
    sheet.appendRow(headers);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#34a853');
    headerRange.setFontColor('#ffffff');
  }
}

function getAccounts() {
  const sheet = getOrCreateAccountsSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { accounts: [], convenios: [] }; // Solo headers o vacío
  }
  
  const headers = data[0];
  const rows = data.slice(1);
  
  const accounts = [];
  const convenios = [];
  
  rows.forEach((row, index) => {
    const tipo = row[0];
    const valor = row[1];
    const etiqueta = row[2];
    const activo = row[3];
    
    if (activo === false || activo === 'FALSE' || activo === 'false') {
      return; // Skip inactive
    }
    
    const item = {
      id: `sheet-${tipo}-${index}`,
      value: String(valor),
      label: String(etiqueta || `${tipo} ${valor}`),
      type: tipo.toUpperCase()
    };
    
    if (tipo.toUpperCase() === 'ACCOUNT') {
      accounts.push(item);
    } else if (tipo.toUpperCase() === 'CONVENIO') {
      convenios.push(item);
    }
  });
  
  return { accounts, convenios };
}

function saveAccounts(accountsData) {
  const sheet = getOrCreateAccountsSheet();
  
  // Limpiar datos existentes (excepto headers)
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
  
  let saved = 0;
  
  // Guardar cuentas
  if (accountsData.accounts) {
    accountsData.accounts.forEach(account => {
      const row = [
        'ACCOUNT',
        account.value,
        account.label,
        true,
        new Date()
      ];
      sheet.appendRow(row);
      saved++;
    });
  }
  
  // Guardar convenios
  if (accountsData.convenios) {
    accountsData.convenios.forEach(convenio => {
      const row = [
        'CONVENIO',
        convenio.value,
        convenio.label,
        true,
        new Date()
      ];
      sheet.appendRow(row);
      saved++;
    });
  }
  
  return { saved };
}

