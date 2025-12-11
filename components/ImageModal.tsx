import React, { useEffect } from 'react';

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ isOpen, imageUrl, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen || !imageUrl) return null;

  // Helper: Convert Google Drive URL to viewable format
  const getViewableImageUrl = (url: string): string => {
    if (!url) return '';
    
    // If it's already base64, return as is
    if (url.startsWith('data:image')) {
      return url;
    }
    
    // If it's a Google Drive URL, convert to direct view format
    if (url.includes('drive.google.com')) {
      // Extract file ID from various Drive URL formats
      const fileIdMatch = url.match(/\/file\/d\/([^\/]+)/);
      const idMatch = url.match(/id=([^&]+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : (idMatch ? idMatch[1] : null);
      
      if (fileId) {
        // Use Google Drive direct link for high quality view
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }
    
    return url;
  };

  const isDriveUrl = imageUrl.includes('drive.google.com');
  const displayUrl = getViewableImageUrl(imageUrl);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm transition-opacity duration-300"
      onClick={onClose}
    >
      {/* Close button */}
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white focus:outline-none transition-colors p-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image Container */}
      <div 
        className="relative max-w-7xl w-full max-h-[90vh] flex items-center justify-center overflow-hidden rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
      >
        <img 
          src={displayUrl} 
          alt="Vista detallada del comprobante" 
          className="max-w-full max-h-[90vh] object-contain rounded-md bg-white"
          onError={(e) => {
            // Si falla, intentar con URL original
            (e.target as HTMLImageElement).src = imageUrl;
          }}
        />
        
        {/* Open in Drive button (only for Drive URLs) */}
        {isDriveUrl && (
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-4 left-4 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg transition-colors flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Abrir en Drive
          </a>
        )}
      </div>
      
      <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
        <span className="inline-block bg-black/50 text-white text-sm px-4 py-1 rounded-full backdrop-blur-md border border-white/10">
          {isDriveUrl ? 'Imagen desde Google Drive' : 'Presiona ESC o haz clic fuera para cerrar'}
        </span>
      </div>
    </div>
  );
};