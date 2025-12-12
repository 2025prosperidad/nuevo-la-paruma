// ===========================================
// SCRIPT DE GOOGLE APPS PARA VALIDACIÓN DE CONSIGNACIONES
// Integrado con funcionalidad de Cuentas e Imágenes en Drive
// ===========================================

// CONFIGURACIÓN - ACTUALIZA ESTOS IDs
const SPREADSHEET_ID = 'TU_ID_DE_GOOGLE_SHEET_AQUI'; // O usa getActiveSpreadsheet()
const DRIVE_FOLDER_ID = 'TU_ID_DE_CARPETA_DRIVE_AQUI'; // ID de carpeta en Drive para guardar imágenes

// Nombres de hojas
const CONSIGNACIONES_SHEET = 'Hoja 1'; // Tu hoja actual de consignaciones
const ACCOUNTS_SHEET_NAME = 'Cuentas'; // Nueva hoja para convenios/cuentas

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
        
        // NUEVO: Procesar imagen si existe
        let imageUrl = '';
        if (r.imageBase64 && r.imageBase64.length > 100) {
          try {
            imageUrl = saveImageToDrive(
              r.imageBase64, 
              r.numeroReferencia || `recibo_${Date.now()}_${index}`
            );
          } catch (imgError) {
            Logger.log('Error guardando imagen: ' + imgError.toString());
            imageUrl = 'Error al guardar imagen';
          }
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
    
    // Hacer el archivo público (opcional)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Retornar URL
    return file.getUrl();
    
  } catch (error) {
    Logger.log('Error guardando imagen: ' + error.toString());
    return `Error: ${error.toString()}`;
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
    
    // Limpiar datos existentes (excepto headers)
    if (sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
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

