import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decryptKey,
  encryptKey,
  generateApiKey,
  generateUniqueStoreSlug,
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './server/crypto.ts';
import { db, initDatabase } from './server/db.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const SUPPORTED_CURRENCIES = ['MAD', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR'];

initDatabase();

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
  };
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req);
  return cookies.youstor_session || null;
}

function setSessionCookie(res: Response, token: string) {
  res.cookie('youstor_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول للوصول إلى لوحة البائع.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول.' });
    return;
  }
  const userRow = db
    .prepare('SELECT id, name, email FROM users WHERE id = ?')
    .get(payload.userId) as { id: number; name: string; email: string } | undefined;
  if (!userRow) {
    res.status(401).json({ error: 'حساب المستخدم غير موجود.' });
    return;
  }
  req.user = userRow;
  next();
}

function getOwnedStore(storeId: number, ownerId: number) {
  return db
    .prepare('SELECT * FROM stores WHERE id = ? AND owner_id = ?')
    .get(storeId, ownerId) as Record<string, unknown> | undefined;
}

function formatStoreWithStats(store: Record<string, unknown>) {
  const storeId = Number(store.id);
  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE store_id = ?) as productCount,
        (SELECT COUNT(*) FROM products WHERE store_id = ? AND is_published = 1) as publishedProductCount,
        (SELECT COUNT(*) FROM products WHERE store_id = ? AND stock <= 5) as lowStockCount,
        (SELECT COUNT(*) FROM orders WHERE store_id = ?) as orderCount,
        (SELECT COUNT(*) FROM orders WHERE store_id = ? AND status = 'pending') as pendingOrders,
        (SELECT COUNT(*) FROM orders WHERE store_id = ? AND status = 'processing') as processingOrders,
        (SELECT COUNT(*) FROM orders WHERE store_id = ? AND status = 'shipped') as shippedOrders,
        (SELECT COUNT(*) FROM orders WHERE store_id = ? AND status = 'delivered') as deliveredOrders,
        (SELECT COUNT(*) FROM orders WHERE store_id = ? AND status = 'cancelled') as cancelledOrders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE store_id = ? AND status != 'cancelled') as totalRevenue,
        (SELECT COALESCE(AVG(total_amount), 0) FROM orders WHERE store_id = ? AND status != 'cancelled') as averageOrderValue,
        (SELECT COUNT(*) FROM store_integration_keys WHERE store_id = ?) as keyCount`
    )
    .get(
      storeId,
      storeId,
      storeId,
      storeId,
      storeId,
      storeId,
      storeId,
      storeId,
      storeId,
      storeId,
      storeId,
      storeId
    ) as Record<string, number>;

  return {
    ...store,
    is_active: Boolean(store.is_active),
    announcement_enabled: Boolean(store.announcement_enabled),
    enable_cod: Boolean(store.enable_cod),
    enable_card: Boolean(store.enable_card),
    express_checkout: Boolean(store.express_checkout),
    publicPath: `/store/${String(store.slug)}`,
    stats,
  };
}

const DEFAULT_HERO_IMAGES = [
  '/src/assets/images/store_hero_artisan_1794923524198.jpg',
  '/src/assets/images/product_brass_lamp_1794923525843.jpg',
  '/src/assets/images/product_leather_bag_1794923526250.jpg',
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', platform: 'youstor' });
  });

  // ---------------------------------------------------------------------------
  // Auth Routes
  // ---------------------------------------------------------------------------
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, storeName, storeCategory, currency } = req.body ?? {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPass = typeof password === 'string' ? password : '';

    if (cleanName.length < 2 || !cleanEmail.includes('@') || cleanPass.length < 6) {
      res.status(400).json({ error: 'يرجى إدخال الاسم، بريد إلكتروني صحيح، وكلمة مرور من 6 أحرف على الأقل.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً.' });
      return;
    }

    const createAccountTx = db.transaction(() => {
      const passHash = hashPassword(cleanPass);
      const userRes = db
        .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(cleanName, cleanEmail, passHash, 'seller');
      const userId = Number(userRes.lastInsertRowid);

      let createdStore: Record<string, unknown> | null = null;
      if (typeof storeName === 'string' && storeName.trim().length >= 2) {
        const cleanStoreName = storeName.trim();
        const slug = generateUniqueStoreSlug(cleanStoreName, (candidate) => {
          return Boolean(db.prepare('SELECT id FROM stores WHERE slug = ?').get(candidate));
        });
        const chosenCurrency =
          typeof currency === 'string' && SUPPORTED_CURRENCIES.includes(currency) ? currency : 'MAD';
        const storeRes = db
          .prepare(
            `INSERT INTO stores (owner_id, name, slug, tagline, category, currency, accent_color, hero_image, is_active, shipping_fee, free_shipping_threshold, announcement_text, whatsapp_number)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 'التوصيل مجاني لجميع المدن · الدفع عند الاستلام متاح', '+212 641-747082')`
          )
          .run(
            userId,
            cleanStoreName,
            slug,
            `مرحباً بكم في ${cleanStoreName} — تسوقوا أحدث المنتجات مع توصيل مجاني لجميع المدن.`,
            typeof storeCategory === 'string' && storeCategory.trim() ? storeCategory.trim() : 'عام',
            chosenCurrency,
            '#DB2777',
            DEFAULT_HERO_IMAGES[0]
          );
        const storeId = Number(storeRes.lastInsertRowid);

        const rawSyncKey = generateApiKey('yst_sync_');
        const enc = encryptKey(rawSyncKey);
        db.prepare(
          `INSERT INTO store_integration_keys (store_id, key_name, key_label, key_prefix, encrypted_value, iv, auth_tag)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          storeId,
          'storefront_sync_token',
          'مفتاح مزامنة المتجر الداخلي',
          enc.keyPrefix,
          enc.encryptedValue,
          enc.iv,
          enc.authTag
        );

        db.prepare(
          `INSERT INTO sync_events (store_id, direction, event_type, summary)
           VALUES (?, 'seller_to_storefront', 'store_provisioned', ?)`
        ).run(storeId, `تم إنشاء المتجر وتوليد الرابط المستقل /store/${slug} وتشفير مفتاح الربط.`);

        const storeRow = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as Record<
          string,
          unknown
        >;
        createdStore = formatStoreWithStats(storeRow);
      }

      return { userId, createdStore };
    });

    try {
      const { userId, createdStore } = createAccountTx();
      const token = signSessionToken({
        userId,
        email: cleanEmail,
        name: cleanName,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      setSessionCookie(res, token);
      res.status(201).json({
        token,
        user: { id: userId, name: cleanName, email: cleanEmail },
        createdStore,
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'تعذر إنشاء الحساب حالياً.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPass = typeof password === 'string' ? password : '';

    const userRow = db
      .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
      .get(cleanEmail) as
      | { id: number; name: string; email: string; password_hash: string }
      | undefined;

    if (!userRow || !verifyPassword(cleanPass, userRow.password_hash)) {
      res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
      return;
    }

    const token = signSessionToken({
      userId: userRow.id,
      email: userRow.email,
      name: userRow.name,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    setSessionCookie(res, token);

    res.json({
      token,
      user: { id: userRow.id, name: userRow.name, email: userRow.email },
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('youstor_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const stores = db
      .prepare('SELECT * FROM stores WHERE owner_id = ? ORDER BY created_at DESC')
      .all(req.user!.id) as Record<string, unknown>[];

    res.json({
      user: req.user,
      stores: stores.map(formatStoreWithStats),
    });
  });

  // ---------------------------------------------------------------------------
  // Seller Dashboard Protected Internal API
  // ---------------------------------------------------------------------------
  app.get('/api/seller/stores', requireAuth, (req: AuthenticatedRequest, res) => {
    const stores = db
      .prepare('SELECT * FROM stores WHERE owner_id = ? ORDER BY id DESC')
      .all(req.user!.id) as Record<string, unknown>[];

    res.json({ stores: stores.map(formatStoreWithStats) });
  });

  app.post('/api/seller/stores', requireAuth, (req: AuthenticatedRequest, res) => {
    const { name, tagline, category, currency, accentColor, customSlug } = req.body ?? {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (cleanName.length < 2) {
      res.status(400).json({ error: 'اسم المتجر يجب أن يكون حرفين على الأقل.' });
      return;
    }

    const requestedSlug = typeof customSlug === 'string' && customSlug.trim() ? customSlug.trim() : cleanName;
    const slug = generateUniqueStoreSlug(requestedSlug, (candidate) => {
      return Boolean(db.prepare('SELECT id FROM stores WHERE slug = ?').get(candidate));
    });

    const cleanTagline =
      typeof tagline === 'string' && tagline.trim()
        ? tagline.trim()
        : `تشكيلة مختارة من ${cleanName} متوفرة الآن للطلب المباشر.`;
    const cleanCategory = typeof category === 'string' && category.trim() ? category.trim() : 'عام';
    const cleanCurrency =
      typeof currency === 'string' && SUPPORTED_CURRENCIES.includes(currency) ? currency : 'MAD';
    const cleanAccent =
      typeof accentColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(accentColor)
        ? accentColor
        : '#DB2777';
    const heroImg = DEFAULT_HERO_IMAGES[Math.floor(Math.random() * DEFAULT_HERO_IMAGES.length)];

    const createStoreTx = db.transaction(() => {
      const storeRes = db
        .prepare(
          `INSERT INTO stores (owner_id, name, slug, tagline, category, currency, accent_color, hero_image, is_active, shipping_fee, free_shipping_threshold, announcement_text, whatsapp_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 'التوصيل مجاني لجميع المدن · الدفع عند الاستلام متاح', '+212 641-747082')`
        )
        .run(req.user!.id, cleanName, slug, cleanTagline, cleanCategory, cleanCurrency, cleanAccent, heroImg);
      const storeId = Number(storeRes.lastInsertRowid);

      const rawSyncKey = generateApiKey('yst_sync_');
      const enc = encryptKey(rawSyncKey);
      db.prepare(
        `INSERT INTO store_integration_keys (store_id, key_name, key_label, key_prefix, encrypted_value, iv, auth_tag)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        storeId,
        'storefront_sync_token',
        'مفتاح مزامنة المتجر الداخلي',
        enc.keyPrefix,
        enc.encryptedValue,
        enc.iv,
        enc.authTag
      );

      db.prepare(
        `INSERT INTO sync_events (store_id, direction, event_type, summary)
         VALUES (?, 'seller_to_storefront', 'store_provisioned', ?)`
      ).run(storeId, `تم إنشاء المتجر "${cleanName}" وتفعيل الرابط المستقل /store/${slug}`);

      const storeRow = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as Record<
        string,
        unknown
      >;
      return { store: formatStoreWithStats(storeRow), initialSyncKey: rawSyncKey };
    });

    const result = createStoreTx();
    res.status(201).json(result);
  });

  app.patch('/api/seller/stores/:storeId', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    const store = getOwnedStore(storeId, req.user!.id);
    if (!store) {
      res.status(404).json({ error: 'المتجر غير موجود أو لا تملك صلاحية تعديله.' });
      return;
    }

    const body = req.body ?? {};
    const nextName =
      typeof body.name === 'string' && body.name.trim().length >= 2
        ? body.name.trim()
        : String(store.name);
    const nextTagline =
      typeof body.tagline === 'string' ? body.tagline.trim() : String(store.tagline);
    const nextCat =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim()
        : String(store.category);
    const nextCurrency =
      typeof body.currency === 'string' && SUPPORTED_CURRENCIES.includes(body.currency)
        ? body.currency
        : String(store.currency);
    const nextAccent =
      typeof body.accent_color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.accent_color)
        ? body.accent_color
        : String(store.accent_color);
    const nextHero =
      typeof body.hero_image === 'string' && body.hero_image.trim()
        ? body.hero_image.trim()
        : String(store.hero_image);
    const nextActive =
      typeof body.is_active === 'boolean' ? (body.is_active ? 1 : 0) : Number(store.is_active);

    let nextSlug = String(store.slug);
    if (typeof body.slug === 'string' && body.slug.trim() && body.slug.trim() !== nextSlug) {
      const candidate = body.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (candidate.length >= 3) {
        const collision = db
          .prepare('SELECT id FROM stores WHERE slug = ? AND id != ?')
          .get(candidate, storeId);
        if (collision) {
          res.status(409).json({ error: 'معرّف الرابط مستخدم بالفعل لمتجر آخر.' });
          return;
        }
        nextSlug = candidate;
      }
    }

    const nextAnnouncementText =
      typeof body.announcement_text === 'string'
        ? body.announcement_text.trim()
        : String(store.announcement_text ?? '');
    const nextAnnouncementEnabled =
      typeof body.announcement_enabled === 'boolean'
        ? body.announcement_enabled
          ? 1
          : 0
        : Number(store.announcement_enabled ?? 1);
    const nextShippingFee =
      body.shipping_fee !== undefined && Number(body.shipping_fee) >= 0
        ? Number(body.shipping_fee)
        : Number(store.shipping_fee ?? 0);
    const nextFreeThreshold =
      body.free_shipping_threshold !== undefined && Number(body.free_shipping_threshold) >= 0
        ? Number(body.free_shipping_threshold)
        : Number(store.free_shipping_threshold ?? 0);
    const nextDeliveryEstimate =
      typeof body.delivery_estimate === 'string'
        ? body.delivery_estimate.trim()
        : String(store.delivery_estimate ?? '24 - 48 ساعة');
    const nextEnableCod =
      typeof body.enable_cod === 'boolean'
        ? body.enable_cod
          ? 1
          : 0
        : Number(store.enable_cod ?? 1);
    const nextEnableCard =
      typeof body.enable_card === 'boolean'
        ? body.enable_card
          ? 1
          : 0
        : Number(store.enable_card ?? 1);
    const nextExpressCheckout =
      typeof body.express_checkout === 'boolean'
        ? body.express_checkout
          ? 1
          : 0
        : Number(store.express_checkout ?? 1);
    const nextWhatsapp =
      typeof body.whatsapp_number === 'string'
        ? body.whatsapp_number.trim()
        : String(store.whatsapp_number ?? '');
    const nextSupportEmail =
      typeof body.support_email === 'string'
        ? body.support_email.trim()
        : String(store.support_email ?? '');
    const nextReturnPolicy =
      typeof body.return_policy === 'string'
        ? body.return_policy.trim()
        : String(store.return_policy ?? '');

    db.prepare(
      `UPDATE stores SET
         name = ?, slug = ?, tagline = ?, category = ?, currency = ?, accent_color = ?, hero_image = ?, is_active = ?,
         announcement_text = ?, announcement_enabled = ?, shipping_fee = ?, free_shipping_threshold = ?,
         delivery_estimate = ?, enable_cod = ?, enable_card = ?, express_checkout = ?,
         whatsapp_number = ?, support_email = ?, return_policy = ?
       WHERE id = ?`
    ).run(
      nextName,
      nextSlug,
      nextTagline,
      nextCat,
      nextCurrency,
      nextAccent,
      nextHero,
      nextActive,
      nextAnnouncementText,
      nextAnnouncementEnabled,
      nextShippingFee,
      nextFreeThreshold,
      nextDeliveryEstimate,
      nextEnableCod,
      nextEnableCard,
      nextExpressCheckout,
      nextWhatsapp,
      nextSupportEmail,
      nextReturnPolicy,
      storeId
    );

    db.prepare(
      `INSERT INTO sync_events (store_id, direction, event_type, summary)
       VALUES (?, 'seller_to_storefront', 'store_updated', ?)`
    ).run(storeId, `تحديث إعدادات المتجر (${nextName}) ومزامنتها مع الواجهة العامة`);

    const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as Record<string, unknown>;
    res.json({ store: formatStoreWithStats(updated) });
  });

  // Products CRUD
  app.get('/api/seller/stores/:storeId/products', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    if (!getOwnedStore(storeId, req.user!.id)) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }
    const products = db
      .prepare('SELECT * FROM products WHERE store_id = ? ORDER BY id DESC')
      .all(storeId) as Record<string, unknown>[];
    res.json({
      products: products.map((p) => ({ ...p, is_published: Boolean(p.is_published) })),
    });
  });

  app.post('/api/seller/stores/:storeId/products', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    if (!getOwnedStore(storeId, req.user!.id)) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }

    const {
      name,
      sku,
      category,
      description,
      price,
      compare_at_price,
      stock,
      image_url,
      is_published,
    } = req.body ?? {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const numPrice = Number(price);
    const numCompareAt =
      compare_at_price !== undefined && compare_at_price !== null && compare_at_price !== '' && Number(compare_at_price) > numPrice
        ? Number(compare_at_price)
        : null;
    const numStock = Math.max(0, Math.floor(Number(stock ?? 0)));

    if (cleanName.length < 2 || !Number.isFinite(numPrice) || numPrice <= 0) {
      res.status(400).json({ error: 'يرجى إدخال اسم منتج صحيح وسعر أكبر من صفر.' });
      return;
    }

    const cleanSku =
      typeof sku === 'string' && sku.trim()
        ? sku.trim().toUpperCase()
        : `SKU-${Math.floor(1000 + Math.random() * 9000)}`;
    const cleanCategory = typeof category === 'string' && category.trim() ? category.trim() : 'منتجات';
    const cleanDesc = typeof description === 'string' ? description.trim() : '';
    const cleanImage =
      typeof image_url === 'string' && image_url.trim()
        ? image_url.trim()
        : '/src/assets/images/product_ceramic_vase_1794923525595.jpg';
    const published = is_published === false ? 0 : 1;

    const result = db
      .prepare(
        `INSERT INTO products (store_id, name, sku, category, description, price, compare_at_price, stock, image_url, is_published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        storeId,
        cleanName,
        cleanSku,
        cleanCategory,
        cleanDesc,
        numPrice,
        numCompareAt,
        numStock,
        cleanImage,
        published
      );

    const productId = Number(result.lastInsertRowid);
    db.prepare(
      `INSERT INTO sync_events (store_id, direction, event_type, summary)
       VALUES (?, 'seller_to_storefront', 'catalog_sync', ?)`
    ).run(storeId, `إضافة المنتج "${cleanName}" (${cleanSku}) إلى كتالوج المتجر العام`);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<
      string,
      unknown
    >;
    res.status(201).json({ product: { ...product, is_published: Boolean(product.is_published) } });
  });

  app.patch(
    '/api/seller/stores/:storeId/products/:productId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const storeId = Number(req.params.storeId);
      const productId = Number(req.params.productId);
      if (!getOwnedStore(storeId, req.user!.id)) {
        res.status(404).json({ error: 'المتجر غير موجود.' });
        return;
      }

      const existing = db
        .prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
        .get(productId, storeId) as Record<string, unknown> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'المنتج غير موجود.' });
        return;
      }

      const {
        name,
        sku,
        category,
        description,
        price,
        compare_at_price,
        stock,
        image_url,
        is_published,
      } = req.body ?? {};
      const nextName = typeof name === 'string' && name.trim() ? name.trim() : String(existing.name);
      const nextSku = typeof sku === 'string' && sku.trim() ? sku.trim().toUpperCase() : String(existing.sku);
      const nextCat =
        typeof category === 'string' && category.trim() ? category.trim() : String(existing.category);
      const nextDesc = typeof description === 'string' ? description.trim() : String(existing.description);
      const nextPrice = price !== undefined && Number(price) > 0 ? Number(price) : Number(existing.price);
      let nextCompareAt: number | null =
        existing.compare_at_price !== null && existing.compare_at_price !== undefined
          ? Number(existing.compare_at_price)
          : null;
      if (compare_at_price !== undefined) {
        nextCompareAt =
          compare_at_price !== null && compare_at_price !== '' && Number(compare_at_price) > nextPrice
            ? Number(compare_at_price)
            : null;
      }
      const nextStock =
        stock !== undefined && Number.isFinite(Number(stock))
          ? Math.max(0, Math.floor(Number(stock)))
          : Number(existing.stock);
      const nextImg = typeof image_url === 'string' && image_url.trim() ? image_url.trim() : String(existing.image_url);
      const nextPub = typeof is_published === 'boolean' ? (is_published ? 1 : 0) : Number(existing.is_published);

      db.prepare(
        `UPDATE products
         SET name = ?, sku = ?, category = ?, description = ?, price = ?, compare_at_price = ?, stock = ?, image_url = ?, is_published = ?, updated_at = datetime('now')
         WHERE id = ? AND store_id = ?`
      ).run(
        nextName,
        nextSku,
        nextCat,
        nextDesc,
        nextPrice,
        nextCompareAt,
        nextStock,
        nextImg,
        nextPub,
        productId,
        storeId
      );

      db.prepare(
        `INSERT INTO sync_events (store_id, direction, event_type, summary)
         VALUES (?, 'seller_to_storefront', 'inventory_updated', ?)`
      ).run(storeId, `تحديث بيانات ومخزون "${nextName}" (المتوفر: ${nextStock})`);

      const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<
        string,
        unknown
      >;
      res.json({ product: { ...updated, is_published: Boolean(updated.is_published) } });
    }
  );

  app.delete(
    '/api/seller/stores/:storeId/products/:productId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const storeId = Number(req.params.storeId);
      const productId = Number(req.params.productId);
      if (!getOwnedStore(storeId, req.user!.id)) {
        res.status(404).json({ error: 'المتجر غير موجود.' });
        return;
      }
      const existing = db
        .prepare('SELECT name FROM products WHERE id = ? AND store_id = ?')
        .get(productId, storeId) as { name: string } | undefined;
      if (!existing) {
        res.status(404).json({ error: 'المنتج غير موجود.' });
        return;
      }

      db.prepare('DELETE FROM products WHERE id = ? AND store_id = ?').run(productId, storeId);
      db.prepare(
        `INSERT INTO sync_events (store_id, direction, event_type, summary)
         VALUES (?, 'seller_to_storefront', 'catalog_sync', ?)`
      ).run(storeId, `حذف المنتج "${existing.name}" من الكتالوج`);

      res.json({ ok: true });
    }
  );

  // Orders Management
  app.get('/api/seller/stores/:storeId/orders', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    if (!getOwnedStore(storeId, req.user!.id)) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }

    const orders = db
      .prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY id DESC')
      .all(storeId) as Record<string, unknown>[];

    const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const enriched = orders.map((o) => ({
      ...o,
      items: itemStmt.all(Number(o.id)),
    }));

    res.json({ orders: enriched });
  });

  app.patch(
    '/api/seller/stores/:storeId/orders/:orderId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const storeId = Number(req.params.storeId);
      const orderId = Number(req.params.orderId);
      if (!getOwnedStore(storeId, req.user!.id)) {
        res.status(404).json({ error: 'المتجر غير موجود.' });
        return;
      }

      const { status } = req.body ?? {};
      const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (typeof status !== 'string' || !validStatuses.includes(status)) {
        res.status(400).json({ error: 'حالة الطلب غير صالحة.' });
        return;
      }

      const order = db
        .prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?')
        .get(orderId, storeId) as { id: number; status: string; order_number: string } | undefined;

      if (!order) {
        res.status(404).json({ error: 'الطلب غير موجود.' });
        return;
      }

      const updateTx = db.transaction(() => {
        if (order.status !== 'cancelled' && status === 'cancelled') {
          const items = db
            .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
            .all(orderId) as { product_id: number | null; quantity: number }[];
          for (const item of items) {
            if (item.product_id) {
              db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(
                item.quantity,
                item.product_id
              );
            }
          }
        }

        db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
          status,
          orderId
        );

        db.prepare(
          `INSERT INTO sync_events (store_id, direction, event_type, summary)
           VALUES (?, 'seller_to_storefront', 'order_updated', ?)`
        ).run(storeId, `تحديث حالة الطلب ${order.order_number} إلى "${status}"`);
      });

      updateTx();

      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<
        string,
        unknown
      >;
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
      res.json({ order: { ...updated, items } });
    }
  );

  // Encrypted Integration Keys Management
  app.get('/api/seller/stores/:storeId/keys', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    if (!getOwnedStore(storeId, req.user!.id)) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }

    const keys = db
      .prepare(
        `SELECT id, store_id, key_name, key_label, key_prefix, last_rotated_at, created_at
         FROM store_integration_keys WHERE store_id = ? ORDER BY id ASC`
      )
      .all(storeId) as Record<string, unknown>[];

    res.json({
      algorithm: 'AES-256-GCM',
      keys: keys.map((k) => ({ ...k, encrypted: true })),
    });
  });

  app.post('/api/seller/stores/:storeId/keys', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    if (!getOwnedStore(storeId, req.user!.id)) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }

    const { keyName, keyLabel, customSecret } = req.body ?? {};
    const cleanKeyName =
      typeof keyName === 'string' && keyName.trim()
        ? keyName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
        : `integration_${Date.now()}`;
    const cleanLabel =
      typeof keyLabel === 'string' && keyLabel.trim() ? keyLabel.trim() : 'مفتاح ربط API مخصص';

    const plaintext =
      typeof customSecret === 'string' && customSecret.trim().length >= 8
        ? customSecret.trim()
        : generateApiKey('yst_key_');

    const encrypted = encryptKey(plaintext);

    const existing = db
      .prepare('SELECT id FROM store_integration_keys WHERE store_id = ? AND key_name = ?')
      .get(storeId, cleanKeyName) as { id: number } | undefined;

    let keyId: number;
    if (existing) {
      db.prepare(
        `UPDATE store_integration_keys
         SET key_label = ?, key_prefix = ?, encrypted_value = ?, iv = ?, auth_tag = ?, last_rotated_at = datetime('now')
         WHERE id = ?`
      ).run(
        cleanLabel,
        encrypted.keyPrefix,
        encrypted.encryptedValue,
        encrypted.iv,
        encrypted.authTag,
        existing.id
      );
      keyId = existing.id;
    } else {
      const insertRes = db
        .prepare(
          `INSERT INTO store_integration_keys (store_id, key_name, key_label, key_prefix, encrypted_value, iv, auth_tag)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          storeId,
          cleanKeyName,
          cleanLabel,
          encrypted.keyPrefix,
          encrypted.encryptedValue,
          encrypted.iv,
          encrypted.authTag
        );
      keyId = Number(insertRes.lastInsertRowid);
    }

    db.prepare(
      `INSERT INTO sync_events (store_id, direction, event_type, summary)
       VALUES (?, 'seller_to_storefront', 'key_rotated', ?)`
    ).run(storeId, `تشفير وحفظ مفتاح الربط "${cleanLabel}" (${encrypted.keyPrefix}) في قاعدة البيانات المركزية`);

    const keyRow = db
      .prepare(
        `SELECT id, store_id, key_name, key_label, key_prefix, last_rotated_at, created_at
         FROM store_integration_keys WHERE id = ?`
      )
      .get(keyId);

    res.status(201).json({
      key: keyRow,
      revealedOnce: plaintext,
      algorithm: 'AES-256-GCM',
    });
  });

  app.post(
    '/api/seller/stores/:storeId/keys/:keyId/verify',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const storeId = Number(req.params.storeId);
      const keyId = Number(req.params.keyId);
      if (!getOwnedStore(storeId, req.user!.id)) {
        res.status(404).json({ error: 'المتجر غير موجود.' });
        return;
      }

      const keyRow = db
        .prepare('SELECT * FROM store_integration_keys WHERE id = ? AND store_id = ?')
        .get(keyId, storeId) as
        | {
            id: number;
            key_label: string;
            key_prefix: string;
            encrypted_value: string;
            iv: string;
            auth_tag: string;
          }
        | undefined;

      if (!keyRow) {
        res.status(404).json({ error: 'المفتاح غير موجود.' });
        return;
      }

      try {
        const decrypted = decryptKey(keyRow.encrypted_value, keyRow.iv, keyRow.auth_tag);
        res.json({
          verified: decrypted.length > 0,
          algorithm: 'AES-256-GCM',
          keyPrefix: keyRow.key_prefix,
          verifiedAt: new Date().toISOString(),
        });
      } catch {
        res.status(500).json({ verified: false, error: 'فشل التحقق من التوقيع التشفيري للمفتاح.' });
      }
    }
  );

  app.get('/api/seller/stores/:storeId/sync-events', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    if (!getOwnedStore(storeId, req.user!.id)) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }

    const events = db
      .prepare('SELECT * FROM sync_events WHERE store_id = ? ORDER BY id DESC LIMIT 25')
      .all(storeId);
    res.json({ events });
  });

  app.get('/api/seller/stores/:storeId/analytics', requireAuth, (req: AuthenticatedRequest, res) => {
    const storeId = Number(req.params.storeId);
    if (!getOwnedStore(storeId, req.user!.id)) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }

    const rawDays = Number(req.query.days ?? 14);
    const days = [7, 14, 30].includes(rawDays) ? rawDays : 14;

    const visitRows = db
      .prepare('SELECT visit_date, visits FROM store_daily_visits WHERE store_id = ?')
      .all(storeId) as Array<{ visit_date: string; visits: number }>;
    const visitMap = new Map(visitRows.map((r) => [r.visit_date, Number(r.visits)]));

    const salesRows = db
      .prepare(
        `SELECT substr(created_at, 1, 10) as order_date,
                COALESCE(SUM(total_amount), 0) as sales,
                COUNT(*) as orders
         FROM orders
         WHERE store_id = ? AND status != 'cancelled'
         GROUP BY substr(created_at, 1, 10)`
      )
      .all(storeId) as Array<{ order_date: string; sales: number; orders: number }>;
    const salesMap = new Map(
      salesRows.map((r) => [r.order_date, { sales: Number(r.sales), orders: Number(r.orders) }])
    );

    const series: Array<{
      date: string;
      label: string;
      visits: number;
      sales: number;
      orders: number;
    }> = [];

    let totalVisits = 0;
    let totalSales = 0;
    let totalOrders = 0;

    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const isoDate = d.toISOString().slice(0, 10);
      const label = `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
      const visits = visitMap.get(isoDate) ?? 0;
      const daySales = salesMap.get(isoDate)?.sales ?? 0;
      const dayOrders = salesMap.get(isoDate)?.orders ?? 0;

      totalVisits += visits;
      totalSales = Number((totalSales + daySales).toFixed(2));
      totalOrders += dayOrders;

      series.push({
        date: isoDate,
        label,
        visits,
        sales: daySales,
        orders: dayOrders,
      });
    }

    const conversionRate =
      totalVisits > 0 ? Number(((totalOrders / totalVisits) * 100).toFixed(2)) : 0;

    res.json({
      days,
      summary: {
        totalVisits,
        totalSales,
        totalOrders,
        avgDailyVisits: Math.round(totalVisits / days),
        conversionRate,
      },
      series,
    });
  });

  // ---------------------------------------------------------------------------
  // Public Storefront Internal API
  // ---------------------------------------------------------------------------
  app.get('/api/storefront/directory', (_req, res) => {
    const stores = db
      .prepare(
        `SELECT s.id, s.name, s.slug, s.tagline, s.category, s.currency, s.accent_color, s.hero_image,
                (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id AND p.is_published = 1) as productCount
         FROM stores s
         WHERE s.is_active = 1
         ORDER BY s.id ASC`
      )
      .all();
    res.json({ stores });
  });

  app.get('/api/storefront/:slug', (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const store = db
      .prepare(
        `SELECT id, name, slug, tagline, category, currency, accent_color, hero_image, is_active,
                announcement_text, announcement_enabled, shipping_fee, free_shipping_threshold,
                delivery_estimate, enable_cod, enable_card, express_checkout,
                whatsapp_number, support_email, return_policy, created_at
         FROM stores WHERE slug = ?`
      )
      .get(slug) as Record<string, unknown> | undefined;

    if (!store || !store.is_active) {
      res.status(404).json({ error: 'عذراً، هذا المتجر غير متاح أو الرابط غير صحيح.' });
      return;
    }

    // Track real daily storefront visit
    const todayIso = new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO store_daily_visits (store_id, visit_date, visits)
       VALUES (?, ?, 1)
       ON CONFLICT(store_id, visit_date) DO UPDATE SET visits = visits + 1`
    ).run(Number(store.id), todayIso);

    const syncKeyRow = db
      .prepare(
        `SELECT encrypted_value, iv, auth_tag FROM store_integration_keys
         WHERE store_id = ? AND key_name = 'storefront_sync_token'`
      )
      .get(Number(store.id)) as
      | { encrypted_value: string; iv: string; auth_tag: string }
      | undefined;

    let syncChannelVerified = false;
    if (syncKeyRow) {
      try {
        const token = decryptKey(syncKeyRow.encrypted_value, syncKeyRow.iv, syncKeyRow.auth_tag);
        syncChannelVerified = token.startsWith('yst_');
      } catch {
        syncChannelVerified = false;
      }
    }

    const products = db
      .prepare(
        `SELECT id, store_id, name, sku, category, description, price, compare_at_price, stock, image_url
         FROM products
         WHERE store_id = ? AND is_published = 1
         ORDER BY id DESC`
      )
      .all(Number(store.id));

    res.json({
      store: {
        ...store,
        announcement_enabled: Boolean(store.announcement_enabled),
        enable_cod: Boolean(store.enable_cod),
        enable_card: Boolean(store.enable_card),
        express_checkout: Boolean(store.express_checkout),
        syncChannelVerified,
      },
      products,
    });
  });

  app.post('/api/storefront/:slug/orders', (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const store = db
      .prepare(
        `SELECT id, name, currency, is_active, shipping_fee, free_shipping_threshold, enable_cod, enable_card
         FROM stores WHERE slug = ?`
      )
      .get(slug) as
      | {
          id: number;
          name: string;
          currency: string;
          is_active: number;
          shipping_fee: number;
          free_shipping_threshold: number;
          enable_cod: number;
          enable_card: number;
        }
      | undefined;

    if (!store || !store.is_active) {
      res.status(404).json({ error: 'المتجر غير متاح لاستقبال الطلبات حالياً.' });
      return;
    }

    const { customerName, customerPhone, customerEmail, shippingAddress, city, paymentMethod, notes, items } =
      req.body ?? {};

    const cleanCustomer = typeof customerName === 'string' ? customerName.trim() : '';
    const cleanPhone = typeof customerPhone === 'string' ? customerPhone.trim() : '';
    const cleanAddress = typeof shippingAddress === 'string' ? shippingAddress.trim() : '';
    const cleanCity = typeof city === 'string' ? city.trim() : '';

    if (
      cleanCustomer.length < 2 ||
      cleanPhone.length < 7 ||
      cleanAddress.length < 4 ||
      cleanCity.length < 2 ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      res.status(400).json({ error: 'يرجى استكمال بيانات المستلم والعنوان والتأكد من وجود منتجات في السلة.' });
      return;
    }

    const cleanPay = paymentMethod === 'card' ? 'card' : 'cod';
    if (cleanPay === 'card' && !store.enable_card) {
      res.status(400).json({ error: 'الدفع بالبطاقة غير مفعل في هذا المتجر حالياً.' });
      return;
    }
    if (cleanPay === 'cod' && !store.enable_cod) {
      res.status(400).json({ error: 'الدفع عند الاستلام غير مفعل في هذا المتجر حالياً.' });
      return;
    }

    const checkoutTx = db.transaction(() => {
      let itemsSubtotal = 0;
      const resolvedItems: Array<{
        productId: number;
        name: string;
        unitPrice: number;
        quantity: number;
        subtotal: number;
      }> = [];

      for (const rawItem of items) {
        const productId = Number(rawItem?.productId);
        const qty = Math.floor(Number(rawItem?.quantity));
        if (!Number.isFinite(productId) || !Number.isFinite(qty) || qty < 1) {
          throw new Error('INVALID_ITEM');
        }

        const product = db
          .prepare('SELECT id, name, price, stock, is_published FROM products WHERE id = ? AND store_id = ?')
          .get(productId, store.id) as
          | { id: number; name: string; price: number; stock: number; is_published: number }
          | undefined;

        if (!product || !product.is_published) {
          throw new Error('PRODUCT_NOT_FOUND');
        }
        if (product.stock < qty) {
          throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
        }

        db.prepare('UPDATE products SET stock = stock - ?, updated_at = datetime("now") WHERE id = ?').run(
          qty,
          product.id
        );

        const subtotal = Number((product.price * qty).toFixed(2));
        itemsSubtotal = Number((itemsSubtotal + subtotal).toFixed(2));
        resolvedItems.push({
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: qty,
          subtotal,
        });
      }

      const threshold = Number(store.free_shipping_threshold ?? 0);
      const baseFee = Number(store.shipping_fee ?? 0);
      const shippingFee = threshold > 0 && itemsSubtotal >= threshold ? 0 : baseFee;
      const totalAmount = Number((itemsSubtotal + shippingFee).toFixed(2));

      const orderNum = `ORD-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-3)}`;
      const orderRes = db
        .prepare(
          `INSERT INTO orders (store_id, order_number, customer_name, customer_phone, customer_email, shipping_address, city, payment_method, status, shipping_fee, total_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
        )
        .run(
          store.id,
          orderNum,
          cleanCustomer,
          cleanPhone,
          typeof customerEmail === 'string' ? customerEmail.trim() : '',
          cleanAddress,
          cleanCity,
          cleanPay,
          shippingFee,
          totalAmount,
          typeof notes === 'string' ? notes.trim() : ''
        );

      const orderId = Number(orderRes.lastInsertRowid);
      const insertItemStmt = db.prepare(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const item of resolvedItems) {
        insertItemStmt.run(orderId, item.productId, item.name, item.unitPrice, item.quantity, item.subtotal);
      }

      db.prepare(
        `INSERT INTO sync_events (store_id, direction, event_type, summary)
         VALUES (?, 'storefront_to_seller', 'order_created', ?)`
      ).run(store.id, `طلب جديد ${orderNum} من ${cleanCustomer} بقيمة ${totalAmount} ${store.currency}`);

      return {
        orderNumber: orderNum,
        status: 'pending',
        subtotal: itemsSubtotal,
        shippingFee,
        totalAmount,
        currency: store.currency,
        items: resolvedItems,
        createdAt: new Date().toISOString(),
      };
    });

    try {
      const receipt = checkoutTx();
      res.status(201).json({ order: receipt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('INSUFFICIENT_STOCK:')) {
        const prodName = msg.split(':')[1];
        res.status(409).json({ error: `الكمية المطلوبة غير متوفرة حالياً للمنتج: ${prodName}` });
        return;
      }
      if (msg === 'PRODUCT_NOT_FOUND' || msg === 'INVALID_ITEM') {
        res.status(400).json({ error: 'أحد المنتجات في السلة غير متاح حالياً.' });
        return;
      }
      console.error('Checkout error:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء إتمام الطلب، يرجى المحاولة مرة أخرى.' });
    }
  });

  app.get('/api/storefront/:slug/orders/:orderNumber', (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();

    const store = db.prepare('SELECT id, name, currency FROM stores WHERE slug = ?').get(slug) as
      | { id: number; name: string; currency: string }
      | undefined;
    if (!store) {
      res.status(404).json({ error: 'المتجر غير موجود.' });
      return;
    }

    const order = db
      .prepare(
        `SELECT id, order_number, customer_name, city, payment_method, status, shipping_fee, total_amount, created_at, updated_at
         FROM orders WHERE store_id = ? AND order_number = ?`
      )
      .get(store.id, orderNumber) as Record<string, unknown> | undefined;

    if (!order) {
      res.status(404).json({ error: 'لم يتم العثور على طلب بهذا الرقم في هذا المتجر.' });
      return;
    }

    const items = db
      .prepare('SELECT product_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ?')
      .all(Number(order.id));

    res.json({
      order: {
        ...order,
        currency: store.currency,
        items,
      },
    });
  });

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'المسار المطلوب غير موجود.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`youstor server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start youstor server:', err);
  process.exit(1);
});
