import {
  DirectoryStore,
  IntegrationKey,
  Order,
  OrderStatus,
  Product,
  Store,
  StoreAnalytics,
  SyncEvent,
  User,
} from '../types';

const TOKEN_STORAGE_KEY = 'youstor_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'حدث خطأ في الاتصال بالخادم.');
  }
  return data as T;
}

export function getFullStoreUrl(slug: string): string {
  if (typeof window === 'undefined') return `/store/${slug}`;
  return `${window.location.origin}/store/${slug}`;
}

export const CURRENCY_OPTIONS = [
  { code: 'MAD', label: 'الدرهم المغربي (د.م / MAD)', symbol: 'د.م' },
  { code: 'AED', label: 'الدرهم الإماراتي (د.إ / AED)', symbol: 'د.إ' },
  { code: 'SAR', label: 'الريال السعودي (ر.س / SAR)', symbol: 'ر.س' },
  { code: 'USD', label: 'الدولار الأمريكي (USD)', symbol: '$' },
  { code: 'EUR', label: 'اليورو (EUR)', symbol: '€' },
  { code: 'KWD', label: 'الدينار الكويتي (KWD)', symbol: 'د.ك' },
];

export function formatMoney(amount: number, currency = 'MAD'): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const symbolMap: Record<string, string> = {
    MAD: 'د.م',
    AED: 'د.إ',
    SAR: 'ر.س',
    KWD: 'د.ك',
    QAR: 'ر.ق',
    USD: '$',
    EUR: '€',
  };
  const label = symbolMap[currency] || currency;
  return `${formatted} ${label}`;
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; toneClass: string }
> = {
  pending: {
    label: 'بانتظار التأكيد',
    toneClass: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  processing: {
    label: 'قيد التجهيز',
    toneClass: 'text-sky-700 bg-sky-50 border-sky-200',
  },
  shipped: {
    label: 'تم الشحن',
    toneClass: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  },
  delivered: {
    label: 'تم التسليم',
    toneClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  cancelled: {
    label: 'ملغي',
    toneClass: 'text-rose-700 bg-rose-50 border-rose-200',
  },
};

export const api = {
  async register(payload: {
    name: string;
    email: string;
    password: string;
    storeName?: string;
    storeCategory?: string;
    currency?: string;
  }) {
    const res = await apiFetch<{ token: string; user: User; createdStore: Store | null }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setStoredToken(res.token);
    return res;
  },

  async login(payload: { email: string; password: string }) {
    const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    return res;
  },

  async logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredToken(null);
  },

  me() {
    return apiFetch<{ user: User; stores: Store[] }>('/api/auth/me');
  },

  getSellerStores() {
    return apiFetch<{ stores: Store[] }>('/api/seller/stores');
  },

  createStore(payload: {
    name: string;
    tagline?: string;
    category?: string;
    currency?: string;
    accentColor?: string;
    customSlug?: string;
  }) {
    return apiFetch<{ store: Store; initialSyncKey: string }>('/api/seller/stores', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateStore(storeId: number, payload: Partial<Store>) {
    return apiFetch<{ store: Store }>(`/api/seller/stores/${storeId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  getStoreProducts(storeId: number) {
    return apiFetch<{ products: Product[] }>(`/api/seller/stores/${storeId}/products`);
  },

  createProduct(
    storeId: number,
    payload: {
      name: string;
      sku?: string;
      category: string;
      description: string;
      price: number;
      compare_at_price?: number | null;
      stock: number;
      image_url: string;
      is_published: boolean;
    }
  ) {
    return apiFetch<{ product: Product }>(`/api/seller/stores/${storeId}/products`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateProduct(storeId: number, productId: number, payload: Partial<Product>) {
    return apiFetch<{ product: Product }>(`/api/seller/stores/${storeId}/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteProduct(storeId: number, productId: number) {
    return apiFetch<{ ok: boolean }>(`/api/seller/stores/${storeId}/products/${productId}`, {
      method: 'DELETE',
    });
  },

  getStoreOrders(storeId: number) {
    return apiFetch<{ orders: Order[] }>(`/api/seller/stores/${storeId}/orders`);
  },

  updateOrderStatus(storeId: number, orderId: number, status: OrderStatus) {
    return apiFetch<{ order: Order }>(`/api/seller/stores/${storeId}/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  getStoreKeys(storeId: number) {
    return apiFetch<{ algorithm: string; keys: IntegrationKey[] }>(
      `/api/seller/stores/${storeId}/keys`
    );
  },

  createOrRotateKey(
    storeId: number,
    payload: { keyName?: string; keyLabel: string; customSecret?: string }
  ) {
    return apiFetch<{ key: IntegrationKey; revealedOnce: string; algorithm: string }>(
      `/api/seller/stores/${storeId}/keys`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  verifyKey(storeId: number, keyId: number) {
    return apiFetch<{ verified: boolean; algorithm: string; keyPrefix: string; verifiedAt: string }>(
      `/api/seller/stores/${storeId}/keys/${keyId}/verify`,
      { method: 'POST' }
    );
  },

  getSyncEvents(storeId: number) {
    return apiFetch<{ events: SyncEvent[] }>(`/api/seller/stores/${storeId}/sync-events`);
  },

  getStoreAnalytics(storeId: number, days = 14) {
    return apiFetch<StoreAnalytics>(`/api/seller/stores/${storeId}/analytics?days=${days}`);
  },

  getStorefrontDirectory() {
    return apiFetch<{ stores: DirectoryStore[] }>('/api/storefront/directory');
  },

  getPublicStorefront(slug: string) {
    return apiFetch<{
      store: {
        id: number;
        name: string;
        slug: string;
        tagline: string;
        category: string;
        currency: string;
        accent_color: string;
        hero_image: string;
        announcement_text: string;
        announcement_enabled: boolean;
        shipping_fee: number;
        free_shipping_threshold: number;
        delivery_estimate: string;
        enable_cod: boolean;
        enable_card: boolean;
        express_checkout: boolean;
        whatsapp_number: string;
        support_email: string;
        return_policy: string;
        syncChannelVerified: boolean;
      };
      products: Product[];
    }>(`/api/storefront/${encodeURIComponent(slug)}`);
  },

  placeOrder(
    slug: string,
    payload: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      shippingAddress: string;
      city: string;
      paymentMethod: 'cod' | 'card';
      notes?: string;
      items: Array<{ productId: number; quantity: number }>;
    }
  ) {
    return apiFetch<{
      order: {
        orderNumber: string;
        status: OrderStatus;
        subtotal: number;
        shippingFee: number;
        totalAmount: number;
        currency: string;
        items: Array<{
          productId: number;
          name: string;
          unitPrice: number;
          quantity: number;
          subtotal: number;
        }>;
        createdAt: string;
      };
    }>(`/api/storefront/${encodeURIComponent(slug)}/orders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  trackOrder(slug: string, orderNumber: string) {
    return apiFetch<{
      order: {
        order_number: string;
        customer_name: string;
        city: string;
        payment_method: 'cod' | 'card';
        status: OrderStatus;
        shipping_fee: number;
        total_amount: number;
        currency: string;
        created_at: string;
        items: Array<{
          product_name: string;
          unit_price: number;
          quantity: number;
          subtotal: number;
        }>;
      };
    }>(`/api/storefront/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderNumber)}`);
  },
};
