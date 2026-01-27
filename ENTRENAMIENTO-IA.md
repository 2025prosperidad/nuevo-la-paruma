# 🎓 Sistema de Entrenamiento de IA

## Descripción

El sistema de entrenamiento te permite mejorar la precisión de la inteligencia artificial que lee los recibos bancarios. Cada vez que entrenas la IA con un recibo, el sistema aprende qué datos son correctos y qué recibos deben ser aceptados o rechazados.

## ¿Por qué es importante entrenar la IA?

La IA puede cometer errores al leer recibos porque:
- **Recibos borrosos o mal impresos**: Los números pueden confundirse (3 vs 8, 0 vs O)
- **Diferentes formatos bancarios**: Cada banco tiene su propio formato
- **Casos especiales**: Recibos con información parcial o poco común

Tu feedback humano ayuda a la IA a:
- ✅ Identificar recibos válidos con mayor precisión
- ⛔ Rechazar automáticamente recibos borrosos o fraudulentos
- 🎯 Extraer datos correctamente según el tipo de recibo
- 📊 Aprender patrones de cada banco

---

## 📋 Flujo de Trabajo de Entrenamiento

### Paso 1: Subir y Analizar Recibos

1. Ve a la pestaña **"Validación en Curso (Nuevos)"**
2. Arrastra o selecciona imágenes de recibos
3. Espera a que la IA analice cada recibo
4. Revisa los resultados en la tabla

### Paso 2: Entrenar la IA

En cada fila de la tabla, verás un botón **🎓 Entrenar IA**:

1. **Haz clic en "🎓 Entrenar IA"** para abrir el modal de entrenamiento
2. **Revisa la imagen del recibo** en el panel izquierdo
3. **Decide si aceptar o rechazar:**
   - ✅ **ACEPTAR**: El recibo es válido y los datos son correctos
   - ⛔ **RECHAZAR - Borroso**: La imagen no es legible
   - ⛔ **RECHAZAR - Datos Incorrectos**: Los datos extraídos están mal
   - ⛔ **RECHAZAR - Duplicado**: Ya existe en el sistema
   - ⛔ **RECHAZAR - Fraude**: Sospecha de manipulación

### Paso 3: Corregir Datos (si es necesario)

Si el recibo es válido pero la IA cometió errores:

1. **Revisa todos los campos extraídos** (banco, monto, fecha, números únicos, etc.)
2. **Corrige los errores** directamente en los campos
3. **Verifica especialmente:**
   - Números únicos (RRN, RECIBO, APRO, OPERACION)
   - Monto (sin puntos ni comas, solo números)
   - Fecha (formato YYYY-MM-DD)
   - Cuenta/Convenio destino

### Paso 4: Documentar tu Decisión

1. **Selecciona el tipo de recibo**: Redeban, Bancolombia App, Nequi, etc.
2. **Escribe la razón de tu decisión**: Por ejemplo:
   - "Recibo Redeban claro con todos los números visibles"
   - "Imagen muy borrosa, no se pueden leer los números"
   - "Número de operación duplicado"
3. **Ingresa tu nombre**: Para rastrear quién entrenó cada recibo
4. **(Opcional) Agrega notas adicionales**

### Paso 5: Guardar

1. Haz clic en **💾 Guardar Entrenamiento**
2. El registro se guarda localmente en tu navegador
3. Ve a la pestaña **🎓 Entrenamiento IA** para ver todos los registros

### Paso 6: Sincronizar con Google Sheets

1. Ve a la pestaña **🎓 Entrenamiento IA**
2. Haz clic en **📤 Sincronizar con Sheets**
3. Los datos se guardan en Google Sheets para respaldo y análisis

---

## 🔧 Configuración de Tipos de Recibo

### ¿Qué es?

Puedes configurar qué tipos de recibo acepta el sistema automáticamente y los requisitos de calidad para cada tipo.

### Cómo Configurar

1. Haz clic en **⚙️ Configuración** en el header
2. Haz clic en **⚙️ Tipos de Recibo** en la parte inferior
3. Para cada tipo de recibo, configura:
   - ✅ **Aceptado/Rechazado**: Marca si ese tipo se acepta
   - **Calidad Mínima**: Establece el puntaje mínimo (0-100)
     - 50-65: Bajo (acepta mayoría)
     - 65-75: Normal (balance)
     - 75-100: Alto (solo recibos muy claros)
   - **Requiere recibo físico**: Si necesita RRN/RECIBO/APRO
   - **Notas**: Observaciones sobre ese tipo

### Ejemplos de Configuración

#### Configuración Estricta (Máxima Seguridad)
```
📜 Redeban (Térmico)
  ✅ Aceptado
  Calidad Mínima: 75
  ✅ Requiere recibo físico
  
📱 Bancolombia App
  ✅ Aceptado
  Calidad Mínima: 70
  ❌ No requiere recibo físico
  
❓ Otro Tipo
  ❌ Rechazado automáticamente
```

#### Configuración Flexible (Más Permisiva)
```
📜 Redeban (Térmico)
  ✅ Aceptado
  Calidad Mínima: 60
  ✅ Requiere recibo físico
  
📱 Bancolombia App
  ✅ Aceptado
  Calidad Mínima: 55
  ❌ No requiere recibo físico
  
❓ Otro Tipo
  ✅ Aceptado (revisión manual)
  Calidad Mínima: 70
```

---

## 📊 Consejos para un Buen Entrenamiento

### ✅ Mejores Prácticas

1. **Variedad de Casos**
   - Incluye recibos claros Y borrosos
   - Diferentes bancos y tipos
   - Montos variados (pequeños y grandes)

2. **Consistencia**
   - Usa siempre el mismo criterio
   - Si algo es dudoso, márcalo como rechazado
   - Es mejor rechazar un recibo bueno que aprobar uno malo

3. **Documentación Clara**
   - Explica claramente por qué aceptas o rechazas
   - Menciona detalles específicos (ej: "RRN borroso en posición inferior")
   - Esto ayuda a entender patrones

4. **Enfócate en Números Únicos**
   - Los números de transacción son CRÍTICOS
   - Si hay duda en un dígito (¿es 3 u 8?), RECHAZAR
   - Nunca adivines o corrijas sin estar 100% seguro

5. **Recibos Borrosos = RECHAZO**
   - Marca como "RECHAZAR - Borroso" sin corregir datos
   - Esto enseña a la IA a identificar baja calidad

### ❌ Errores Comunes a Evitar

1. ❌ **Corregir datos de recibos borrosos**
   - Si está borroso, márcalo como rechazado SIN corregir
   - No "adivines" los números correctos

2. ❌ **No verificar números duplicados**
   - Antes de entrenar, verifica que los números no existan
   - El sistema ayuda, pero siempre revisa manualmente

3. ❌ **Aceptar recibos con dudas**
   - Si tienes cualquier duda, RECHAZAR
   - Es mejor ser conservador

4. ❌ **No documentar la razón**
   - Siempre explica tu decisión
   - Ayuda a otros a entender el criterio

5. ❌ **Entrenar solo recibos aceptados**
   - Es IGUAL de importante entrenar recibos RECHAZADOS
   - La IA necesita aprender qué NO aceptar

---

## 📈 Análisis de Datos de Entrenamiento

### Ver Estadísticas

En la pestaña **🎓 Entrenamiento IA** verás:

- **Total Registros**: Cuántos recibos has entrenado
- **Aceptados**: Cuántos marcaste como válidos
- **Rechazados**: Cuántos marcaste como inválidos
- **Tasa de Aceptación**: Porcentaje de recibos válidos

### Exportar Dataset

1. Haz clic en **📥 Exportar Dataset**
2. Se descarga un archivo JSON con todos los datos
3. Úsalo para:
   - Análisis externo
   - Respaldo
   - Compartir con el equipo
   - Entrenar modelos de ML personalizados (futuro)

---

## 🔄 Sincronización con Google Sheets

### Configuración de Google Sheets

Los datos de entrenamiento se guardan en una hoja llamada **"Entrenamiento"** con las siguientes columnas:

- **ID**: Identificador único
- **Decisión**: ACEPTAR o RECHAZAR (con razón)
- **Tipo Recibo**: Categoría (Redeban, Bancolombia, etc.)
- **Datos Correctos**: Todos los campos corregidos
- **Datos IA**: Lo que extrajo originalmente la IA
- **Entrenador**: Quién entrenó
- **Fecha**: Cuándo se entrenó
- **URL Imagen**: Link a la imagen en Drive
- **Notas**: Observaciones adicionales

### Cargar Datos desde Sheets

Si trabajas en equipo:
1. Haz clic en **📥 Cargar desde Sheets**
2. Se descargan los datos de entrenamiento del equipo
3. Los datos se combinan con los tuyos locales

---

## 🚀 Mejoras Continuas

### Ciclo de Mejora

```
1. Subir recibos → 2. Revisar precisión → 3. Entrenar IA
      ↑                                          ↓
      └────────── 4. Observar mejoras ──────────┘
```

### Métricas a Monitorear

- **Tasa de recibos que requieren verificación manual**
  - Meta: Menos del 10%
  
- **Tasa de rechazos por baja calidad**
  - Indica si los requisitos son muy estrictos o muy laxos
  
- **Tipos de recibo más problemáticos**
  - Enfoca el entrenamiento en esos tipos

---

## ❓ Preguntas Frecuentes

### ¿Cuántos recibos debo entrenar?

- **Mínimo recomendado**: 50-100 recibos variados
- **Ideal**: 200+ recibos con diferentes bancos y casos
- **Mantenimiento**: Entrena 5-10 recibos nuevos cada semana

### ¿Los datos de entrenamiento mejoran la IA inmediatamente?

Actualmente, los datos de entrenamiento se guardan para:
1. **Referencia futura**: Crear un dataset de calidad
2. **Validación manual**: Comparar con casos reales
3. **Análisis**: Identificar patrones y errores comunes

En futuras versiones, se podrá usar para:
- Fine-tuning del modelo de IA
- Validación automática basada en casos históricos
- Mejora continua del sistema

### ¿Qué pasa si dos personas marcan el mismo recibo diferente?

El sistema guarda ambas versiones. En el análisis posterior:
- Se revisan casos con discrepancia
- Se define un criterio estándar
- Se actualiza la configuración si es necesario

### ¿Puedo borrar datos de entrenamiento?

Sí, puedes eliminar registros individuales con el botón 🗑️. Sin embargo:
- ⚠️ No se pueden recuperar después de borrar
- 💡 Mejor opción: Exportar JSON antes de borrar
- 🔄 Si ya sincronizaste, los datos persisten en Google Sheets

---

## 📞 Soporte

Si tienes dudas o encuentras problemas:
1. Revisa esta documentación
2. Consulta con el equipo
3. Reporta bugs específicos con capturas de pantalla

---

**Última actualización**: Enero 2026
**Versión del sistema**: 2.0 con Entrenamiento IA
