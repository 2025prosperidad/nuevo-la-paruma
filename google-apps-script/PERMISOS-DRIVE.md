# 🔐 Autorizar Permisos de Google Drive

## ⚠️ Error Actual

Si ves este error en tu hoja de Google Sheets:
```
Error: Exception: No tienes permiso para llamar a DriveApp.getFolderById
```

**Significa que no has autorizado los permisos de Google Drive.**

---

## ✅ Solución: Autorizar Permisos (5 pasos)

### **1. Abre el Editor de Apps Script**
- Ve a tu Google Sheet
- Click en **Extensiones** → **Apps Script**

### **2. Ejecutar Función de Prueba**
- En el editor, busca la función `doPost` o cualquier función
- Click en el botón ▶️ **Ejecutar**

### **3. Aparecerá una Ventana Emergente**
Verás:
```
Autorización necesaria
Este proyecto necesita autorización para acceder a tus datos
```

- Click en **Revisar permisos**

### **4. Selecciona tu Cuenta de Google**
- Elige la cuenta asociada al Google Sheet

### **5. Autorizar Acceso Avanzado**
Google mostrará: **"Google no ha verificado esta aplicación"**

- ✅ Click en **"Configuración avanzada"** (abajo a la izquierda)
- ✅ Click en **"Ir a [nombre del proyecto] (no seguro)"**
- ✅ Click en **"Permitir"**

---

## 🔍 ¿Qué Permisos se Solicitan?

El script necesita:
1. ✅ **Google Drive (lectura/escritura)**
   - Para guardar las imágenes de recibos en una carpeta de Drive
   
2. ✅ **Google Sheets (lectura/escritura)**
   - Para leer y guardar los registros de consignaciones

3. ✅ **Ejecutar como aplicación web**
   - Para que tu app de Netlify pueda comunicarse con el script

---

## 📝 Verificar que Funcionó

Después de autorizar:

1. **Vuelve a tu app** en Netlify
2. **Sube un recibo de prueba**
3. **Revisa tu Google Sheet**
4. En la columna **"URL Imagen"** deberías ver:
   ```
   https://drive.google.com/file/d/XXXXXX/view
   ```
   ✅ En lugar del error de permisos

---

## 🚨 Problema: "La carpeta no existe"

Si después de autorizar ves:
```
Error: La carpeta FOLDER_ID no existe o no tienes permisos
```

**Solución:**

1. Abre tu **código de Apps Script**
2. Busca esta línea (aproximadamente línea 14):
```javascript
const DRIVE_FOLDER_ID = 'TU_FOLDER_ID_AQUI';
```

3. Reemplaza `TU_FOLDER_ID_AQUI` con:
   - **Crea una carpeta en Google Drive** para guardar los recibos
   - Abre la carpeta
   - Copia el ID de la URL:
     ```
     https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j
                                              ^^^^^^^^^^^^^^^^
                                              Esto es el ID
     ```
   
4. **Guarda** el script y **despliega nuevamente**

---

## ✅ Listo!

Una vez autorizados los permisos:
- Las imágenes se guardarán en Drive automáticamente
- La columna "URL Imagen" mostrará enlaces funcionales
- Podrás ver las imágenes desde el historial en la app

---

**¿Problemas?** Verifica:
- ✅ Permisos autorizados correctamente
- ✅ FOLDER_ID configurado en el script
- ✅ Deployment actualizado (nueva versión desplegada)

