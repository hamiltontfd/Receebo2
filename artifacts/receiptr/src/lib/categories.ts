import { Cpu, Home, Shirt, ShoppingBasket, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const CATEGORIES = [
  "Electronics",
  "Home",
  "Clothing & Apparel",
  "Groceries",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

const STYLES: Record<string, string> = {
  Electronics: "bg-blue-100 text-blue-700",
  Home: "bg-amber-100 text-amber-700",
  "Clothing & Apparel": "bg-pink-100 text-pink-700",
  Groceries: "bg-green-100 text-green-700",
  Other: "bg-gray-100 text-gray-600",
};

const ICONS: Record<string, LucideIcon> = {
  Electronics: Cpu,
  Home: Home,
  "Clothing & Apparel": Shirt,
  Groceries: ShoppingBasket,
  Other: Package,
};

export function categoryStyle(category?: string | null): string {
  if (!category) return STYLES["Other"];
  return STYLES[category] ?? STYLES["Other"];
}

export function categoryIcon(category?: string | null): LucideIcon {
  if (!category) return ICONS["Other"];
  return ICONS[category] ?? ICONS["Other"];
}
