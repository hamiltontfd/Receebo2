import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "crypto";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { receiptsTable, type ReceiptProductItem, type ReceiptNotableItem } from "@workspace/db";
import { logger } from "../lib/logger";
import { runTrialReminderSweep } from "../lib/orphanCleanup";

const router: IRouter = Router();

function requireAdminSecret(req: Request, res: Response, next: NextFunction): void {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) {
    logger.warn("ADMIN_SECRET not configured — admin endpoints are disabled");
    res.status(503).json({ error: "Admin endpoints are not configured" });
    return;
  }

  const provided = req.headers["x-admin-secret"];
  if (!provided || provided !== adminSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

function randomDate(year: number): string {
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type SeedReceipt = {
  merchant: string;
  category: string;
  currency: string;
  country: string;
  isOnline: boolean;
  products: ReceiptProductItem[];
  notableItems: ReceiptNotableItem[];
};

const SEED_POOL: SeedReceipt[] = [
  // Electronics — TVs
  {
    merchant: "Best Buy", category: "Electronics", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "Sony Bravia X90L 65\"", quantity: 1, price: 1299.99 },
      { name: "HDMI 2.1 Cable 3m", quantity: 2, price: 14.99 },
      { name: "Extended Warranty 3yr", quantity: 1, price: 129.99 },
    ],
    notableItems: [{ name: "Sony Bravia X90L 65\"", price: 1299.99, category: "Electronics", reason: "High-value TV purchase" }],
  },
  {
    merchant: "Amazon", category: "Electronics", currency: "EUR", country: "DE", isOnline: true,
    products: [
      { name: "Samsung Neo QLED QN85B 55\"", quantity: 1, price: 989.00 },
      { name: "Samsung Slim Fit Wall Mount", quantity: 1, price: 49.00 },
    ],
    notableItems: [{ name: "Samsung Neo QLED QN85B 55\"", price: 989.00, category: "Electronics", reason: "Premium television" }],
  },
  {
    merchant: "Costco", category: "Electronics", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "LG C3 OLED 65\"", quantity: 1, price: 1599.99 },
      { name: "Surge Protector 8-outlet", quantity: 1, price: 24.99 },
    ],
    notableItems: [{ name: "LG C3 OLED 65\"", price: 1599.99, category: "Electronics", reason: "OLED flagship TV" }],
  },
  {
    merchant: "Samsung Store", category: "Electronics", currency: "GBP", country: "GB", isOnline: true,
    products: [
      { name: "Samsung Frame TV 50\"", quantity: 1, price: 799.00 },
      { name: "No-Gap Wall Mount", quantity: 1, price: 119.00 },
      { name: "Slim One Connect Box", quantity: 1, price: 0.01 },
    ],
    notableItems: [{ name: "Samsung Frame TV 50\"", price: 799.00, category: "Electronics", reason: "Art-mode smart TV" }],
  },
  // Electronics — Headphones
  {
    merchant: "Apple Store", category: "Electronics", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "AirPods Pro 2nd Gen", quantity: 1, price: 249.00 },
      { name: "MagSafe Charger", quantity: 1, price: 39.00 },
    ],
    notableItems: [{ name: "AirPods Pro 2nd Gen", price: 249.00, category: "Electronics", reason: "Noise-cancelling earbuds" }],
  },
  {
    merchant: "Sony Store", category: "Electronics", currency: "EUR", country: "ES", isOnline: true,
    products: [
      { name: "Sony WH-1000XM5", quantity: 1, price: 349.00 },
      { name: "Carrying Case", quantity: 1, price: 29.00 },
    ],
    notableItems: [{ name: "Sony WH-1000XM5", price: 349.00, category: "Electronics", reason: "Premium ANC headphones" }],
  },
  {
    merchant: "Amazon", category: "Electronics", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Bose QuietComfort 45", quantity: 1, price: 279.00 },
      { name: "Audio Cable 1.2m", quantity: 1, price: 9.99 },
      { name: "Replacement Ear Cushions", quantity: 1, price: 19.99 },
    ],
    notableItems: [{ name: "Bose QuietComfort 45", price: 279.00, category: "Electronics", reason: "Wireless ANC headphones" }],
  },
  {
    merchant: "MediaMarkt", category: "Electronics", currency: "EUR", country: "DE", isOnline: false,
    products: [
      { name: "Samsung Galaxy Buds2 Pro", quantity: 1, price: 189.00 },
    ],
    notableItems: [{ name: "Samsung Galaxy Buds2 Pro", price: 189.00, category: "Electronics", reason: "TWS earbuds" }],
  },
  // Electronics — Controllers / Gaming
  {
    merchant: "GameStop", category: "Electronics", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "PS5 DualSense Controller", quantity: 1, price: 69.99 },
      { name: "PS5 Game — Spider-Man 2", quantity: 1, price: 69.99 },
    ],
    notableItems: [{ name: "PS5 DualSense Controller", price: 69.99, category: "Electronics", reason: "Haptic feedback controller" }],
  },
  {
    merchant: "Amazon EU S.à r.l.", category: "Electronics", currency: "EUR", country: "ES", isOnline: true,
    products: [
      { name: "Mars Gaming MGPX Gamepad", quantity: 1, price: 24.11 },
    ],
    notableItems: [{ name: "Mars Gaming MGPX Gamepad", price: 24.11, category: "Electronics", reason: "Bluetooth gamepad" }],
  },
  {
    merchant: "Microsoft Store", category: "Electronics", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Xbox Wireless Controller", quantity: 1, price: 59.99 },
      { name: "Xbox Game Pass 3mo", quantity: 1, price: 44.99 },
    ],
    notableItems: [{ name: "Xbox Wireless Controller", price: 59.99, category: "Electronics", reason: "First-party Xbox controller" }],
  },
  {
    merchant: "Nintendo eShop", category: "Electronics", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Nintendo Switch Pro Controller", quantity: 1, price: 69.99 },
      { name: "Zelda: Tears of the Kingdom", quantity: 1, price: 59.99 },
    ],
    notableItems: [{ name: "Nintendo Switch Pro Controller", price: 69.99, category: "Electronics", reason: "Ergonomic Switch controller" }],
  },
  // Electronics — Laptops
  {
    merchant: "Apple Store", category: "Electronics", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "MacBook Pro 14\" M3 Pro", quantity: 1, price: 1999.00 },
      { name: "USB-C Hub 7-in-1", quantity: 1, price: 49.00 },
    ],
    notableItems: [{ name: "MacBook Pro 14\" M3 Pro", price: 1999.00, category: "Electronics", reason: "High-performance laptop" }],
  },
  {
    merchant: "Dell Online Store", category: "Electronics", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Dell XPS 15 9530", quantity: 1, price: 1749.00 },
      { name: "Dell 27\" 4K Monitor", quantity: 1, price: 549.00 },
      { name: "Dell Thunderbolt Dock", quantity: 1, price: 249.00 },
    ],
    notableItems: [
      { name: "Dell XPS 15 9530", price: 1749.00, category: "Electronics", reason: "Premium Windows laptop" },
      { name: "Dell 27\" 4K Monitor", price: 549.00, category: "Electronics", reason: "4K display" },
    ],
  },
  {
    merchant: "Fnac", category: "Electronics", currency: "EUR", country: "FR", isOnline: false,
    products: [
      { name: "Lenovo ThinkPad X1 Carbon", quantity: 1, price: 1449.00 },
      { name: "Logitech MX Keys Mini", quantity: 1, price: 99.00 },
    ],
    notableItems: [{ name: "Lenovo ThinkPad X1 Carbon", price: 1449.00, category: "Electronics", reason: "Business ultrabook" }],
  },
  // Electronics — Phones
  {
    merchant: "Apple Store", category: "Electronics", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "iPhone 15 Pro 256GB", quantity: 1, price: 1099.00 },
      { name: "Apple Care+ 2yr", quantity: 1, price: 199.00 },
      { name: "MagSafe Case", quantity: 1, price: 49.00 },
    ],
    notableItems: [{ name: "iPhone 15 Pro 256GB", price: 1099.00, category: "Electronics", reason: "Flagship smartphone" }],
  },
  {
    merchant: "Samsung Store", category: "Electronics", currency: "EUR", country: "DE", isOnline: true,
    products: [
      { name: "Samsung Galaxy S24 Ultra", quantity: 1, price: 1299.00 },
      { name: "S Pen Fold Edition", quantity: 1, price: 49.00 },
    ],
    notableItems: [{ name: "Samsung Galaxy S24 Ultra", price: 1299.00, category: "Electronics", reason: "Android flagship" }],
  },
  // Clothing — Shoes
  {
    merchant: "Nike", category: "Clothing & Apparel", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Nike Air Max 270", quantity: 1, price: 149.99 },
      { name: "Nike Crew Socks 3pk", quantity: 1, price: 18.00 },
    ],
    notableItems: [{ name: "Nike Air Max 270", price: 149.99, category: "Clothing & Apparel", reason: "Popular lifestyle sneaker" }],
  },
  {
    merchant: "Adidas", category: "Clothing & Apparel", currency: "EUR", country: "ES", isOnline: true,
    products: [
      { name: "Adidas Ultraboost 23", quantity: 1, price: 189.95 },
      { name: "Adidas Running Shorts", quantity: 1, price: 34.95 },
    ],
    notableItems: [{ name: "Adidas Ultraboost 23", price: 189.95, category: "Clothing & Apparel", reason: "Performance running shoe" }],
  },
  {
    merchant: "Foot Locker", category: "Clothing & Apparel", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "New Balance 990v5", quantity: 1, price: 184.99 },
      { name: "Insoles Premium", quantity: 1, price: 19.99 },
    ],
    notableItems: [{ name: "New Balance 990v5", price: 184.99, category: "Clothing & Apparel", reason: "Made in USA heritage shoe" }],
  },
  {
    merchant: "Converse", category: "Clothing & Apparel", currency: "GBP", country: "GB", isOnline: true,
    products: [
      { name: "Chuck Taylor All Star Hi", quantity: 1, price: 74.99 },
      { name: "Chuck Taylor Low Top", quantity: 1, price: 64.99 },
    ],
    notableItems: [{ name: "Chuck Taylor All Star Hi", price: 74.99, category: "Clothing & Apparel", reason: "Classic canvas high-top" }],
  },
  // Clothing — Apparel
  {
    merchant: "Zara", category: "Clothing & Apparel", currency: "EUR", country: "ES", isOnline: false,
    products: [
      { name: "Slim Fit Chino Trousers", quantity: 2, price: 39.95 },
      { name: "Oxford Button-Down Shirt", quantity: 1, price: 29.95 },
      { name: "Wool Blend Blazer", quantity: 1, price: 89.95 },
    ],
    notableItems: [{ name: "Wool Blend Blazer", price: 89.95, category: "Clothing & Apparel", reason: "Formal outerwear" }],
  },
  {
    merchant: "H&M", category: "Clothing & Apparel", currency: "SEK", country: "SE", isOnline: false,
    products: [
      { name: "Regular Fit T-Shirts 3pk", quantity: 1, price: 249.00 },
      { name: "Slim Jeans", quantity: 1, price: 399.00 },
      { name: "Puffer Jacket", quantity: 1, price: 699.00 },
    ],
    notableItems: [{ name: "Puffer Jacket", price: 699.00, category: "Clothing & Apparel", reason: "Winter outerwear" }],
  },
  {
    merchant: "Uniqlo", category: "Clothing & Apparel", currency: "JPY", country: "JP", isOnline: false,
    products: [
      { name: "Ultra Light Down Jacket", quantity: 1, price: 9900 },
      { name: "Heattech Extra Warm Turtleneck", quantity: 2, price: 3990 },
      { name: "Merino Wool Crew Sweater", quantity: 1, price: 7990 },
    ],
    notableItems: [{ name: "Ultra Light Down Jacket", price: 9900, category: "Clothing & Apparel", reason: "Packable insulated jacket" }],
  },
  // Home
  {
    merchant: "IKEA", category: "Home", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "KALLAX Shelf Unit 4x4", quantity: 1, price: 189.00 },
      { name: "KALLAX Insert with Door", quantity: 4, price: 20.00 },
      { name: "BLADIS Basket", quantity: 2, price: 7.99 },
    ],
    notableItems: [{ name: "KALLAX Shelf Unit 4x4", price: 189.00, category: "Home", reason: "Modular shelving" }],
  },
  {
    merchant: "IKEA", category: "Home", currency: "EUR", country: "DE", isOnline: false,
    products: [
      { name: "MALM Desk 140cm", quantity: 1, price: 149.00 },
      { name: "ALEX Drawer Unit", quantity: 1, price: 99.00 },
      { name: "JÄRVFJÄLLET Office Chair", quantity: 1, price: 229.00 },
    ],
    notableItems: [
      { name: "JÄRVFJÄLLET Office Chair", price: 229.00, category: "Home", reason: "Ergonomic office chair" },
      { name: "MALM Desk 140cm", price: 149.00, category: "Home", reason: "Work from home desk" },
    ],
  },
  {
    merchant: "Wayfair", category: "Home", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Linen Sofa 3-Seater", quantity: 1, price: 849.00 },
      { name: "Throw Pillows Set of 2", quantity: 1, price: 44.99 },
    ],
    notableItems: [{ name: "Linen Sofa 3-Seater", price: 849.00, category: "Home", reason: "Living room sofa" }],
  },
  {
    merchant: "Dyson", category: "Home", currency: "GBP", country: "GB", isOnline: true,
    products: [
      { name: "Dyson V15 Detect Vacuum", quantity: 1, price: 649.99 },
      { name: "Extra Wand Attachment Set", quantity: 1, price: 39.99 },
    ],
    notableItems: [{ name: "Dyson V15 Detect Vacuum", price: 649.99, category: "Home", reason: "High-end cordless vacuum" }],
  },
  {
    merchant: "Williams-Sonoma", category: "Home", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "KitchenAid Stand Mixer 5qt", quantity: 1, price: 449.95 },
      { name: "Silicone Spatula Set", quantity: 1, price: 24.95 },
      { name: "All-Clad 12\" Skillet", quantity: 1, price: 179.95 },
    ],
    notableItems: [
      { name: "KitchenAid Stand Mixer 5qt", price: 449.95, category: "Home", reason: "Premium kitchen mixer" },
    ],
  },
  {
    merchant: "IKEA", category: "Home", currency: "GBP", country: "GB", isOnline: false,
    products: [
      { name: "BILLY Bookcase 80x202cm", quantity: 2, price: 69.00 },
      { name: "OXBERG Door for BILLY", quantity: 4, price: 25.00 },
    ],
    notableItems: [{ name: "BILLY Bookcase 80x202cm", price: 69.00, category: "Home", reason: "Classic bookcases" }],
  },
  // Groceries
  {
    merchant: "Whole Foods Market", category: "Groceries", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "Organic Almond Butter", quantity: 2, price: 12.99 },
      { name: "Avocado Hass 4pk", quantity: 1, price: 5.99 },
      { name: "Greek Yoghurt 32oz", quantity: 1, price: 6.49 },
      { name: "Cold Brew Coffee 32oz", quantity: 2, price: 9.99 },
      { name: "Sourdough Loaf", quantity: 1, price: 7.99 },
    ],
    notableItems: [],
  },
  {
    merchant: "Trader Joe's", category: "Groceries", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "Mandarin Orange Chicken", quantity: 2, price: 5.49 },
      { name: "Everything Bagel Seasoning", quantity: 1, price: 1.99 },
      { name: "Dark Chocolate Bar 72%", quantity: 3, price: 1.99 },
      { name: "Sparkling Lemonade 6pk", quantity: 1, price: 4.99 },
    ],
    notableItems: [],
  },
  {
    merchant: "Mercadona", category: "Groceries", currency: "EUR", country: "ES", isOnline: false,
    products: [
      { name: "Aceite de Oliva Virgen Extra 1L", quantity: 2, price: 6.99 },
      { name: "Jamón Ibérico 100g", quantity: 1, price: 5.49 },
      { name: "Leche Entera 6 uds", quantity: 1, price: 5.94 },
      { name: "Pan de Molde", quantity: 2, price: 1.69 },
    ],
    notableItems: [],
  },
  {
    merchant: "Walmart", category: "Groceries", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "Great Value Chicken Breast 3lb", quantity: 1, price: 8.97 },
      { name: "Bagged Salad Mix", quantity: 2, price: 3.47 },
      { name: "Orange Juice 1gal", quantity: 1, price: 5.98 },
      { name: "Pasta Linguine 1lb", quantity: 3, price: 1.48 },
      { name: "Canned Tomatoes 28oz", quantity: 2, price: 1.88 },
    ],
    notableItems: [],
  },
  // Other
  {
    merchant: "Amazon", category: "Electronics", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Kindle Paperwhite 11th Gen", quantity: 1, price: 139.99 },
      { name: "Kindle Leather Cover", quantity: 1, price: 34.99 },
    ],
    notableItems: [{ name: "Kindle Paperwhite 11th Gen", price: 139.99, category: "Electronics", reason: "E-reader" }],
  },
  {
    merchant: "Steam", category: "Other", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Baldur's Gate 3", quantity: 1, price: 59.99 },
      { name: "Cyberpunk 2077", quantity: 1, price: 29.99 },
    ],
    notableItems: [],
  },
  {
    merchant: "Booking.com", category: "Other", currency: "EUR", country: "NL", isOnline: true,
    products: [
      { name: "Hotel Barceló Gran Via 3 nights", quantity: 1, price: 347.00 },
    ],
    notableItems: [{ name: "Hotel Barceló Gran Via 3 nights", price: 347.00, category: "Other", reason: "Hotel booking" }],
  },
  {
    merchant: "Decathlon", category: "Other", currency: "EUR", country: "FR", isOnline: false,
    products: [
      { name: "Quechua Backpack 30L", quantity: 1, price: 49.99 },
      { name: "Forclaz Trekking Poles", quantity: 1, price: 34.99 },
      { name: "Arpenaz Sleeping Bag", quantity: 1, price: 59.99 },
    ],
    notableItems: [{ name: "Quechua Backpack 30L", price: 49.99, category: "Other", reason: "Hiking backpack" }],
  },
  {
    merchant: "Target", category: "Home", currency: "USD", country: "US", isOnline: false,
    products: [
      { name: "Threshold Linen Duvet Set", quantity: 1, price: 79.99 },
      { name: "Memory Foam Pillows 2pk", quantity: 1, price: 39.99 },
      { name: "Candle Set Lavender", quantity: 2, price: 12.99 },
    ],
    notableItems: [],
  },
  {
    merchant: "Apple Store", category: "Electronics", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "iPad Air 5th Gen 64GB", quantity: 1, price: 599.00 },
      { name: "Apple Pencil 2nd Gen", quantity: 1, price: 129.00 },
      { name: "Smart Folio Case", quantity: 1, price: 79.00 },
    ],
    notableItems: [
      { name: "iPad Air 5th Gen 64GB", price: 599.00, category: "Electronics", reason: "Tablet" },
      { name: "Apple Pencil 2nd Gen", price: 129.00, category: "Electronics", reason: "Stylus for iPad" },
    ],
  },
  {
    merchant: "Leroy Merlin", category: "Home", currency: "EUR", country: "ES", isOnline: false,
    products: [
      { name: "Pintura Interior Blanca 15L", quantity: 2, price: 42.99 },
      { name: "Rodillo de Pintura Set", quantity: 1, price: 14.99 },
      { name: "Cinta Adhesiva Azul", quantity: 3, price: 3.49 },
    ],
    notableItems: [],
  },
  {
    merchant: "Zalando", category: "Clothing & Apparel", currency: "EUR", country: "DE", isOnline: true,
    products: [
      { name: "Nike Air Force 1 '07", quantity: 1, price: 109.95 },
      { name: "Levi's 501 Original Jeans", quantity: 1, price: 89.95 },
      { name: "Tommy Hilfiger Polo Shirt", quantity: 2, price: 49.90 },
    ],
    notableItems: [
      { name: "Nike Air Force 1 '07", price: 109.95, category: "Clothing & Apparel", reason: "Classic sneaker" },
    ],
  },
  {
    merchant: "El Corte Inglés", category: "Clothing & Apparel", currency: "EUR", country: "ES", isOnline: false,
    products: [
      { name: "Hugo Boss Suit Jacket", quantity: 1, price: 349.00 },
      { name: "Hugo Boss Trousers", quantity: 1, price: 149.00 },
      { name: "Silk Tie", quantity: 1, price: 59.00 },
    ],
    notableItems: [{ name: "Hugo Boss Suit Jacket", price: 349.00, category: "Clothing & Apparel", reason: "Formal blazer" }],
  },
  {
    merchant: "MediaMarkt", category: "Electronics", currency: "EUR", country: "ES", isOnline: false,
    products: [
      { name: "Philips Hue Starter Kit E27", quantity: 1, price: 79.99 },
      { name: "Philips Hue Bridge", quantity: 1, price: 49.99 },
      { name: "Hue Motion Sensor", quantity: 2, price: 29.99 },
    ],
    notableItems: [{ name: "Philips Hue Starter Kit E27", price: 79.99, category: "Electronics", reason: "Smart lighting system" }],
  },
  {
    merchant: "Fnac", category: "Electronics", currency: "EUR", country: "FR", isOnline: false,
    products: [
      { name: "Sony A7 IV Mirrorless Body", quantity: 1, price: 2799.00 },
      { name: "Sony FE 50mm f/1.8 Lens", quantity: 1, price: 249.00 },
      { name: "128GB CFexpress Card", quantity: 1, price: 89.00 },
    ],
    notableItems: [
      { name: "Sony A7 IV Mirrorless Body", price: 2799.00, category: "Electronics", reason: "Full-frame mirrorless camera" },
    ],
  },
  {
    merchant: "Amazon", category: "Electronics", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Anker PowerCore 26800mAh", quantity: 1, price: 59.99 },
      { name: "USB-C to USB-C Cable 2m", quantity: 2, price: 12.99 },
      { name: "Anker 65W GaN Charger", quantity: 1, price: 35.99 },
    ],
    notableItems: [],
  },
  {
    merchant: "Spotify", category: "Other", currency: "USD", country: "US", isOnline: true,
    products: [
      { name: "Spotify Premium Annual", quantity: 1, price: 99.99 },
    ],
    notableItems: [],
  },
  {
    merchant: "Carrefour", category: "Groceries", currency: "EUR", country: "FR", isOnline: false,
    products: [
      { name: "Saumon Atlantique 400g", quantity: 1, price: 8.99 },
      { name: "Fromage Comté AOP 200g", quantity: 2, price: 4.99 },
      { name: "Baguette Tradition", quantity: 3, price: 1.29 },
      { name: "Bordeaux Rouge AOC 75cl", quantity: 2, price: 11.99 },
    ],
    notableItems: [],
  },
  {
    merchant: "Nintendo eShop", category: "Electronics", currency: "EUR", country: "ES", isOnline: true,
    products: [
      { name: "Nintendo Switch OLED", quantity: 1, price: 349.99 },
      { name: "Nintendo Switch Online 12mo", quantity: 1, price: 19.99 },
      { name: "Mario Kart 8 Deluxe", quantity: 1, price: 59.99 },
    ],
    notableItems: [{ name: "Nintendo Switch OLED", price: 349.99, category: "Electronics", reason: "OLED handheld console" }],
  },
  {
    merchant: "Nespresso", category: "Home", currency: "EUR", country: "CH", isOnline: true,
    products: [
      { name: "Vertuo Next Coffee Machine", quantity: 1, price: 149.00 },
      { name: "VertuoLine Capsules 100ct", quantity: 1, price: 74.00 },
      { name: "Aeroccino Milk Frother", quantity: 1, price: 69.00 },
    ],
    notableItems: [{ name: "Vertuo Next Coffee Machine", price: 149.00, category: "Home", reason: "Pod coffee machine" }],
  },
  {
    merchant: "PcComponentes", category: "Electronics", currency: "EUR", country: "ES", isOnline: true,
    products: [
      { name: "Logitech MX Master 3S", quantity: 1, price: 99.99 },
      { name: "Logitech MX Keys Advanced", quantity: 1, price: 109.99 },
      { name: "Logitech Bolt USB Receiver", quantity: 1, price: 14.99 },
    ],
    notableItems: [
      { name: "Logitech MX Master 3S", price: 99.99, category: "Electronics", reason: "Productivity mouse" },
    ],
  },
];

function generateSeedRows(userId: string) {
  const years = [2022, 2022, 2023, 2023, 2024, 2024, 2025, 2025, 2026];
  const rows = [];
  const pool = [...SEED_POOL];

  // Ensure we cover all 50 receipts — cycle through pool if needed
  for (let i = 0; i < 50; i++) {
    const template = pool[i % pool.length];
    const year = years[i % years.length];
    const purchaseDate = randomDate(year);
    const total = template.products.reduce((sum, p) => sum + (p.price ?? 0) * (p.quantity ?? 1), 0);

    rows.push({
      userId,
      objectPath: `__seed__/${randomUUID()}.jpg`,
      originalFileName: `__seed__receipt_${i + 1}.jpg`,
      contentType: "image/jpeg",
      status: "completed",
      isDraft: false,
      merchant: template.merchant,
      purchaseDate,
      total: Math.round(total * 100) / 100,
      currency: template.currency,
      category: template.category,
      summary: `${template.merchant} purchase — ${template.products.length} item${template.products.length !== 1 ? "s" : ""}`,
      ocrText: template.products.map((p) => p.name).join(" "),
      products: template.products,
      notableItems: template.notableItems,
      purchaseCountry: template.country,
      isOnlinePurchase: template.isOnline,
      createdAt: new Date(`${purchaseDate}T${String(Math.floor(Math.random() * 23)).padStart(2, "0")}:${String(Math.floor(Math.random() * 59)).padStart(2, "0")}:00Z`),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// POST /admin/seed-receipts
// ---------------------------------------------------------------------------

/**
 * Inserts 50 fake receipts for the given userId, spanning 2022–2026.
 * Idempotent: skips if the user already has ≥ 50 seed receipts.
 * Pass force=true in the body to delete existing seeds and re-insert.
 *
 * Body: { userId: string, force?: boolean }
 * Headers: x-admin-secret
 */
router.post("/admin/seed-receipts", requireAdminSecret, async (req: Request, res: Response): Promise<void> => {
  const { userId, force } = req.body as { userId?: string; force?: boolean };

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId (string) is required in the request body" });
    return;
  }

  try {
    // Idempotency check
    const existing = await db
      .select({ id: receiptsTable.id })
      .from(receiptsTable)
      .where(and(eq(receiptsTable.userId, userId), ilike(receiptsTable.originalFileName, "__seed__%")));

    if (existing.length >= 50 && !force) {
      res.json({
        seeded: 0,
        existing: existing.length,
        message: "User already has seed receipts. Pass force=true to delete and re-seed.",
      });
      return;
    }

    // Delete existing seeds if force requested
    if (existing.length > 0 && force) {
      await db
        .delete(receiptsTable)
        .where(and(eq(receiptsTable.userId, userId), ilike(receiptsTable.originalFileName, "__seed__%")));
      logger.info({ userId, deleted: existing.length }, "Admin: force-deleted existing seed receipts");
    }

    const rows = generateSeedRows(userId);
    await db.insert(receiptsTable).values(rows);

    logger.info({ userId, count: rows.length }, "Admin: seed receipts inserted");
    res.json({ seeded: rows.length, message: `Inserted ${rows.length} seed receipts for user ${userId}` });
  } catch (err) {
    logger.error({ err }, "Admin: seed-receipts failed");
    res.status(500).json({ error: "Failed to seed receipts" });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/trial-reminder-dry-run
/**
 * Runs the trial-reminder sweep in dry-run mode: logs which users would receive
 * an email but does not send anything or modify any database state.
 *
 * Protected by the x-admin-secret header (must match the ADMIN_SECRET env var).
 *
 * Response: { matched: Array<{ userId, trialEnd, alreadySent }> }
 */
router.post("/admin/trial-reminder-dry-run", requireAdminSecret, async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info("Admin: trial-reminder dry-run requested");

    const matched = await runTrialReminderSweep({ dryRun: true });

    logger.info({ count: matched.length }, "Admin: trial-reminder dry-run complete");

    res.json({ matched });
  } catch (err) {
    logger.error({ err }, "Admin: trial-reminder dry-run failed");
    res.status(500).json({ error: "Dry-run failed" });
  }
});

export default router;
