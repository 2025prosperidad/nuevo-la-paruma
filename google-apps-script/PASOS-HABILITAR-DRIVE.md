# 🖼️ PASOS PARA HABILITAR GUARDADO DE IMÁGENES EN DRIVE

## ✅ CONFIGURACIÓN ACTUAL DETECTADA:
- ✅ `DRIVE_FOLDER_ID`: `1ktHeHJ8jdTCjIU3mcOIYzRtg5M-rSJhF`
- ✅ `ENABLE_DRIVE_IMAGES`: `true`

## ⚠️ PROBLEMA:
Las imágenes no se guardan porque **Google Apps Script necesita autorización** para acceder a Drive.

---

## 📋 SOLUCIÓN - SIGUE ESTOS PASOS:

### **PASO 1: Actualizar el código (con función de prueba)**

1. **Copia el nuevo `Code.gs`** completo del archivo en tu IDE
2. **Ve a tu Google Apps Script** (https://script.google.com)
3. **Selecciona TODO el código actual** y bórralo
4. **Pega el nuevo código** (con las funciones de prueba agregadas)
5. **Guarda** (Ctrl+S o icono disco 💾)

---

### **PASO 2: Ejecutar función de prueba y AUTORIZAR PERMISOS** ⚠️ CRÍTICO

1. **En Google Apps Script**, encuentra el selector de funciones (arriba, al lado del botón "Ejecutar"):

   ```
   [▼ Seleccionar función]
   ```

2. **Selecciona la función:** `testDriveAccess`

3. **Click en "Ejecutar"** (botón ▶️)

4. **TE PEDIRÁ AUTORIZACIÓN:**
   
   - Aparecerá: "Esta app no está verificada"
   - Click en **"Avanzado"** o **"Advanced"**
   - Click en **"Ir a [nombre del proyecto] (no seguro)"**
   - **IMPORTANTE:** Marca la casilla que dice:
     ```
     ☑️ Ver y administrar archivos de Google Drive
     ```
   - Click en **"Permitir"** o **"Allow"**

5. **Verifica los logs:**
   - Click en "Ejecución" (lado izquierdo) o "Ver" → "Registros"
   - Deberías ver:
     ```
     === INICIO TEST DRIVE ===
     ✅ Carpeta encontrada: [nombre de tu carpeta]
     ✅ Archivo de prueba creado
     ✅ Permisos públicos configurados
     === TEST DRIVE EXITOSO ===
     ```

---

### **PASO 3: Crear NUEVA implementación**

1. **Click en "Implementar"** (arriba derecha) → **"Administrar implementaciones"**

2. **Click en el lápiz ✏️** al lado de tu implementación activa

3. **En "Nueva descripción"**, escribe:
   ```
   v2.1 - Drive habilitado + permisos autorizados
   ```

4. **Click en "Implementar"**

5. **Verifica que la URL siga siendo la misma:**
   ```
   https://script.google.com/macros/s/AKfycbztmBbxC5Ljnh3eF1GjM0pcFVAE0ft7gBGDCwyEKarzuj-dAA9v1H0Y75myXk-hKWfU/exec
   ```

---

### **PASO 4: Probar en la aplicación**

1. **Espera 1-2 minutos** a que Netlify despliegue

2. **Recarga tu aplicación** (Ctrl + Shift + R)

3. **Sube una nueva imagen/recibo:**
   - Selecciona un archivo
   - Espera a que la IA lo procese
   - Verifica que se acepte

4. **Verifica en Google Sheets:**
   - Abre tu "Hoja 1"
   - La columna **"URL Imagen"** debería tener una URL como:
     ```
     https://drive.google.com/file/d/XXXXXXXXXXXXX/view
     ```

5. **Verifica en Google Drive:**
   - Ve a tu carpeta: https://drive.google.com/drive/folders/1ktHeHJ8jdTCjIU3mcOIYzRtg5M-rSJhF
   - Deberías ver archivos `.jpg` guardados con nombres como:
     ```
     M17087278_1734048960123.jpg
     61010_1734048961456.jpg
     ```

---

## 🔍 VERIFICACIÓN DE LOGS (OPCIONAL)

Si quieres ver qué está pasando cuando subes una imagen:

1. **En Google Apps Script**, ve a "Ejecuciones" (lado izquierdo)
2. **Sube una imagen** en tu aplicación
3. **Refresca las ejecuciones**
4. **Click en la última ejecución** de `doPost`
5. **Busca en los logs:**
   ```
   Iniciando guardado de imagen: M17087278
   DRIVE_FOLDER_ID válido: 1ktHeHJ8jdTCjIU3mcOIYzRtg5M-rSJhF
   Base64 limpiado, tamaño: 123456
   Blob creado correctamente
   Carpeta encontrada: Recibos Consignaciones
   Archivo creado: M17087278_1734048960123.jpg
   URL generada exitosamente: https://drive.google.com/...
   ```

---

## ❌ SOLUCIÓN DE PROBLEMAS

### **Error: "No tienes permiso para llamar a DriveApp.getFolderById"**
- **Causa:** No autorizaste los permisos en el PASO 2
- **Solución:** Ejecuta `testDriveAccess` de nuevo y autoriza

### **Error: "The requested entity was not found"**
- **Causa:** El `DRIVE_FOLDER_ID` es incorrecto o no tienes acceso a esa carpeta
- **Solución:** 
  1. Ve a: https://drive.google.com/drive/folders/1ktHeHJ8jdTCjIU3mcOIYzRtg5M-rSJhF
  2. Si no existe, crea una nueva carpeta
  3. Copia el ID correcto de la URL
  4. Actualiza `DRIVE_FOLDER_ID` en Code.gs

### **Las imágenes se guardan pero no se ven en el historial**
- **Causa:** El historial se cargó antes de subir las nuevas imágenes
- **Solución:** Click en "Actualizar Datos" para recargar el historial

### **URL Imagen sigue vacía**
- **Causa:** No creaste una nueva implementación después de autorizar
- **Solución:** Repite el PASO 3

---

## 🎯 CHECKLIST FINAL

- [ ] ✅ Código actualizado en Apps Script con `testDriveAccess()`
- [ ] ✅ Ejecutada función `testDriveAccess` y autorizados permisos de Drive
- [ ] ✅ Logs muestran "TEST DRIVE EXITOSO"
- [ ] ✅ Nueva implementación creada (v2.1)
- [ ] ✅ Aplicación recargada (Ctrl+Shift+R)
- [ ] ✅ Imagen de prueba subida
- [ ] ✅ Columna "URL Imagen" contiene URL de Drive
- [ ] ✅ Imagen visible en la carpeta de Drive
- [ ] ✅ Imagen se muestra en el historial al hacer click

---

## 📸 RESULTADO ESPERADO

**En Google Sheets (Hoja 1):**
```
URL Imagen: https://drive.google.com/file/d/1XxXxXxXxXxXxXxXxXxXx/view
```

**En Google Drive:**
```
📁 Recibos Consignaciones/
  📄 M17087278_1734048960123.jpg
  📄 61010_1734048961456.jpg
  📄 28217_1734048962789.jpg
  ...
```

**En la aplicación (Historial):**
- Click en la miniatura de la imagen → se abre modal grande
- Click en "Abrir en Drive" → se abre en Google Drive

---

**Última actualización:** 12/12/2025 21:00 (Versión 2.1 - Drive habilitado)

