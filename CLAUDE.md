# CLAUDE.md - AI Assistant Guide

## Project Overview

**Project Name:** Consignaciones La Paruma
**Company:** Distribuidora La Paruma SAS
**Purpose:** Intelligent bank consignment receipt validation system with AI-powered OCR

This is a React + TypeScript + Vite application that uses Google Gemini AI to analyze Colombian bank payment receipts (consignaciones), validate them against business rules, detect duplicates, and synchronize approved records to Google Sheets.

### Tech Stack
- **Frontend:** React 19.2.0, TypeScript 5.8.2
- **Build Tool:** Vite 6.2.0
- **AI Service:** Google Gemini 2.5 Flash (@google/genai ^1.30.0)
- **Styling:** TailwindCSS (via CDN)
- **Data Persistence:** Google Sheets (via Google Apps Script)
- **State Management:** React hooks (useState, useCallback, useEffect)
- **Storage:** localStorage for configuration

---

## Project Structure

```
/
├── App.tsx                    # Main application component (state, validation logic)
├── index.tsx                  # React entry point
├── index.html                 # HTML template with Tailwind CDN
├── types.ts                   # TypeScript type definitions
├── constants.ts               # Business rules, accounts, convenios, config
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript configuration
├── package.json               # Dependencies and scripts
├── metadata.json              # App metadata
├── components/
│   ├── Header.tsx             # Top navigation with sync button
│   ├── UploadZone.tsx         # Drag-and-drop file upload
│   ├── Stats.tsx              # Statistics dashboard
│   ├── ConsignmentTable.tsx   # Data table with records
│   ├── ImageModal.tsx         # Full-screen image viewer
│   └── ConfigModal.tsx        # Configuration editor
└── services/
    ├── geminiService.ts       # AI image analysis integration
    └── sheetsService.ts       # Google Sheets API integration
```

---

## Core Functionality

### 1. Image Upload & Analysis (UploadZone + geminiService)
- Users drag-and-drop or select bank receipt images (JPG, PNG)
- Images are converted to base64 and sent to Gemini AI
- AI extracts structured data using a JSON schema

### 2. Data Extraction (geminiService.ts)
The AI extracts the following fields:
- `bankName`: Bank name (e.g., "Bancolombia", "Nequi", "Redeban")
- `accountOrConvenio`: Destination account or convenio code
- `amount`: Transaction amount (number)
- `date`: Transaction date (YYYY-MM-DD format)
- `time`: Transaction time (HH:MM format, nullable)
- `uniqueTransactionId`: RRN, Receipt #, Approval Code (CRITICAL for duplicate detection)
- `paymentReference`: Client ID, Cedula, Ref 1 (can be repeated)
- `imageQualityScore`: 0-100 (min acceptable: 60)
- `isReadable`: Boolean flag
- `rawText`: Raw extracted text for debugging

### 3. Validation Logic (App.tsx: validateRecord)
Each extracted record goes through strict validation:

#### A. Quality Check
- Requires `isReadable = true`
- Requires `imageQualityScore >= 60` (MIN_QUALITY_SCORE)
- Rejects low-quality/blurry images

#### B. Duplicate Detection (ULTRA STRICT)
**Rule 1 - Transaction ID Match (Preferred):**
- If `uniqueTransactionId` exists and is >3 chars, check for exact match
- Normalizes IDs by removing non-digits
- Compares against both local records and Google Sheets history

**Rule 2 - Heuristic Match (Fallback):**
- If Amount + Date + Client Reference match → Duplicate
- If Amount + Date + Time match (and both have time) → Duplicate
- Tolerance: ±50 pesos for amount
- Prevents same client paying same amount on same day

#### C. Account/Convenio Validation
- Normalizes account numbers: removes spaces, dashes, leading zeros
- Checks against `ALLOWED_ACCOUNTS` array (transfer accounts)
- Checks against `ALLOWED_CONVENIOS` array (collection codes)
- Checks against `COMMON_REFERENCES` array (known client IDs)
- Supports relaxed matching (substring search in raw text)

### 4. Validation Statuses (types.ts)
```typescript
enum ValidationStatus {
  VALID = 'VALID',                    // ✅ Approved for sync
  DUPLICATE = 'DUPLICATE',            // ⚠️ Already processed
  INVALID_ACCOUNT = 'INVALID_ACCOUNT', // ❌ Unknown account/convenio
  LOW_QUALITY = 'LOW_QUALITY',        // ❌ Unreadable image
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'     // ❌ AI/processing error
}
```

### 5. Google Sheets Integration (sheetsService.ts)

#### Sending Data (POST)
- Only `VALID` records are synced
- Maps to Google Sheets columns:
  - `estado`: "Aceptada" / "Rechazada"
  - `banco`: Bank name
  - `tipoPago`: "recaudo" (convenio) or "transferencia" (account)
  - `valor`: Amount
  - `fechaTransaccion`: Date
  - `hora`: Time
  - `numeroReferencia`: Transaction ID
  - `cuentaDestino`: Account/Convenio
  - `titularCuentaDestino`: "Distribuidora La Paruma SAS"
  - `motivoRechazo`: Error message if rejected

**Critical:** Uses `Content-Type: text/plain` to avoid CORS preflight

#### Fetching History (GET)
- Fetches last 100 accepted records by default
- Supports filtering by: limit, estado, banco, fechaInicio
- Polyglot column mapping (supports old and new sheet formats)
- Uses `redirect: 'follow'` to handle Google's 302 redirects

---

## Configuration System

### localStorage Keys
- `config_accounts`: JSON array of ConfigItem[] for allowed accounts
- `config_convenios`: JSON array of ConfigItem[] for allowed convenios
- `config_script_url`: Google Apps Script Web App URL

### ConfigItem Type
```typescript
interface ConfigItem {
  id: string;              // Unique ID
  value: string;           // Account/Convenio number
  label: string;           // User-friendly description
  type: 'ACCOUNT' | 'CONVENIO';
}
```

### Default Configuration (constants.ts)
**Allowed Accounts:**
- Bancolombia: 24500020949, 24500020950
- Occidente: 001305000001000169513, 425832797
- Legacy: 24500081160, 24552844602

**Allowed Convenios:**
- Davivienda: 1352327, 1192509
- Bancolombia: 56885, 73180
- Banco Agrario: 18129, 14311
- BBVA: 3278, 29140

**Common References (Client IDs):**
- 10813353, 13937684

---

## Development Workflows

### Setup
```bash
npm install
# Create .env.local with:
# GEMINI_API_KEY=your_api_key_here
npm run dev
```

### Available Scripts
- `npm run dev` - Start dev server (port 3000)
- `npm run build` - Production build
- `npm run preview` - Preview production build

### Environment Variables
- `GEMINI_API_KEY` - Google Gemini API key (required)
- Vite config maps this to `process.env.API_KEY` and `process.env.GEMINI_API_KEY`

### Git Workflow
- Main branch: Not specified in current repo
- Feature branches: Use `claude/` prefix for AI-generated branches
- Current branch: `claude/claude-md-mj0h9lbns9vvczov-01C7BV3uVkANsLTu7p4dtxVV`

---

## Key Conventions for AI Assistants

### 1. Date & Time Handling
- **Date Format:** ALWAYS use `YYYY-MM-DD` (ISO 8601)
- **Time Format:** Use `HH:MM` in 24-hour format
- **Month Translation:** Handle Spanish month abbreviations (ENE=01, FEB=02, etc.)
- Example: "NOV 21 2025" → "2025-11-21"

### 2. Account Normalization
```typescript
normalizeAccount(acc: string) {
  return acc.replace(/[\s-]/g, '').replace(/^0+/, '');
}
```
- Remove spaces and dashes
- Remove leading zeros
- Example: "001-234-567" → "1234567"

### 3. Transaction ID Priority
When extracting from receipts:
1. **First Priority:** Look for "RRN", "Recibo", "Aprobación"
2. **Second Priority:** "CUS", "Comprobante", "Secuencia"
3. **NEVER confuse** "Referencia" (Client ID) with Transaction ID

### 4. Quality Scoring Guidelines
- 90-100: Perfect, crisp digital screenshot
- 70-89: Good quality thermal receipt
- 60-69: Acceptable (slightly crumpled but readable)
- <60: Reject (blurry, damaged, unreadable)

### 5. Type Inference Rules
- If account/convenio length < 9 digits → `tipoPago = "recaudo"` (convenio)
- If account/convenio length >= 9 digits → `tipoPago = "transferencia"` (account)

### 6. Code Style Preferences
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use explicit types, avoid `any`
- Handle errors gracefully with try-catch
- Provide user-friendly error messages in Spanish

### 7. State Management Patterns
- Local records: Unsynced, uploaded in current session
- Sheet records: Synced, fetched from Google Sheets
- Always check both arrays for duplicate detection
- Use `crypto.randomUUID()` for generating IDs

### 8. CORS & Google Apps Script
- **POST requests:** Use `Content-Type: text/plain` (avoids OPTIONS preflight)
- **GET requests:** No custom headers (simple request)
- **Always include:** `redirect: 'follow'`, `credentials: 'omit'`
- **Why:** Google Apps Script doesn't handle CORS preflight (OPTIONS) requests

---

## Common Tasks & Solutions

### Adding a New Bank Type
1. Update `geminiService.ts` prompt with bank-specific keywords
2. Add bank-specific validation logic if needed
3. Test with sample receipts
4. Update this documentation

### Adding a New Account/Convenio
1. Edit `constants.ts` → `ALLOWED_ACCOUNTS` or `ALLOWED_CONVENIOS`
2. Or use ConfigModal in UI (stored in localStorage)
3. Restart app to reload defaults

### Modifying Validation Rules
- Edit `validateRecord()` in `App.tsx`
- Consider backward compatibility with Google Sheets data
- Test duplicate detection thoroughly

### Debugging AI Extraction
- Check `rawText` field in ConsignmentRecord
- Review Gemini prompt in `geminiService.ts`
- Ensure `imageQualityScore` is reasonable
- Verify response schema matches expected types

### Fixing CORS Issues
- Verify Google Apps Script is deployed as "Web App"
- Check "Execute as: Me" and "Who has access: Anyone"
- Ensure URL ends with `/exec`
- Test with Postman/curl first

---

## Important Business Logic

### Duplicate Prevention Strategy
This system implements a two-tier duplicate detection:

**Tier 1 - Transaction ID (Most Reliable):**
- Physical receipts from Redeban terminals have unique RRN/Receipt numbers
- These are globally unique and prevent any duplicates
- Example: RRN "123456789012" will never be processed twice

**Tier 2 - Heuristic Matching (For Nequi Screenshots):**
- Nequi screenshots may lack reliable transaction IDs
- System uses: Date + Time + Amount + Client Cedula
- Rationale: Same client rarely pays exact amount at exact minute twice
- Prevents users from submitting same Nequi screenshot multiple times

### Multi-Tab Architecture
- **"Validación en Curso":** Local records, not yet synced
- **"Historial Google Sheets":** Remote records, already synced
- Users validate locally first, then batch-sync approved records
- History auto-refreshes after successful sync

---

## Error Handling Patterns

### Image Analysis Errors
```typescript
// Always wrap in try-catch
try {
  const data = await analyzeConsignmentImage(base64);
} catch (err) {
  // Return fallback record with UNKNOWN_ERROR status
  return {
    status: ValidationStatus.UNKNOWN_ERROR,
    statusMessage: "Error lectura IA",
    // ... minimal required fields
  };
}
```

### Google Sheets Errors
```typescript
// Return user-friendly messages
return {
  success: false,
  message: "Error de conexión. Verifica la URL del script."
};
```

### Quality Check Failures
- Display clear message: "Calidad insuficiente (50/100, requiere 60)"
- Allow user to retry with better photo
- Store failed records for review

---

## Testing Guidelines

### Manual Testing Checklist
- [ ] Upload single receipt → Validates correctly
- [ ] Upload same receipt twice → Detects duplicate
- [ ] Upload low-quality image → Rejects with quality error
- [ ] Upload receipt with unknown account → Rejects with account error
- [ ] Sync valid records → Appears in Google Sheets
- [ ] Refresh history → Fetches from Google Sheets
- [ ] Edit config → Persists in localStorage
- [ ] Reset config → Restores defaults

### Edge Cases to Test
- Receipts with missing time field
- Receipts with Spanish month names
- Accounts with leading zeros
- Multiple uploads in same batch (duplicate within batch)
- Network errors during sync/fetch

---

## Security & Privacy Considerations

### API Keys
- `GEMINI_API_KEY` must be in `.env.local` (gitignored)
- Never commit API keys to version control
- Use environment variables in production

### Image Data
- Images are converted to base64 and stored in memory
- Google Sheets receives metadata only, not images
- Images are temporary and cleared on page refresh

### Google Sheets Access
- Uses public Web App URL (no OAuth)
- Anyone with URL can send/fetch data
- Consider adding authentication layer for production

---

## Deployment

### Current Hosting
- AI Studio App: https://ai.studio/apps/drive/1L1eQzL8M-GeKNsXRsgbDMyIydNIRM70O
- Uses importmap for dependencies (no bundling)

### Production Build
```bash
npm run build
# Output in dist/ folder
# Deploy to any static hosting (Vercel, Netlify, etc.)
```

### Google Apps Script Setup
1. Create new Google Sheets spreadsheet
2. Extensions → Apps Script
3. Create doGet() and doPost() handlers
4. Deploy as Web App
5. Copy deployment URL to `constants.ts` → `GOOGLE_SCRIPT_URL`

---

## Troubleshooting

### "API_KEY is missing" Warning
- Create `.env.local` file in project root
- Add: `GEMINI_API_KEY=your_key_here`
- Restart dev server

### "Error al conectar. Revisa la URL y permisos"
- Verify Google Apps Script URL in ConfigModal
- Check script is deployed as Web App
- Ensure script has "Anyone" access permissions

### Duplicates Not Detected
- Check `uniqueTransactionId` is being extracted correctly
- Verify normalization is working (check raw vs normalized values)
- Review `validateRecord()` logic in App.tsx

### Images Not Analyzing
- Check browser console for Gemini API errors
- Verify API key is valid and has quota
- Ensure images are valid JPG/PNG format
- Check image file size (Gemini has limits)

---

## Future Enhancements (Suggestions for AI Assistants)

1. **Batch Processing Performance:** Add loading progress bar for multiple images
2. **Export Features:** Allow CSV export of local records
3. **Advanced Filtering:** Add date range filters in history tab
4. **Image Compression:** Optimize large images before sending to AI
5. **Offline Mode:** Cache records with IndexedDB
6. **Authentication:** Add login system for multi-user access
7. **Audit Trail:** Track who uploaded each record and when
8. **Webhooks:** Real-time notifications for new approvals
9. **Mobile App:** React Native version for field workers
10. **OCR Fallback:** Use Tesseract.js if Gemini fails

---

## Contact & Support

**Company:** Distribuidora La Paruma SAS
**Purpose:** Streamline bank consignment validation for accounting team
**GitHub Issues:** Report bugs via repository issues
**Version:** 0.0.0 (Initial Development)

---

## AI Assistant Quick Reference

### When Modifying This Codebase:
1. ✅ **DO:** Read existing code first before making changes
2. ✅ **DO:** Preserve Spanish UI text and error messages
3. ✅ **DO:** Test duplicate detection thoroughly after changes
4. ✅ **DO:** Update this CLAUDE.md if adding major features
5. ✅ **DO:** Handle errors gracefully with user-friendly messages
6. ✅ **DO:** Use existing TypeScript types and enums
7. ❌ **DON'T:** Change validation logic without understanding business rules
8. ❌ **DON'T:** Break Google Sheets integration (test POST/GET)
9. ❌ **DON'T:** Commit sensitive data (API keys, credentials)
10. ❌ **DON'T:** Remove comments explaining complex logic

### Common File Locations:
- **Business Rules:** `constants.ts`
- **Type Definitions:** `types.ts`
- **Main App Logic:** `App.tsx`
- **AI Integration:** `services/geminiService.ts`
- **Sheets API:** `services/sheetsService.ts`
- **UI Components:** `components/*.tsx`

### Key Functions to Understand:
- `validateRecord()` - Core validation logic
- `analyzeConsignmentImage()` - AI extraction
- `sendToGoogleSheets()` - Data synchronization
- `fetchHistoryFromSheets()` - History retrieval
- `normalizeAccount()` - Account number normalization

---

**Last Updated:** 2025-12-10
**Document Version:** 1.0
**Maintained By:** AI Assistant (Claude)
