# ⚠️ INSTRUCCIONES CRÍTICAS PARA ACTUALIZAR APPS SCRIPT

## El error "banco es obligatorio" aparece porque el Apps Script NO está actualizado

### 🔴 PASO 1: Verificar tu Apps Script actual

1. Abre tu Google Sheet
2. Ve a **Extensiones** → **Apps Script**
3. Verifica si tienes estas líneas al inicio del código:

```javascript
const ACCOUNTS_SHEET_NAME = 'Cuentas'; // Nueva hoja para convenios/cuentas
```

**Si NO tienes esa línea** → Tu script está desactualizado

---

### 🟢 PASO 2: Actualizar el código completo

1. **Abre el archivo** `google-apps-script/Code.gs` (del repositorio)
2. **Selecciona TODO el contenido** (Ctrl+A / Cmd+A)
3. **Copia el código completo**
4. **Ve a tu Google Apps Script**
5. **Selecciona TODO el código antiguo** (Ctrl+A / Cmd+A)
6. **Pega el código nuevo** (sobrescribir todo)

---

### 🔧 PASO 3: Configurar IDs

Actualiza solo estas líneas en el código pegado:

```javascript
// Línea 7 - Dejar como está (usa getActiveSpreadsheet)
const DRIVE_FOLDER_ID = 'TU_ID_DE_CARPETA_DRIVE_AQUI';

// Línea 11 - Verificar el nombre de tu hoja de consignaciones
const CONSIGNACIONES_SHEET = 'Hoja 1'; // Si tu hoja se llama diferente, cámbialo
```

**Para obtener el DRIVE_FOLDER_ID:**
1. Ve a Google Drive
2. Crea una carpeta (ejemplo: "Consignaciones Imágenes")
3. Abre la carpeta
4. Copia el ID de la URL: `https://drive.google.com/drive/folders/[ESTE_ES_EL_ID]`

---

### 🚀 PASO 4: DESPLEGAR NUEVA VERSIÓN (CRÍTICO)

**NO basta con guardar, debes DESPLEGAR:**

1. Click en **"Implementar"** (arriba derecha)
2. Click en **"Administrar implementaciones"**
3. En tu implementación actual, click en el ícono **✏️** (editar)
4. En "Nueva descripción", escribe: "Versión con soporte de Cuentas e Imágenes"
5. **IMPORTANTE:** Click en **"Versión"** → **"Nueva versión"**
6. Click en **"Implementar"**
7. Espera el mensaje de confirmación
8. **Copia la URL** (debería ser la misma que tenías)

---

### ✅ PASO 5: Verificar en Google Sheet

Después de actualizar el script:

1. Recarga tu Google Sheet
2. Deberías ver una **nueva hoja llamada "Cuentas"**
   - Si no aparece, ve a Apps Script y ejecuta manualmente la función `getOrCreateAccountsSheet()`
3. La hoja "Cuentas" debe tener estos encabezados:
   ```
   Tipo | Valor | Etiqueta | Activo | Fecha Creación
   ```

---

### 🧪 PASO 6: Probar en la aplicación

1. **Recarga tu aplicación** en Netlify (Ctrl + Shift + R)
2. **Abre la consola del navegador** (F12 → Console)
3. Click en **Configuración** (⚙️)
4. Click en **"Guardar en Sheets"**
5. **Observa la consola:**
   - Debe decir: "Enviando configuración a Sheets: ..."
   - Debe decir: "Respuesta del servidor: ..."
   
6. **Si funciona:** Verás el mensaje "X cuentas/convenios guardados correctamente"
7. **Verifica en Google Sheets:** La hoja "Cuentas" debe tener datos

---

### 🐛 SOLUCIÓN DE PROBLEMAS

#### Error persiste después de actualizar:
1. **Verifica que desplegaste NUEVA VERSIÓN** (no solo guardar)
2. **Borra el caché de la app:** Ctrl+Shift+R en el navegador
3. **Revisa los logs del Apps Script:**
   - En Apps Script: Menú **"Ejecuciones"** → Ver últimos logs
   - Busca: "Payload recibido:", "Detectado action=saveAccounts"

#### La hoja "Cuentas" no se crea:
1. Ve a Apps Script
2. Selecciona la función `getOrCreateAccountsSheet` en el dropdown
3. Click en **"Ejecutar"**
4. Autoriza si pide permisos
5. Recarga tu Sheet

#### Sigue sin funcionar:
- Comparte los logs de la consola del navegador (F12)
- Comparte los logs de Apps Script (Menú Ejecuciones)
- Verifica que la URL del script termine en `/exec` (no `/dev`)

---

### 📸 Cómo debe verse:

**En la consola del navegador al guardar:**
```
Enviando configuración a Sheets: {action: "saveAccounts", accounts: {...}}
Total cuentas: 7
Total convenios: 8
Respuesta del servidor: {"status":"success","message":"15 cuentas/convenios..."}
```

**En Google Sheets:**
- Hoja "Hoja 1": Consignaciones (como antes)
- Hoja "Cuentas": Nueva, con tus convenios y cuentas

