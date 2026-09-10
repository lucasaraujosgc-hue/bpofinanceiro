import React from 'react';
import { Category } from '../types';
import { CategoryIcon, categoryTint } from './categoryIcons';

interface Props {
  category?: Category | null;
  /** 'sm' (default) | 'xs' */
  size?: 'sm' | 'xs';
  className?: string;
}

/** Pill de categoria: ícone Lucide + nome, tingido com a cor da categoria.
 *  Sem categoria → pill de alerta "Sem categoria". */
const CategoryTag: React.FC<Props> = ({ category, size = 'sm', className = '' }) => {
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px] gap-1' : 'px-2.5 py-0.5 text-xs gap-1.5';
  const iconSize = size === 'xs' ? 11 : 13;

  if (!category) {
    return (
      <span className={`inline-flex items-center rounded-full font-medium bg-danger/10 text-danger border border-danger/30 ${pad} ${className}`}>
        Sem categoria
      </span>
    );
  }

  const tinted = !!category.color;
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${pad} ${tinted ? '' : 'bg-sunken text-muted border-line'} ${className}`}
      style={categoryTint(category.color)}
      title={category.name}
    >
      <CategoryIcon name={category.icon} size={iconSize} />
      <span className="truncate max-w-[160px]">{category.name}</span>
    </span>
  );
};

export default CategoryTag;
