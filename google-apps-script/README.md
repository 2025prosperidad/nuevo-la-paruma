# Google Apps Script - Instrucciones de Implementación

Este script permite guardar las imágenes de los recibos en Google Drive y las URLs en Google Sheets.

## Paso 1: Crear una carpeta en Google Drive

1. Ve a [Google Drive](https://drive.google.com)
2. Crea una carpeta llamada "Consignaciones La Paruma" (o el nombre que prefieras)
3. Abre la carpeta y copia el ID de la URL:
   - Ejemplo: `https://drive.google.com/drive/folders/1ABC123xyz456`
   - El ID es: `1ABC123xyz456`

## Paso 2: Obtener el ID de tu Google Sheet

1. Abre tu Google Sheet de consignaciones
2. Copia el ID de la URL:
   - Ejemplo: `https://docs.google.com/spreadsheets/d/1XYZ789abc123/edit`
   - El ID es: `1XYZ789abc123`

## Paso 3: Crear el Apps Script

1. Abre tu Google Sheet
2. Ve a **Extensiones** → **Apps Script**
3. Elimina el código predeterminado
4. Copia y pega el contenido del archivo `Code.gs`
5. **IMPORTANTE**: Actualiza estas líneas con tus IDs:
   ```javascript
   const SPREADSHEET_ID = 'TU_ID_AQUI'; // ID del Paso 2
   const DRIVE_FOLDER_ID = 'TU_ID_AQUI'; // ID del Paso 1
   ```
6. Guarda el proyecto con un nombre como "Consignaciones API"

## Paso 4: Desplegar como Web App

1. En Apps Script, haz clic en **Implementar** → **Nueva implementación**
2. Selecciona el tipo: **Aplicación web**
3. Configura:
   - **Descripción**: "API para consignaciones"
   - **Ejecutar como**: **Yo** (tu cuenta)
   - **Quién tiene acceso**: **Cualquier persona**
4. Haz clic en **Implementar**
5. **Autoriza la aplicación** (puede pedir permisos)
6. **Copia la URL** que te aparece (ejemplo: `https://script.google.com/macros/s/ABC123.../exec`)

## Paso 5: Configurar en la aplicación

1. En la aplicación web (localhost o Netlify)
2. Abre el modal de configuración (icono de engranaje)
3. Pega la URL del Apps Script en el campo "URL del Script"
4. Guarda

## Verificación

Para verificar que funciona:

1. Sube una imagen en la aplicación
2. Si es válida, sincronízala con el botón "Google Sheets"
3. Abre tu Google Sheet y verifica:
   - Debe aparecer una nueva fila con los datos
   - En la columna "URL Imagen" debe haber un enlace
   - Al hacer clic en el enlace, debe abrirse la imagen en Drive
4. En tu carpeta de Drive debe aparecer la imagen guardada

## Permisos necesarios

El script requiere estos permisos:
- **Google Sheets**: Leer y escribir
- **Google Drive**: Crear archivos
- **Acceso externo**: Para recibir peticiones desde tu aplicación

## Solución de problemas

### Error: "No autorizado"
- Verifica que hayas autorizado el script en el paso 4
- Asegúrate de que "Quién tiene acceso" esté en "Cualquier persona"

### Las imágenes no se guardan
- Verifica que el `DRIVE_FOLDER_ID` sea correcto
- Asegúrate de tener espacio en Drive
- Revisa los logs en Apps Script: **Ejecución** → **Registros**

### Error CORS
- Asegúrate de usar `ContentService.createTextOutput()` en el script
- Verifica que la URL termine en `/exec` (no `/dev`)

## Mantenimiento

- Las imágenes se guardan con timestamp para evitar duplicados
- Puedes cambiar los permisos de las imágenes en Drive
- Para hacer privadas las imágenes, comenta las líneas:
  ```javascript
  // file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  ```

