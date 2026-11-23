import {
  Apple, Beef, Beer, BookOpen, CalendarDays, Check, CircleCheck, Pencil, CakeSlice, Camera, Candy, Carrot, ChefHat, Cherry, ChevronLeft, ChevronRight, Citrus,
  Coffee, Cookie, CookingPot, Croissant, CupSoda, Dessert, Donut, Drumstick, EggFried, Fish, Flame, Grape, Ham,
  Hamburger, IceCreamCone, Image, LayoutGrid, Leaf, List, Lock, Map as MapIcon, MapPin, Martini, Milk, Minus, Package, Pizza, Plus, Popcorn, Salad,
  Sandwich, ScanBarcode, Search, Settings, ShoppingBasket, ShoppingCart, Soup, Sprout, Store, Tag, User, Users, Utensils, Vegan,
  Wheat, Wine, X,
} from 'lucide';

type IconNode = [string, Record<string, string | number>][];

/** Icons offered for categories and map markers. Keys are stored in the database. */
export const FOOD_ICONS: Record<string, { label: string; node: IconNode }> = {
  utensils: { label: 'Couverts', node: Utensils },
  'chef-hat': { label: 'Toque', node: ChefHat },
  'cooking-pot': { label: 'Marmite', node: CookingPot },
  soup: { label: 'Soupe', node: Soup },
  wine: { label: 'Vin', node: Wine },
  martini: { label: 'Cocktail', node: Martini },
  beer: { label: 'Bière', node: Beer },
  coffee: { label: 'Café', node: Coffee },
  'cup-soda': { label: 'Boisson', node: CupSoda },
  milk: { label: 'Lait', node: Milk },
  croissant: { label: 'Croissant', node: Croissant },
  wheat: { label: 'Blé / pain', node: Wheat },
  'cake-slice': { label: 'Gâteau', node: CakeSlice },
  dessert: { label: 'Dessert', node: Dessert },
  'ice-cream-cone': { label: 'Glace', node: IceCreamCone },
  cookie: { label: 'Biscuit', node: Cookie },
  donut: { label: 'Donut', node: Donut },
  candy: { label: 'Bonbon', node: Candy },
  pizza: { label: 'Pizza', node: Pizza },
  hamburger: { label: 'Burger', node: Hamburger },
  sandwich: { label: 'Sandwich', node: Sandwich },
  popcorn: { label: 'Snack', node: Popcorn },
  'egg-fried': { label: 'Œuf / brunch', node: EggFried },
  fish: { label: 'Poisson', node: Fish },
  beef: { label: 'Viande', node: Beef },
  drumstick: { label: 'Volaille', node: Drumstick },
  ham: { label: 'Charcuterie', node: Ham },
  salad: { label: 'Salade', node: Salad },
  vegan: { label: 'Végé', node: Vegan },
  leaf: { label: 'Feuille', node: Leaf },
  sprout: { label: 'Pousse', node: Sprout },
  carrot: { label: 'Légume', node: Carrot },
  apple: { label: 'Fruit', node: Apple },
  cherry: { label: 'Cerise', node: Cherry },
  grape: { label: 'Raisin', node: Grape },
  citrus: { label: 'Agrume', node: Citrus },
  flame: { label: 'Grill', node: Flame },
  'shopping-basket': { label: 'Épicerie', node: ShoppingBasket },
  store: { label: 'Boutique', node: Store },
  package: { label: 'Produit', node: Package },
};

const UI_ICONS = {
  camera: Camera,
  check: Check,
  pencil: Pencil,
  'circle-check': CircleCheck,
  'map-pin': MapPin,
  lock: Lock,
  image: Image,
  search: Search,
  x: X,
  plus: Plus,
  minus: Minus,
  grid: LayoutGrid,
  list: List,
  'scan-barcode': ScanBarcode,
  'shopping-cart': ShoppingCart,
  package: Package,
  wine: Wine,
  tag: Tag,
  user: User,
  users: Users,
  settings: Settings,
  'book-open': BookOpen,
  map: MapIcon,
  'chef-hat': ChefHat,
  calendar: CalendarDays,
  'shopping-basket': ShoppingBasket,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
} satisfies Record<string, IconNode>;

export type UiIcon = keyof typeof UI_ICONS;

export const DEFAULT_ICON = 'utensils';

/** Palette offered for categories (first one is the brand colour). */
export const CATEGORY_COLORS = [
  '#D1382F', '#E07A2E', '#D9A21B', '#8A9A2B', '#3E8E5A', '#2A8C82',
  '#2F6FA8', '#3D4C9E', '#7A4AA0', '#B5487A', '#8B5A3C', '#5E6670',
];

const escapeAttr = (v: string | number) => String(v).replace(/"/g, '&quot;');

function render(node: IconNode, size: number, strokeWidth: number) {
  const children = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

/** Inline SVG for a UI icon (inherits `currentColor`). */
export const icon = (name: UiIcon, size = 18, strokeWidth = 2) => render(UI_ICONS[name], size, strokeWidth);

/** Inline SVG for a food icon key, falling back to fork & knife. */
export const foodIcon = (name: string | null | undefined, size = 18, strokeWidth = 2) =>
  render((FOOD_ICONS[name ?? ''] ?? FOOD_ICONS[DEFAULT_ICON]).node, size, strokeWidth);

/** Round "tried" mark sized like the rating circle: green check when tried, grey otherwise. */
export const triedBadge = (tried: boolean, size = 34) =>
  `<span class="tried-badge${tried ? ' on' : ''}" style="width:${size}px;height:${size}px" title="${tried ? 'Déjà testé' : 'Pas encore testé'}">${render(UI_ICONS.check, Math.round(size * 0.55), 3)}</span>`;

/** Same round mark for the household stock: green check when in stock, grey cross otherwise. */
export const stockBadge = (inStock: boolean, size = 22) =>
  `<span class="tried-badge${inStock ? ' on' : ''}" style="width:${size}px;height:${size}px" title="${inStock ? 'En stock' : 'Plus en stock'}">${render(inStock ? UI_ICONS.check : UI_ICONS.x, Math.round(size * 0.55), 3)}</span>`;

/** White icon on a Bouffe Center red disc: the house style for category/place icons. */
export const iconBadge = (name: string | null | undefined, size = 28) =>
  `<span class="icon-badge" style="width:${size}px;height:${size}px">${foodIcon(name, Math.round(size * 0.56))}</span>`;
