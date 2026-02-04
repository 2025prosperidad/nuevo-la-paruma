import { CachedAnalysis } from '../types';

const CACHE_KEY = 'laparuma_analysis_cache';
const TRAINING_VERSION_KEY = 'laparuma_training_version';

/**
 * Obtener versión actual de entrenamientos
 * Se incrementa cada vez que se agrega un nuevo entrenamiento
 */
export function getTrainingVersion(): number {
    const version = localStorage.getItem(TRAINING_VERSION_KEY);
    return version ? parseInt(version, 10) : 0;
}

/**
 * Incrementar versión de entrenamientos
 * Esto invalidará todos los cachés existentes
 */
export function incrementTrainingVersion(): void {
    const currentVersion = getTrainingVersion();
    localStorage.setItem(TRAINING_VERSION_KEY, String(currentVersion + 1));
}

/**
 * Obtener análisis cacheado por hash de imagen
 */
export function getCachedAnalysis(hash: string): CachedAnalysis | null {
    try {
        const cacheStr = localStorage.getItem(CACHE_KEY);
        if (!cacheStr) return null;

        const cache: Record<string, CachedAnalysis> = JSON.parse(cacheStr);
        const cached = cache[hash];

        if (!cached) return null;

        // Verificar si el caché está expirado
        const currentVersion = getTrainingVersion();
        if (cached.trainingVersion !== currentVersion) {
            // Entrenamientos nuevos, invalidar caché
            delete cache[hash];
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            return null;
        }

        return cached;
    } catch (error) {
        console.error('Error al leer caché:', error);
        return null;
    }
}

/**
 * Guardar análisis en caché
 */
export function setCachedAnalysis(hash: string, data: CachedAnalysis): void {
    try {
        const cacheStr = localStorage.getItem(CACHE_KEY);
        const cache: Record<string, CachedAnalysis> = cacheStr ? JSON.parse(cacheStr) : {};

        cache[hash] = {
            ...data,
            trainingVersion: getTrainingVersion(),
            timestamp: Date.now()
        };

        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error('Error al guardar en caché:', error);
    }
}

/**
 * Limpiar cachés expirados (más de X horas)
 */
export function cleanExpiredCache(expirationHours: number = 720): void {
    try {
        const cacheStr = localStorage.getItem(CACHE_KEY);
        if (!cacheStr) return;

        const cache: Record<string, CachedAnalysis> = JSON.parse(cacheStr);
        const now = Date.now();
        const expirationMs = expirationHours * 60 * 60 * 1000;

        let cleaned = 0;
        for (const hash in cache) {
            if (now - cache[hash].timestamp > expirationMs) {
                delete cache[hash];
                cleaned++;
            }
        }

        if (cleaned > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            console.log(`🧹 Limpiados ${cleaned} cachés expirados`);
        }
    } catch (error) {
        console.error('Error al limpiar caché:', error);
    }
}

/**
 * Obtener estadísticas del caché
 */
export function getCacheStats(): { size: number; oldestTimestamp: number | null } {
    try {
        const cacheStr = localStorage.getItem(CACHE_KEY);
        if (!cacheStr) return { size: 0, oldestTimestamp: null };

        const cache: Record<string, CachedAnalysis> = JSON.parse(cacheStr);
        const entries = Object.values(cache);

        return {
            size: entries.length,
            oldestTimestamp: entries.length > 0
                ? Math.min(...entries.map(e => e.timestamp))
                : null
        };
    } catch (error) {
        console.error('Error al obtener estadísticas de caché:', error);
        return { size: 0, oldestTimestamp: null };
    }
}

/**
 * Limpiar todo el caché
 */
export function clearAllCache(): void {
    localStorage.removeItem(CACHE_KEY);
    console.log('🗑️ Caché completamente limpiado');
}
