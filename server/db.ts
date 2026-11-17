import Database from 'better-sqlite3';
import path from 'node:path';
import { encryptKey, generateApiKey, hashPassword } from './crypto.ts';

const DB_PATH = path.resolve(process.cwd(), 'youstor.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'seller',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      tagline TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'عام',
      currency TEXT NOT NULL DEFAULT 'MAD',
      accent_color TEXT NOT NULL DEFAULT '#DB2777',
      hero_image TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      announcement_text TEXT NOT NULL DEFAULT 'التوصيل مجاني لجميع المدن · الدفع عند الاستلام متاح',
      announcement_enabled INTEGER NOT NULL DEFAULT 1,
      shipping_fee REAL NOT NULL DEFAULT 0,
      free_shipping_threshold REAL NOT NULL DEFAULT 0,
      delivery_estimate TEXT NOT NULL DEFAULT '24 - 48 ساعة',
      enable_cod INTEGER NOT NULL DEFAULT 1,
      enable_card INTEGER NOT NULL DEFAULT 1,
      express_checkout INTEGER NOT NULL DEFAULT 1,
      whatsapp_number TEXT NOT NULL DEFAULT '+212 641-747082',
      support_email TEXT NOT NULL DEFAULT '',
      return_policy TEXT NOT NULL DEFAULT 'استبدال واسترجاع مجاني خلال 7 أيام من استلام الطلب.',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_integration_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      key_name TEXT NOT NULL,
      key_label TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      last_rotated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      compare_at_price REAL DEFAULT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      shipping_address TEXT NOT NULL,
      city TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cod',
      status TEXT NOT NULL DEFAULT 'pending',
      shipping_fee REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_daily_visits (
      store_id INTEGER NOT NULL,
      visit_date TEXT NOT NULL,
      visits INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (store_id, visit_date),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // Safe migrations for pre-existing database files
  ensureColumn('stores', 'announcement_text', "TEXT NOT NULL DEFAULT 'التوصيل مجاني لجميع المدن · الدفع عند الاستلام متاح'");
  ensureColumn('stores', 'announcement_enabled', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('stores', 'shipping_fee', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('stores', 'free_shipping_threshold', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('stores', 'delivery_estimate', "TEXT NOT NULL DEFAULT '24 - 48 ساعة'");
  ensureColumn('stores', 'enable_cod', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('stores', 'enable_card', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('stores', 'express_checkout', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('stores', 'whatsapp_number', "TEXT NOT NULL DEFAULT '+212 641-747082'");
  ensureColumn('stores', 'support_email', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('stores', 'return_policy', "TEXT NOT NULL DEFAULT 'استبدال واسترجاع مجاني خلال 7 أيام من استلام الطلب.'");
  ensureColumn('products', 'compare_at_price', 'REAL DEFAULT NULL');
  ensureColumn('orders', 'shipping_fee', 'REAL NOT NULL DEFAULT 0');

  seedInitialData();
  seedDailyVisitsIfEmpty();
}

function seedDailyVisitsIfEmpty() {
  const visitCount = db.prepare('SELECT COUNT(*) as count FROM store_daily_visits').get() as { count: number };
  if (visitCount.count > 0) return;

  const stores = db.prepare('SELECT id FROM stores').all() as Array<{ id: number }>;
  if (stores.length === 0) return;

  const insertVisit = db.prepare(
    'INSERT OR IGNORE INTO store_daily_visits (store_id, visit_date, visits) VALUES (?, ?, ?)'
  );
  const pattern = [84, 96, 112, 105, 134, 158, 142, 165, 189, 174, 210, 228, 245, 268];
  const now = new Date();
  for (const s of stores) {
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (13 - i));
      const isoDate = d.toISOString().slice(0, 10);
      const base = s.id === 1 ? pattern[i] : Math.round(pattern[i] * 0.65);
      insertVisit.run(s.id, isoDate, base);
    }
  }
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  );
  const demoPass = hashPassword('youstor2026');
  const userResult = insertUser.run('سارة المنصور', 'seller@youstor.app', demoPass, 'seller');
  const ownerId = Number(userResult.lastInsertRowid);

  const insertStore = db.prepare(`
    INSERT INTO stores (
      owner_id, name, slug, tagline, category, currency, accent_color, hero_image, is_active,
      announcement_text, announcement_enabled, shipping_fee, free_shipping_threshold,
      delivery_estimate, enable_cod, enable_card, express_checkout, whatsapp_number, support_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?, 1, 1, 1, ?, ?)
  `);

  const store1Result = insertStore.run(
    ownerId,
    'دار نَوار للحرف والعطور',
    'dar-nawar',
    'متجر مستقل على منصة youstor — أضف منتجاتك الخاصة لتظهر هنا فوراً مع توصيل مجاني.',
    'تحف وعطور',
    'MAD',
    '#DB2777',
    '/src/assets/images/store_hero_artisan_1794923524198.jpg',
    'التوصيل مجاني لجميع المدن · الدفع عند الاستلام متاح',
    0,
    0,
    '24 - 48 ساعة',
    '+212 641-747082',
    'contact@dar-nawar.ma'
  );
  const store1Id = Number(store1Result.lastInsertRowid);

  const store2Result = insertStore.run(
    ownerId,
    'مُقتنيات السراج',
    'al-siraj-studio',
    'متجر مستقل للأزياء والجلديات — توصيل مجاني لجميع المدن.',
    'أزياء وجلديات',
    'MAD',
    '#111827',
    '/src/assets/images/product_leather_bag_1794923526250.jpg',
    'التوصيل مجاني لجميع المدن · استبدال مجاني خلال 7 أيام',
    0,
    0,
    '24 - 48 ساعة',
    '+212 641-747082',
    'hello@alsiraj.ma'
  );
  const store2Id = Number(store2Result.lastInsertRowid);

  const insertKey = db.prepare(`
    INSERT INTO store_integration_keys (store_id, key_name, key_label, key_prefix, encrypted_value, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sId of [store1Id, store2Id]) {
    const syncToken = generateApiKey('yst_sync_');
    const encSync = encryptKey(syncToken);
    insertKey.run(
      sId,
      'storefront_sync_token',
      'مفتاح مزامنة المتجر الداخلي',
      encSync.keyPrefix,
      encSync.encryptedValue,
      encSync.iv,
      encSync.authTag
    );

    const payToken = generateApiKey('yst_pay_');
    const encPay = encryptKey(payToken);
    insertKey.run(
      sId,
      'payment_gateway_secret',
      'مفتاح ربط بوابة الدفع',
      encPay.keyPrefix,
      encPay.encryptedValue,
      encPay.iv,
      encPay.authTag
    );
  }

  const insertSync = db.prepare(`
    INSERT INTO sync_events (store_id, direction, event_type, summary)
    VALUES (?, ?, ?, ?)
  `);
  insertSync.run(store1Id, 'seller_to_storefront', 'key_rotated', 'تم توليد وتشفير مفتاح المزامنة الداخلي للمتجر بنظام AES-256-GCM');
  insertSync.run(store1Id, 'seller_to_storefront', 'store_ready', 'تم تفعيل التوصيل المجاني وربط المتجر بلوحة التاجر بنجاح — بانتظار إضافة المنتجات.');
}
