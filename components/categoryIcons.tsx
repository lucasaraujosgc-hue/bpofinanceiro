import React from 'react';
import {
  Tag, ShoppingCart, Home, Car, Bus, Bike, Utensils, Coffee, Wine, PlugZap, Wifi,
  Briefcase, Users, Truck, Wrench, Hammer, Landmark, Receipt, PiggyBank, CreditCard,
  Banknote, Coins, CircleDollarSign, TrendingUp, Megaphone, GraduationCap, HeartPulse,
  Plane, Fuel, Package, Gift, Smartphone, Laptop, Shield, Scale, Store, Factory,
  Building, Dog, Cat, Baby, Book, Music, Shirt, Dumbbell, Palette, Leaf,
} from 'lucide-react';

// Mapa nome-kebab → componente. Import explícito (o `import *` quebra o
// tree-shaking e o bundle já tem ~860 kB). Chave = o que fica salvo no banco.
const ICON_MAP: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  'tag': Tag, 'shopping-cart': ShoppingCart, 'home': Home, 'car': Car, 'bus': Bus, 'bike': Bike,
  'utensils': Utensils, 'coffee': Coffee, 'wine': Wine, 'plug-zap': PlugZap, 'wifi': Wifi,
  'briefcase': Briefcase, 'users': Users, 'truck': Truck, 'wrench': Wrench, 'hammer': Hammer,
  'landmark': Landmark, 'receipt': Receipt, 'piggy-bank': PiggyBank, 'credit-card': CreditCard,
  'banknote': Banknote, 'coins': Coins, 'circle-dollar-sign': CircleDollarSign, 'trending-up': TrendingUp,
  'megaphone': Megaphone, 'graduation-cap': GraduationCap, 'heart-pulse': HeartPulse, 'plane': Plane,
  'fuel': Fuel, 'package': Package, 'gift': Gift, 'smartphone': Smartphone, 'laptop': Laptop,
  'shield': Shield, 'scale': Scale, 'store': Store, 'factory': Factory, 'building': Building,
  'dog': Dog, 'cat': Cat, 'baby': Baby, 'book': Book, 'music': Music, 'shirt': Shirt,
  'dumbbell': Dumbbell, 'palette': Palette, 'leaf': Leaf,
};

export const CATEGORY_ICON_NAMES = Object.keys(ICON_MAP).filter(k => k !== 'tag');

// paleta alinhada aos tons do tema (Tailwind 500)
export const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
];

export const CategoryIcon: React.FC<{ name?: string | null; size?: number; className?: string }> = ({ name, size = 14, className }) => {
  const Ico = (name && ICON_MAP[name]) || Tag;
  return <Ico size={size} className={className} />;
};

/** estilo do chip a partir da cor da categoria (hex + alpha) */
export const categoryTint = (color?: string | null): React.CSSProperties =>
  color
    ? { color, backgroundColor: `${color}22`, borderColor: `${color}55` }
    : {};
