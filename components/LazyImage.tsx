import React, { useState, useEffect } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    className?: string; // Expect tailwind classes for width/height/rounded
    fallbackSrc?: string; // Optional fallback if image fails
}

/**
 * A wrapper around the <img> tag that shows a shimmering skeleton loader
 * while the image is loading.
 */
const LazyImage: React.FC<LazyImageProps> = ({
    src,
    alt,
    className = '',
    fallbackSrc = '',
    ...props
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [imgSrc, setImgSrc] = useState<string | undefined>(undefined);

    useEffect(() => {
        setImgSrc(src);
        setIsLoading(true);
        setHasError(false);
    }, [src]);

    const handleLoad = () => {
        setIsLoading(false);
    };

    const handleError = () => {
        setIsLoading(false);
        setHasError(true);
        if (fallbackSrc) {
            setImgSrc(fallbackSrc);
        }
    };

    return (
        <div className={`relative overflow-hidden ${className} bg-slate-200 dark:bg-slate-800`}>
            {/* Shimmer / Skeleton Loader */}
            {isLoading && (
                <div className="absolute inset-0 z-10 animate-pulse bg-slate-300 dark:bg-slate-700"></div>
            )}

            {/* Actual Image */}
            <img
                src={imgSrc}
                alt={alt}
                className={`transition-opacity duration-500 ease-in-out ${isLoading ? 'opacity-0' : 'opacity-100'} w-full h-full object-cover`}
                onLoad={handleLoad}
                onError={handleError}
                {...props}
            />

            {/* Fallback Content (if error and no fallback src provided, show Initials or Icon?) - 
                For now we just keep the bg color or handle fallbackSrc. 
                If error occurred and we display nothing, the bg color remains. 
            */}
            {hasError && !fallbackSrc && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-400">
                    <span className="material-symbols-outlined text-sm">image_not_supported</span>
                </div>
            )}
        </div>
    );
};

export default LazyImage;
