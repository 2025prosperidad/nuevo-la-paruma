# 🚀 Guía de Deployment en Netlify

## Configurar Variables de Entorno en Netlify

### Paso 1: Acceder a la Configuración

1. Ve a tu dashboard de Netlify: https://app.netlify.com
2. Selecciona tu sitio **nuevo-la-paruma**
3. Ve a **Site settings** (Configuración del sitio)
4. En el menú lateral, selecciona **Environment variables** (Variables de entorno)

### Paso 2: Agregar las API Keys

Haz clic en **Add a variable** y agrega las siguientes:

#### Variable 1: GEMINI_API_KEY
- **Key**: `GEMINI_API_KEY`
- **Value**: `[Tu Gemini API Key aquí]`
  - Obtén tu key en: https://makersuite.google.com/app/apikey
- **Scopes**: Selecciona todas las opciones (Production, Deploy Previews, Branch deploys)

#### Variable 2: OPENAI_API_KEY
- **Key**: `OPENAI_API_KEY`
- **Value**: `[Tu OpenAI API Key aquí]`
  - Obtén tu key en: https://platform.openai.com/api-keys
- **Scopes**: Selecciona todas las opciones (Production, Deploy Previews, Branch deploys)

> **IMPORTANTE**: Usa las mismas API keys que tienes en tu archivo `.env.local` local.

### Paso 3: Hacer Deploy

Después de agregar las variables:

1. Ve a **Deploys** en el menú superior
2. Haz clic en **Trigger deploy** → **Deploy site**
3. Espera a que termine el build (2-3 minutos)

**IMPORTANTE**: Las variables de entorno solo se aplican en nuevos deploys. Si ya tenías un deploy activo, necesitas hacer un nuevo deploy para que las variables surtan efecto.

---

## Verificación Rápida

### Opción A: Desde la UI de Netlify

1. Ve a **Deploys** → Último deploy
2. Haz clic en **Deploy log**
3. Busca en los logs que no haya errores de "API_KEY is missing"

### Opción B: Desde tu Sitio

1. Abre tu sitio en Netlify (ej: `https://tu-sitio.netlify.app`)
2. Abre la consola del navegador (F12)
3. Deberías ver mensajes como:
   - `"API Key loaded successfully: AIzaSyBeYr..."`
   - `"Gemini API Key loaded successfully..."`

---

## Comandos Útiles

### Build Local (Simular Netlify)
```bash
npm run build
```

### Preview del Build
```bash
npm run preview
```

---

## Troubleshooting

### ❌ Error: "API_KEY is missing"

**Solución**:
1. Verifica que agregaste las variables en Netlify
2. Asegúrate de hacer un nuevo deploy después de agregar las variables
3. Verifica que los nombres sean exactos: `GEMINI_API_KEY` y `OPENAI_API_KEY`

### ❌ Error: "Cannot find module 'openai'"

**Solución**:
1. Verifica que `package.json` tenga `"openai": "^4.77.3"`
2. Netlify debería instalar automáticamente, pero si no:
   - Ve a **Site settings** → **Build & deploy** → **Build settings**
   - Verifica que el comando de build sea: `npm run build`

### ❌ Las variables no se aplican

**Solución**:
1. Las variables solo se aplican en **nuevos deploys**
2. Haz un nuevo deploy: **Deploys** → **Trigger deploy** → **Deploy site**
3. O haz un push a Git (Netlify auto-deploya)

---

## Alternativa: Deploy Manual desde Git

Si prefieres que Netlify auto-deplaye cuando haces push:

1. Ve a **Site settings** → **Build & deploy** → **Continuous deployment**
2. Asegúrate de que esté conectado a tu repo de GitHub
3. Cada vez que hagas `git push`, Netlify hará deploy automáticamente

---

## Resumen de Configuración

✅ **Variables de entorno agregadas en Netlify**:
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

✅ **Código actualizado**:
- `vite.config.ts` configurado para leer las variables
- `constants.ts` usa variables de entorno
- `.env.local` solo para desarrollo local

✅ **Próximo paso**:
- Hacer un nuevo deploy en Netlify
- Probar el sistema en producción
