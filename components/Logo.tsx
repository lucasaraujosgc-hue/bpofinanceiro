import React from 'react';

type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
  /** Use sobre fundos escuros (sidebar, login). */
  onDark?: boolean;
  size?: LogoSize;
  className?: string;
}

const SIZES: Record<LogoSize, { word: string; sub: string }> = {
  sm: { word: 'text-lg', sub: 'text-[8px]' },
  md: { word: 'text-2xl md:text-[26px]', sub: 'text-[10px] md:text-[11px]' },
  lg: { word: 'text-[30px] md:text-[34px]', sub: 'text-[11px] md:text-[12px]' },
};

/**
 * Wordmark "Vírgula," — a vírgula é a marca. Fraunces bold na palavra + vírgula,
 * "Contábil" em Inter caixa-alta espaçada, centralizado sob a palavra.
 */
export function Logo({ onDark = false, size = 'md', className = '' }: LogoProps) {
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex flex-col items-center select-none leading-none ${className}`}
      aria-label="Vírgula Contábil"
    >
      <span className="flex items-baseline">
        <span className={`font-brand font-bold tracking-tight ${s.word} ${onDark ? 'text-ink' : 'text-wordmark'}`}>
          Vírgula
        </span>
        <span className={`font-brand font-bold leading-none text-wordmark-comma ${s.word}`}>,</span>
      </span>
      <span
        className={`font-sans font-normal uppercase leading-none mt-0.5 ml-[0.3em] tracking-[0.3em] ${s.sub} ${
          onDark ? 'text-ink/55' : 'text-wordmark-sub'
        }`}
      >
        Contábil
      </span>
    </span>
  );
}

export default Logo;
