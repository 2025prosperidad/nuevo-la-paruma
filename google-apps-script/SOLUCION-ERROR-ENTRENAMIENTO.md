# 🔧 Solución Error "Problema con bank name" en Entrenamientos

## ❌ Problema

Cuando intentabas sincronizar entrenamientos con Google Sheets, aparecía un error relacionado con "bank name" y los registros no se guardaban.

## 🔍 Causa del Problema

El script de Google Apps Script tenía dos problemas:

1. **Faltaba soporte para entrenamientos**: El script solo manejaba consignaciones normales y configuración de cuentas, pero no tenía código para guardar datos de entrenamiento.

2. **Validación estricta**: El script requería que el campo `banco` fuera obligatorio, pero algunos entrenamientos podían tener este campo vacío.

## ✅ Solución Implementada

He actualizado el código en dos lugares:

### 1. Frontend (services/sheetsService.ts)

Ahora el frontend siempre envía un valor válido para `bankName`:

```typescript
bankName: record.correctData.bankName || 'No especificado',
```

Si el usuario no especificó un banco durante el entrenamiento, se envía "No especificado" en lugar de una cadena vacía.

### 2. Script de Google Apps (Code.gs)

He agregado soporte completo para entrenamientos:

- ✅ Nueva constante `TRAINING_SHEET_NAME = 'Entrenamientos'`
- ✅ Manejo de acción `saveTraining` en función `doPost()`
- ✅ Manejo de acción `training` en función `doGet()` para leer entrenamientos
- ✅ Función `getOrCreateTrainingSheet()` para crear la hoja automáticamente
- ✅ Función `ensureTrainingHeaders()` con todos los campos necesarios
- ✅ Función `saveTrainingData()` para guardar registros de entrenamiento
- ✅ Función `getTrainingData()` para leer registros de entrenamiento
- ✅ Soporte para guardar imágenes de entrenamiento en Drive

## 📋 Pasos para Actualizar el Script

### Paso 1: Abrir el Editor de Scripts

1. Abre tu Google Sheet de consignaciones
2. Ve a **Extensiones** → **Apps Script**
3. Verás el archivo `Code.gs` en el editor

### Paso 2: Reemplazar el Código

1. **IMPORTANTE**: Antes de hacer cambios, copia el contenido actual de `Code.gs` a un documento de respaldo por si acaso.

2. Abre el archivo actualizado:
   - En el proyecto, ve a `google-apps-script/Code.gs`
   - Copia TODO el contenido del archivo

3. En el editor de Apps Script:
   - Selecciona TODO el contenido actual
   - Elimínalo
   - Pega el nuevo código

4. **IMPORTANTE**: Actualiza las constantes en la parte superior:
   ```javascript
   const SPREADSHEET_ID = 'TU_ID_DE_GOOGLE_SHEET_AQUI';
   const DRIVE_FOLDER_ID = '1ktHeHJ8jdTCjIU3mcOIYzRtg5M-rSJhF'; // Tu ID actual
   const ENABLE_DRIVE_IMAGES = true;
   ```

### Paso 3: Guardar y Desplegar

1. Haz clic en el ícono de **💾 Guardar** (o Ctrl+S / Cmd+S)
2. Haz clic en **Implementar** → **Administrar implementaciones**
3. Haz clic en el ícono de **✏️ Editar** en la implementación activa
4. En **Versión**, selecciona **Nueva versión**
5. Haz clic en **Implementar**
6. Copia la nueva URL del script si cambió (aunque debería ser la misma)

### Paso 4: Verificar la Hoja "Entrenamientos"

Después de actualizar el script y hacer el primer guardado de entrenamientos:

1. Verás una nueva hoja llamada **"Entrenamientos"** en tu Google Sheet
2. Tendrá columnas como:
   - ID, Timestamp, Decisión, Razón, Tipo Recibo, Entrenador
   - Banco, Ciudad, Cuenta/Convenio, Monto, Fecha, Hora
   - RRN, Recibo, APRO, Operación, Comprobante
   - Datos de IA para comparación
   - URL Imagen, Hash Imagen

## 🧪 Probar la Solución

1. En la aplicación web, ve a la pestaña **🎓 ENTRENAMIENTO**
2. Sube una imagen de recibo
3. Completa el entrenamiento (asegúrate de llenar el campo "Banco")
4. Guarda el entrenamiento
5. Haz clic en **"📥 Sincronizar con Sheets"**
6. Deberías ver el mensaje: **"X registros de entrenamiento guardados correctamente"**
7. Verifica en Google Sheets que los datos aparezcan en la hoja "Entrenamientos"

## ⚠️ Nota Importante sobre el Campo "Banco"

Aunque ahora el sistema permite entrenamientos sin banco especificado (usando "No especificado" como valor predeterminado), es **muy recomendable** que siempre llenes el campo "Banco" durante el entrenamiento para obtener mejores resultados de la IA.

## 🆘 Si Algo Sale Mal

Si después de actualizar el script sigues teniendo problemas:

1. **Verifica los logs**:
   - En el Editor de Apps Script, ve a **Ejecuciones** (en el menú izquierdo)
   - Verás un registro de todas las ejecuciones recientes
   - Haz clic en cualquier ejecución fallida para ver los detalles del error

2. **Verifica los permisos de Drive**:
   - Ejecuta la función `testDriveAccess()` desde el editor:
     - Selecciona la función en el menú desplegable superior
     - Haz clic en **▶️ Ejecutar**
     - Verifica los logs

3. **Repara la hoja de Entrenamientos**:
   - Si la hoja "Entrenamientos" tiene problemas:
     - Simplemente elimínala manualmente
     - El script la recreará automáticamente en el próximo guardado

## 📚 Cambios Técnicos Detallados

### Nuevas Funciones Agregadas

1. **`getOrCreateTrainingSheet()`**: Crea la hoja "Entrenamientos" si no existe
2. **`ensureTrainingHeaders()`**: Asegura que la hoja tenga los encabezados correctos
3. **`saveTrainingData(trainingRecords)`**: Guarda array de registros de entrenamiento
4. **`getTrainingData()`**: Lee todos los registros de entrenamiento de la hoja

### Manejo en doPost()

```javascript
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
```

### Manejo en doGet()

```javascript
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
```

## ✨ Mejoras Incluidas

- ✅ Validación robusta de campos obligatorios
- ✅ Logs detallados para debugging
- ✅ Manejo de errores mejorado
- ✅ Soporte para imágenes de entrenamiento en Drive
- ✅ Valores predeterminados para campos opcionales
- ✅ Comparación entre datos de IA vs datos corregidos
- ✅ Hash de imágenes para detectar duplicados

---

**¡Problema resuelto! 🎉** Ahora podrás sincronizar tus entrenamientos sin problemas.
