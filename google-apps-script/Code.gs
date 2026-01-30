// ===========================================
// SCRIPT DE GOOGLE APPS PARA VALIDACIÓN DE CONSIGNACIONES
// Integrado con funcionalidad de Cuentas e Imágenes en Drive
// ===========================================

// CONFIGURACIÓN - ACTUALIZA ESTOS IDs
const SPREADSHEET_ID = 'TU_ID_DE_GOOGLE_SHEET_AQUI'; // O usa getActiveSpreadsheet()
const DRIVE_FOLDER_ID = '1ktHeHJ8jdTCjIU3mcOIYzRtg5M-rSJhF'; // ID de tu carpeta Drive
const ENABLE_DRIVE_IMAGES = true; // ✅ ACTIVADO para guardar imágenes

// Nombres de hojas
const CONSIGNACIONES_SHEET = 'Hoja 1'; // Tu hoja actual de consignaciones
const ACCOUNTS_SHEET_NAME = 'Cuentas'; // Nueva hoja para convenios/cuentas
const TRAINING_SHEET_NAME = 'Entrenamientos'; // Nueva hoja para datos de entrenamiento

// ===========================================
// FUNCIÓN GET - Lee datos y configuración
// ===========================================
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Modo debug - ver todas las hojas
  if (e.parameter.debug === 'true') {
    const sheets = ss.getSheets();
    const debugInfo = {
      spreadsheetName: ss.getName(),
      sheets: sheets.map(sheet => ({
        name: sheet.getName(),
        rows: sheet.getLastRow(),
        cols: sheet.getLastColumn(),
        headers: sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : []
      }))
    };
    
    return ContentService.createTextOutput(JSON.stringify(debugInfo, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // NUEVO: Si solicita configuración de cuentas
  if (e.parameter.action === 'accounts') {
    try {
      const accounts = getAccounts();
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'success', data: accounts }))
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
  
  // NUEVO: Si solicita datos de entrenamiento
  if (e.parameter.action === 'training') {
    try {
      const trainingData = getTrainingData();
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'success', data: trainingData }))
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
  
  // Por defecto: obtener registros de consignaciones
  const sheet = ss.getSheetByName(CONSIGNACIONES_SHEET);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: `La hoja "${CONSIGNACIONES_SHEET}" no existe`
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow === 0 || lastRow === 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        data: [],
        message: 'No hay datos en la hoja',
        count: 0,
        total: 0
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Obtener encabezados y datos
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    
    // Convertir a array de objetos
    const records = data.map((row, index) => {
      const record = {};
      headers.forEach((header, colIndex) => {
        let value = row[colIndex];
        
        // Formatear fechas a string legible
        if (value instanceof Date) {
          value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
        }
        
        // Limpiar valores vacíos
        if (value === '') {
          value = null;
        }
        
        record[header] = value;
      });
      return record;
    });
    
    // Aplicar filtros (tu lógica original)
    const params = e.parameter;
    let filteredRecords = records;
    
    if (params.estado) {
      filteredRecords = filteredRecords.filter(r => 
        r.Estado && r.Estado.toLowerCase() === params.estado.toLowerCase()
      );
    }
    
    if (params.banco) {
      filteredRecords = filteredRecords.filter(r => 
        r.Banco && r.Banco.toLowerCase().includes(params.banco.toLowerCase())
      );
    }
    
    // ... (resto de filtros según tu código original)
    
    // Paginación
    const limit = params.limit ? parseInt(params.limit) : filteredRecords.length;
    const offset = params.offset ? parseInt(params.offset) : 0;
    const paginatedRecords = filteredRecords.slice(offset, offset + limit);
    
    // Respuesta
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      count: paginatedRecords.length,
      total: filteredRecords.length,
      totalRecords: records.length,
      offset: offset,
      limit: limit,
      data: paginatedRecords
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===========================================
// FUNCIÓN POST - Guarda consignaciones o configuración
// ===========================================
function doPost(e) {
  try {
    let payload;
    
    // Intentar parsear el JSON
    try {
      payload = JSON.parse(e.postData.contents);
      Logger.log('Payload recibido: ' + JSON.stringify(payload).substring(0, 500));
    } catch (parseError) {
      throw new Error('JSON inválido: ' + parseError.toString());
    }
    
    // IMPORTANTE: Verificar action PRIMERO (verificación estricta)
    if (payload && typeof payload === 'object' && payload.action === 'saveAccounts') {
      Logger.log('Detectado action=saveAccounts');
      
      if (!payload.accounts || typeof payload.accounts !== 'object') {
        throw new Error('Falta el campo accounts o no es un objeto');
      }
      
      Logger.log('Llamando saveAccounts con: ' + JSON.stringify(payload.accounts).substring(0, 200));
      
      const result = saveAccounts(payload.accounts);
      return ContentService
        .createTextOutput(JSON.stringify({ 
          status: 'success', 
          message: `${result.saved} cuentas/convenios guardados correctamente`,
          saved: result.saved
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // NUEVO: Guardar datos de entrenamiento
    if (payload && typeof payload === 'object' && payload.action === 'saveTraining') {
      Logger.log('Detectado action=saveTraining');
      
      if (!payload.trainingData || !Array.isArray(payload.trainingData)) {
        throw new Error('Falta el campo trainingData o no es un array');
      }
      
      Logger.log('Guardando ' + payload.trainingData.length + ' registros de entrenamiento...');
      
      const result = saveTrainingData(payload.trainingData);
      return ContentService
        .createTextOutput(JSON.stringify({ 
          status: 'success', 
          message: `${result.saved} registros de entrenamiento guardados correctamente`,
          saved: result.saved
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    Logger.log('No es saveAccounts, procesando como consignaciones');
    
    // Por defecto: guardar registros de consignaciones
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONSIGNACIONES_SHEET);
    
    if (!sheet) {
      throw new Error(`La hoja "${CONSIGNACIONES_SHEET}" no existe`);
    }
    
    // Si es la primera vez, crear encabezados
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp",
        "Estado",
        "Banco",
        "Tipo Pago",
        "Valor",
        "Fecha Transacción",
        "Hora",
        "Número Referencia",
        "Cuenta Destino",
        "Titular Cuenta Destino",
        "Ciudad",
        "Motivo Rechazo",
        "URL Imagen",  // NUEVO: columna para URL de Drive
        "RRN",  // Número único Redeban
        "RECIBO",  // Número de recibo
        "APRO",  // Código de aprobación
        "OPERACION",  // Número de operación (Banco Agrario, Bancolombia)
        "COMPROBANTE",  // Número de comprobante (Bancolombia App)
        "Hash Imagen",  // SHA-256 hash para detectar imágenes duplicadas
        "Cuenta Origen",
        "Nombre Consignante",
        "Descripción",
        "Número Operación",
        "Convenio",
        "Sucursal",
        "Cajero"
      ]);
    }
    
    // Procesar uno o varios registros
    const rows = Array.isArray(payload) ? payload : [payload];
    const addedRecords = [];
    
    rows.forEach((r, index) => {
      try {
        // Validar campos requeridos
        if (!r.banco) {
          throw new Error('El campo "banco" es obligatorio');
        }
        
        // NUEVO: Procesar imagen si existe (solo si está habilitado)
        let imageUrl = '';
        if (ENABLE_DRIVE_IMAGES && r.imageBase64 && r.imageBase64.length > 100) {
          try {
            imageUrl = saveImageToDrive(
              r.imageBase64, 
              r.numeroReferencia || `recibo_${Date.now()}_${index}`
            );
            Logger.log('Imagen guardada exitosamente: ' + imageUrl.substring(0, 50));
          } catch (imgError) {
            Logger.log('Error guardando imagen (Drive deshabilitado o sin permisos): ' + imgError.toString().substring(0, 100));
            imageUrl = ''; // Dejar vacío si falla
          }
        } else if (!ENABLE_DRIVE_IMAGES && r.imageBase64) {
          Logger.log('Guardado de imágenes deshabilitado. Activa ENABLE_DRIVE_IMAGES para habilitar.');
        }
        
        const now = new Date();
        const fechaProcesamiento = r.fechaProcesamiento || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
        
        const rowData = [
          fechaProcesamiento,
          r.estado || 'Pendiente',
          r.banco,
          r.tipoPago || '',
          r.valor || 0,
          r.fechaTransaccion || '',
          r.hora || '',
          r.numeroReferencia || '',
          r.cuentaDestino || '',
          r.titularCuentaDestino || '',
          r.ciudad || '',
          r.motivoRechazo || '',
          imageUrl,  // NUEVO: URL de la imagen
          r.rrn || '',  // Número único RRN (Redeban)
          r.recibo || '',  // Número de recibo
          r.apro || '',  // Código de aprobación
          r.operacion || '',  // Número de operación
          r.comprobante || '',  // Número de comprobante
          r.imageHash || '',  // Hash SHA-256 de la imagen
          r.cuentaOrigen || '',
          r.nombreConsignante || '',
          r.descripcion || '',
          r.numeroOperacion || '',
          r.convenio || '',
          r.sucursal || '',
          r.cajero || ''
        ];
        
        sheet.appendRow(rowData);
        
        addedRecords.push({
          fechaProcesamiento: fechaProcesamiento,
          estado: r.estado || 'Pendiente',
          banco: r.banco,
          urlImagen: imageUrl
        });
        
      } catch (rowError) {
        Logger.log(`Error procesando registro ${index}: ${rowError.toString()}`);
        throw rowError;
      }
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      count: rows.length,
      message: `${rows.length} registro(s) agregado(s) exitosamente`,
      data: addedRecords
    })).setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error en doPost: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Error del Script: ' + error.toString(),
      stack: error.stack || ''
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===========================================
// NUEVO: GUARDAR IMAGEN EN GOOGLE DRIVE
// ===========================================
function saveImageToDrive(base64Data, fileName) {
  try {
    Logger.log('Iniciando guardado de imagen: ' + fileName);
    
    // Validar que DRIVE_FOLDER_ID esté configurado
    if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID === '' || DRIVE_FOLDER_ID === 'TU_ID_DE_CARPETA_DRIVE_AQUI') {
      throw new Error('DRIVE_FOLDER_ID no está configurado');
    }
    
    Logger.log('DRIVE_FOLDER_ID válido: ' + DRIVE_FOLDER_ID);
    
    // Limpiar el base64 (quitar el prefijo data:image/...)
    let cleanBase64 = base64Data;
    if (base64Data.includes(',')) {
      cleanBase64 = base64Data.split(',')[1];
    }
    
    Logger.log('Base64 limpiado, tamaño: ' + cleanBase64.length);
    
    // Convertir base64 a blob
    const blob = Utilities.newBlob(
      Utilities.base64Decode(cleanBase64),
      'image/jpeg',
      `${fileName}_${Date.now()}.jpg`
    );
    
    Logger.log('Blob creado correctamente');
    
    // Obtener carpeta de Drive
    Logger.log('Intentando acceder a carpeta Drive: ' + DRIVE_FOLDER_ID);
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log('Carpeta encontrada: ' + folder.getName());
    
    // Guardar archivo
    Logger.log('Creando archivo en Drive...');
    const file = folder.createFile(blob);
    Logger.log('Archivo creado: ' + file.getName());
    
    // Hacer el archivo público
    Logger.log('Configurando permisos públicos...');
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Retornar URL
    const fileUrl = file.getUrl();
    Logger.log('URL generada exitosamente: ' + fileUrl);
    
    return fileUrl;
    
  } catch (error) {
    Logger.log('❌ ERROR en saveImageToDrive: ' + error.toString());
    Logger.log('Stack trace: ' + error.stack);
    throw error; // Re-lanzar para que se maneje arriba
  }
}

// ===========================================
// FUNCIÓN PARA REPARAR LA HOJA CUENTAS
// ===========================================
function repairAccountsSheet() {
  try {
    Logger.log('=== REPARANDO HOJA CUENTAS ===');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
    
    if (!sheet) {
      Logger.log('⚠️ Hoja Cuentas no existe. Creando...');
      sheet = ss.insertSheet(ACCOUNTS_SHEET_NAME);
    }
    
    // Limpiar toda la hoja
    Logger.log('🧹 Limpiando toda la hoja...');
    sheet.clear();
    
    // Crear headers correctos
    Logger.log('📋 Creando headers...');
    const headers = ['Tipo', 'Valor', 'Etiqueta', 'Activo', 'Fecha Creación'];
    sheet.appendRow(headers);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#34a853');
    headerRange.setFontColor('#ffffff');
    
    Logger.log('✅ Hoja reparada correctamente');
    Logger.log('✅ Headers: ' + headers.join(', '));
    Logger.log('=== REPARACIÓN COMPLETADA ===');
    
    return 'OK - Hoja Cuentas reparada. Ahora puedes guardar configuración desde la app.';
    
  } catch (error) {
    Logger.log('❌ ERROR reparando hoja: ' + error.toString());
    return 'ERROR: ' + error.toString();
  }
}

// ===========================================
// FUNCIÓN DE PRUEBA PARA VERIFICAR DRIVE
// ===========================================
function testDriveAccess() {
  try {
    Logger.log('=== INICIO TEST DRIVE ===');
    Logger.log('DRIVE_FOLDER_ID: ' + DRIVE_FOLDER_ID);
    Logger.log('ENABLE_DRIVE_IMAGES: ' + ENABLE_DRIVE_IMAGES);
    
    // Intentar acceder a la carpeta
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log('✅ Carpeta encontrada: ' + folder.getName());
    Logger.log('✅ URL de la carpeta: ' + folder.getUrl());
    
    // Crear archivo de prueba
    const testBlob = Utilities.newBlob('Test de permisos Drive', 'text/plain', 'test_' + Date.now() + '.txt');
    const testFile = folder.createFile(testBlob);
    Logger.log('✅ Archivo de prueba creado: ' + testFile.getName());
    Logger.log('✅ URL: ' + testFile.getUrl());
    
    // Configurar permisos
    testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('✅ Permisos públicos configurados');
    
    // Eliminar archivo de prueba
    testFile.setTrashed(true);
    Logger.log('✅ Archivo de prueba eliminado');
    
    Logger.log('=== TEST DRIVE EXITOSO ===');
    return 'OK - Drive funcionando correctamente';
    
  } catch (error) {
    Logger.log('❌ ERROR en test Drive: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return 'ERROR: ' + error.toString();
  }
}

// ===========================================
// NUEVO: GESTIÓN DE CUENTAS Y CONVENIOS
// ===========================================
function getOrCreateAccountsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    return { accounts: [], convenios: [] };
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
  try {
    Logger.log('saveAccounts llamado con: ' + JSON.stringify(accountsData));
    
    const sheet = getOrCreateAccountsSheet();
    
    // IMPORTANTE: Verificar si la fila 1 tiene headers válidos
    const lastRow = sheet.getLastRow();
    if (lastRow > 0) {
      const firstRow = sheet.getRange(1, 1, 1, 5).getValues()[0];
      const hasValidHeaders = firstRow[0] === 'Tipo' || firstRow[0] === 'TIPO';
      
      if (!hasValidHeaders) {
        // La fila 1 tiene datos, no headers - limpiar TODO
        Logger.log('⚠️ Fila 1 sin headers válidos. Limpiando toda la hoja...');
        sheet.clear();
        ensureAccountsHeaders(sheet);
      } else if (lastRow > 1) {
        // Tiene headers válidos, solo limpiar datos (fila 2+)
        Logger.log('✅ Headers válidos. Limpiando datos desde fila 2...');
        sheet.deleteRows(2, lastRow - 1);
      }
    }
    
    let saved = 0;
    
    // Guardar cuentas
    if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
      accountsData.accounts.forEach((account, index) => {
        try {
          const row = [
            'ACCOUNT',
            String(account.value || ''),
            String(account.label || `Cuenta ${index + 1}`),
            true,
            new Date()
          ];
          sheet.appendRow(row);
          saved++;
        } catch (err) {
          Logger.log('Error guardando cuenta ' + index + ': ' + err.toString());
        }
      });
    }
    
    // Guardar convenios
    if (accountsData.convenios && Array.isArray(accountsData.convenios)) {
      accountsData.convenios.forEach((convenio, index) => {
        try {
          const row = [
            'CONVENIO',
            String(convenio.value || ''),
            String(convenio.label || `Convenio ${index + 1}`),
            true,
            new Date()
          ];
          sheet.appendRow(row);
          saved++;
        } catch (err) {
          Logger.log('Error guardando convenio ' + index + ': ' + err.toString());
        }
      });
    }
    
    Logger.log('Total guardado: ' + saved);
    return { saved };
    
  } catch (error) {
    Logger.log('Error en saveAccounts: ' + error.toString());
    throw error;
  }
}

// ===========================================
// GESTIÓN DE DATOS DE ENTRENAMIENTO
// ===========================================
function getOrCreateTrainingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TRAINING_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(TRAINING_SHEET_NAME);
    ensureTrainingHeaders(sheet);
  }
  
  return sheet;
}

function ensureTrainingHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const headers = [
      'ID',
      'Timestamp',
      'Decisión',
      'Razón',
      'Tipo Recibo',
      'Entrenador',
      'Notas',
      // Datos correctos (ground truth)
      'Banco',
      'Ciudad',
      'Cuenta/Convenio',
      'Monto',
      'Fecha',
      'Hora',
      'RRN',
      'Recibo',
      'APRO',
      'Operación',
      'Comprobante',
      'Referencia Pago',
      'Código Cliente',
      'Tarjeta (últimos 4)',
      'Calidad Imagen',
      'Confianza IA',
      // Datos extraídos por IA (para comparación)
      'IA - Banco',
      'IA - Monto',
      'IA - Fecha',
      'IA - Operación',
      'IA - Confianza',
      // URL Imagen
      'URL Imagen',
      'Hash Imagen'
    ];
    sheet.appendRow(headers);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#ea4335');
    headerRange.setFontColor('#ffffff');
  }
}

function saveTrainingData(trainingRecords) {
  try {
    Logger.log('saveTrainingData llamado con ' + trainingRecords.length + ' registros');
    
    const sheet = getOrCreateTrainingSheet();
    ensureTrainingHeaders(sheet);
    
    let saved = 0;
    
    trainingRecords.forEach((record, index) => {
      try {
        // Validar que tenga los campos mínimos
        if (!record.id || !record.decision) {
          Logger.log('⚠️ Registro ' + index + ' sin ID o decisión. Saltando...');
          return;
        }
        
        // Procesar imagen si existe
        let imageUrl = '';
        if (ENABLE_DRIVE_IMAGES && record.imageBase64 && record.imageBase64.length > 100) {
          try {
            imageUrl = saveImageToDrive(
              record.imageBase64, 
              `training_${record.id}_${Date.now()}`
            );
            Logger.log('✅ Imagen de entrenamiento guardada: ' + imageUrl.substring(0, 50));
          } catch (imgError) {
            Logger.log('⚠️ Error guardando imagen de entrenamiento: ' + imgError.toString());
            imageUrl = '';
          }
        }
        
        const correctData = record.correctData || {};
        const aiData = record.aiExtractedData || {};
        
        const row = [
          record.id || '',
          new Date(record.trainedAt || Date.now()),
          record.decision || '',
          record.decisionReason || '',
          record.receiptType || '',
          record.trainedBy || '',
          record.notes || '',
          // Datos correctos
          correctData.bankName || 'No especificado',
          correctData.city || '',
          correctData.accountOrConvenio || '',
          correctData.amount || 0,
          correctData.date || '',
          correctData.time || '',
          correctData.rrn || '',
          correctData.recibo || '',
          correctData.apro || '',
          correctData.operacion || '',
          correctData.comprobante || '',
          correctData.paymentReference || '',
          correctData.clientCode || '',
          correctData.creditCardLast4 || '',
          correctData.imageQualityScore || 0,
          correctData.confidenceScore || 0,
          // Datos IA
          aiData.bankName || '',
          aiData.amount || 0,
          aiData.date || '',
          aiData.operacion || '',
          aiData.confidenceScore || 0,
          // Imagen
          imageUrl,
          record.imageHash || ''
        ];
        
        sheet.appendRow(row);
        saved++;
        
      } catch (rowError) {
        Logger.log('❌ Error procesando registro de entrenamiento ' + index + ': ' + rowError.toString());
      }
    });
    
    Logger.log('✅ Total registros de entrenamiento guardados: ' + saved);
    return { saved };
    
  } catch (error) {
    Logger.log('❌ Error en saveTrainingData: ' + error.toString());
    throw error;
  }
}

function getTrainingData() {
  try {
    const sheet = getOrCreateTrainingSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return [];
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    
    const trainingRecords = rows.map((row, index) => {
      return {
        id: row[0] || `training-${index}`,
        trainedAt: row[1] instanceof Date ? row[1].getTime() : Date.now(),
        decision: row[2] || '',
        decisionReason: row[3] || '',
        receiptType: row[4] || '',
        trainedBy: row[5] || '',
        notes: row[6] || '',
        correctData: {
          bankName: row[7] || '',
          city: row[8] || '',
          accountOrConvenio: row[9] || '',
          amount: row[10] || 0,
          date: row[11] || '',
          time: row[12] || '',
          rrn: row[13] || '',
          recibo: row[14] || '',
          apro: row[15] || '',
          operacion: row[16] || '',
          comprobante: row[17] || '',
          paymentReference: row[18] || '',
          clientCode: row[19] || '',
          creditCardLast4: row[20] || '',
          imageQualityScore: row[21] || 0,
          confidenceScore: row[22] || 0
        },
        aiExtractedData: {
          bankName: row[23] || '',
          amount: row[24] || 0,
          date: row[25] || '',
          operacion: row[26] || '',
          confidenceScore: row[27] || 0
        },
        imageUrl: row[28] || '',
        imageHash: row[29] || ''
      };
    });
    
    return trainingRecords;
    
  } catch (error) {
    Logger.log('❌ Error en getTrainingData: ' + error.toString());
    throw error;
  }
}
