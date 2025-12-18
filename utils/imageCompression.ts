/**
 * Utility para comprimir y validar imágenes antes de enviarlas a Gemini
 */

export interface CompressionResult {
  success: boolean;
  data?: string; // Base64 string (sin el prefijo data:image/...)
  mimeType?: string;
  originalSize: number;
  compressedSize?: number;
  error?: string;
}

/**
 * Valida el tipo de archivo
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  // Formatos soportados
  const supportedFormats = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ];

  if (!supportedFormats.includes(file.type)) {
    return {
      valid: false,
      error: `🖼️ Formato no soportado: ${file.type}. Usa JPG, PNG, WEBP, GIF, HEIC o HEIF.`
    };
  }

  // Límite de 20MB antes de compresión
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `📦 Imagen demasiado grande: ${(file.size / 1024 / 1024).toFixed(2)}MB. Máximo 20MB.`
    };
  }

  return { valid: true };
};

/**
 * Comprime una imagen si es necesario
 * Target: ~1.5MB o menos para enviar a Gemini
 */
export const compressImage = (file: File): Promise<CompressionResult> => {
  return new Promise((resolve) => {
    const originalSize = file.size;
    
    // Si la imagen es menor a 1.5MB, no comprimirla
    const TARGET_SIZE = 1.5 * 1024 * 1024;
    if (originalSize <= TARGET_SIZE) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const [header, data] = base64String.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        
        resolve({
          success: true,
          data,
          mimeType,
          originalSize,
          compressedSize: originalSize
        });
      };
      reader.onerror = () => {
        resolve({
          success: false,
          originalSize,
          error: '❌ Error al leer el archivo'
        });
      };
      return;
    }

    // Comprimir imagen grande
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const img = new Image();
      
      img.onload = () => {
        // Calcular nuevo tamaño manteniendo aspect ratio
        let width = img.width;
        let height = img.height;
        const MAX_DIMENSION = 2400; // Máximo 2400px en cualquier lado
        
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = (height / width) * MAX_DIMENSION;
            width = MAX_DIMENSION;
          } else {
            width = (width / height) * MAX_DIMENSION;
            height = MAX_DIMENSION;
          }
        }
        
        // Crear canvas y comprimir
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            success: false,
            originalSize,
            error: '❌ Error al crear contexto de canvas'
          });
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Intentar diferentes calidades hasta alcanzar el target
        let quality = 0.85;
        const attemptCompression = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve({
                  success: false,
                  originalSize,
                  error: '❌ Error al comprimir imagen'
                });
                return;
              }
              
              // Si aún es muy grande y podemos reducir más la calidad, intentar de nuevo
              if (blob.size > TARGET_SIZE && quality > 0.5) {
                quality -= 0.1;
                attemptCompression();
                return;
              }
              
              // Convertir blob a base64
              const blobReader = new FileReader();
              blobReader.readAsDataURL(blob);
              blobReader.onloadend = () => {
                const compressedBase64 = blobReader.result as string;
                const [header, data] = compressedBase64.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                
                console.log(`🖼️ Imagen comprimida: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(blob.size / 1024 / 1024).toFixed(2)}MB (${((blob.size / originalSize) * 100).toFixed(0)}%)`);
                
                resolve({
                  success: true,
                  data,
                  mimeType,
                  originalSize,
                  compressedSize: blob.size
                });
              };
            },
            'image/jpeg',
            quality
          );
        };
        
        attemptCompression();
      };
      
      img.onerror = () => {
        resolve({
          success: false,
          originalSize,
          error: '❌ Error al cargar imagen para compresión'
        });
      };
      
      img.src = base64String;
    };
    
    reader.onerror = () => {
      resolve({
        success: false,
        originalSize,
        error: '❌ Error al leer el archivo'
      });
    };
  });
};

/**
 * Procesa un archivo: valida, comprime si es necesario, y retorna base64
 */
export const processImageFile = async (file: File): Promise<CompressionResult> => {
  // 1. Validar formato
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return {
      success: false,
      originalSize: file.size,
      error: validation.error
    };
  }

  // 2. Comprimir si es necesario
  try {
    const result = await compressImage(file);
    return result;
  } catch (error: any) {
    return {
      success: false,
      originalSize: file.size,
      error: `❌ Error al procesar imagen: ${error?.message || 'Error desconocido'}`
    };
  }
};

