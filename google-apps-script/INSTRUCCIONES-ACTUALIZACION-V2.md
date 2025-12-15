# 🔧 INSTRUCCIONES PARA ACTUALIZAR GOOGLE APPS SCRIPT

## ✅ CAMBIOS REALIZADOS (12/Dic/2025)

### **Problema Corregido:**
- ❌ Error: `V.includes is not a function` al cargar historial desde Sheets
- ❌ Error: Permisos de Google Drive bloqueando guardado de consignaciones
- ❌ Columna "URL Imagen" mostraba mensajes de error largos

### **Solución Implementada:**
- ✅ Validación de tipos en lectura de datos del Sheet
- ✅ Guardado de imágenes en Drive ahora es **OPCIONAL** (deshabilitado por defecto)
- ✅ Las consignaciones se guardan correctamente aunque Drive esté deshabilitado
- ✅ Nuevas columnas para números únicos: RRN, RECIBO, APRO, OPERACION, COMPROBANTE, Hash Imagen

---

## 📋 PASOS PARA ACTUALIZAR

### **PASO 1: Copiar el nuevo código**

1. Ve a la carpeta `google-apps-script/`
2. Abre el archivo `Code.gs`
3. **Copia TODO el contenido** (desde línea 1 hasta el final)

---

### **PASO 2: Actualizar en Google Apps Script**

1. **Abre tu Google Apps Script:**
   - Ve a: https://script.google.com
   - Encuentra tu proyecto: "Validación Consignaciones"

2. **Reemplaza el código:**
   - Selecciona TODO el código actual
   - Bórralo
   - Pega el nuevo código

3. **IMPORTANTE - Configura estas variables (líneas 6-8):**

```javascript
const DRIVE_FOLDER_ID = ''; // Dejar VACÍO por ahora
const ENABLE_DRIVE_IMAGES = false; // Dejar en FALSE por ahora
```

4. **Guarda:**
   - Click en el icono de **disco** 💾 o `Ctrl+S`

---

### **PASO 3: Crear NUEVA implementación**

⚠️ **MUY IMPORTANTE: No basta con guardar, debes crear una NUEVA versión:**

1. Click en **"Implementar"** (arriba a la derecha) → **"Administrar implementaciones"**

2. Click en el **ícono de lápiz ✏️** al lado de tu implementación actual

3. En "Nueva descripción", escribe:
   ```
   v2.0 - Corregido error V.includes + Drive opcional + nuevas columnas
   ```

4. Click en **"Implementar"**

5. **COPIA la URL** que aparece (debería ser la misma que ya tienes)

---

### **PASO 4: Verificar en la aplicación**

1. **Espera 1-2 minutos** a que Netlify despliegue

2. **Recarga la aplicación** (Ctrl + Shift + R)

3. **Click en "Actualizar Datos"** en la pestaña "Historial Base de Datos"

4. **DEBERÍAS VER:**
   - ✅ "Cuentas y convenios cargados desde Google Sheets: 6 cuentas, 10 convenios"
   - ✅ Los 13 registros que guardaste antes
   - ✅ **SIN errores** "V.includes is not a function"
   - ✅ Columna "URL Imagen" vacía (normal, Drive deshabilitado)

---

## 🖼️ (OPCIONAL) HABILITAR GUARDADO DE IMÁGENES EN DRIVE

### **Solo si quieres guardar imágenes en Google Drive:**

1. **Crea una carpeta en Google Drive:**
   - Ve a: https://drive.google.com
   - Crea carpeta: "Recibos Consignaciones"
   - Abre la carpeta y copia el ID de la URL:
     ```
     https://drive.google.com/drive/folders/1ABcDEfGhIJkLmNoPqRsTuVwXyZ123456
                                            ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                                            Este es el DRIVE_FOLDER_ID
     ```

2. **Actualiza el Code.gs (líneas 7-8):**
   ```javascript
   const DRIVE_FOLDER_ID = '1ABcDEfGhIJkLmNoPqRsTuVwXyZ123456'; // Tu ID aquí
   const ENABLE_DRIVE_IMAGES = true; // Cambiar a TRUE
   ```

3. **Guarda y crea NUEVA implementación** (repetir PASO 3)

4. **Re-autoriza permisos:**
   - Click en "Ejecutar" → selecciona `doPost`
   - Te pedirá autorizar acceso a Drive
   - Acepta los permisos

5. **¡Listo!** Ahora las imágenes se guardarán en Drive y aparecerán como URLs en la columna "URL Imagen"

---

## 🎯 VERIFICACIÓN FINAL

### **Checklist:**

- [ ] ✅ Código actualizado en Apps Script
- [ ] ✅ Nueva implementación creada (v2.0)
- [ ] ✅ Aplicación recargada (Ctrl+Shift+R)
- [ ] ✅ "Actualizar Datos" funciona sin errores
- [ ] ✅ Se cargan los 13 registros correctamente
- [ ] ✅ Consola sin errores "V.includes is not a function"
- [ ] ✅ Hoja "Cuentas" con 6 accounts + 10 convenios

### **Columnas actuales en "Hoja 1":**

```
Fecha Procesamiento | Estado | Banco | Tipo Pago | Valor | Fecha Transacción | 
Hora | Número Referencia | Cuenta Destino | Titular Cuenta Destino | Ciudad | 
Motivo Rechazo | URL Imagen | RRN | RECIBO | APRO | OPERACION | COMPROBANTE | 
Hash Imagen | Cuenta Origen | Nombre Consignante | Descripción | Número Operación | 
Convenio | Sucursal | Cajero
```

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### **Error: "V.includes is not a function"**
- **Causa:** Apps Script no actualizado o implementación antigua activa
- **Solución:** Repetir PASO 3 (crear NUEVA implementación)

### **Error: "No tienes permiso para llamar a DriveApp"**
- **Causa:** Intentando guardar imágenes sin configurar Drive
- **Solución:** Ya corregido, Drive está deshabilitado por defecto

### **No se cargan los datos del historial**
- **Causa:** URL del Script incorrecta
- **Solución:** Verifica que `constants.ts` tenga la URL correcta:
  ```
  https://script.google.com/macros/s/AKfycbztmBbxC5Ljnh3eF1GjM0pcFVAE0ft7gBGDCwyEKarzuj-dAA9v1H0Y75myXk-hKWfU/exec
  ```

---

## 📞 SIGUIENTE PASO

Una vez actualizado el Apps Script, **prueba subir nuevos recibos** para verificar que:

1. ✅ Se validan correctamente (sin duplicados)
2. ✅ Se guardan en la "Hoja 1"
3. ✅ Aparecen en el historial al hacer "Actualizar Datos"
4. ✅ Los convenios nuevos (04184, 32137) funcionan

---

**Última actualización:** 12/12/2025 20:35 (Versión 2.0)

