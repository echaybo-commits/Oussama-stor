import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageCircle,
  Package,
  PackagePlus,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store as StoreIcon,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  CURRENCY_OPTIONS,
  formatMoney,
  getFullStoreUrl,
  ORDER_STATUS_META,
} from '../lib/api';
import {
  IntegrationKey,
  Order,
  OrderStatus,
  Product,
  Store,
  SyncEvent,
  User,
} from '../types';
import { PerformanceAnalytics } from './PerformanceAnalytics';
import { ResilientImage } from './ResilientImage';

interface SellerDashboardProps {
  onNavigate: (path: string) => void;
}

type DashboardTab =
  | 'overview'
  | 'analytics'
  | 'add-product'
  | 'products'
  | 'orders'
  | 'keys'
  | 'settings';
type SettingsSection = 'identity' | 'shipping' | 'contact';

const PRESET_PRODUCT_IMAGES = [
  {
    label: 'مزهرية خزفية',
    url: '/src/assets/images/product_ceramic_vase_1794923525595.jpg',
  },
  {
    label: 'عطر فاخر',
    url: '/src/assets/images/product_oud_perfume_1794923526915.jpg',
  },
  {
    label: 'مصباح نحاسي',
    url: '/src/assets/images/product_brass_lamp_1794923525843.jpg',
  },
  {
    label: 'حقيبة جلدية',
    url: '/src/assets/images/product_leather_bag_1794923526250.jpg',
  },
];

const ACCENT_CHOICES = ['#DB2777', '#111827', '#0F766E', '#B45309', '#1D4ED8'];

async function resizeImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح.'));
      img.onload = () => {
        const maxDim = 900;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function SellerDashboard({ onNavigate }: SellerDashboardProps) {
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<number | null>(null);

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [firstStoreName, setFirstStoreName] = useState('');
  const [firstStoreCategory, setFirstStoreCategory] = useState('عام');
  const [firstStoreCurrency, setFirstStoreCurrency] = useState('MAD');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Active workspace data
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [keys, setKeys] = useState<IntegrationKey[]>([]);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [copiedStoreUrl, setCopiedStoreUrl] = useState(false);

  // Create Store Modal
  const [createStoreOpen, setCreateStoreOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreCategory, setNewStoreCategory] = useState('تجارة عامة');
  const [newStoreCurrency, setNewStoreCurrency] = useState('MAD');
  const [newStoreTagline, setNewStoreTagline] = useState('');
  const [newStoreAccent, setNewStoreAccent] = useState('#DB2777');
  const [newStoreSlug, setNewStoreSlug] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [createStoreError, setCreateStoreError] = useState<string | null>(null);
  const [provisionedNotice, setProvisionedNotice] = useState<{
    store: Store;
    syncKey?: string;
  } | null>(null);

  // Dedicated Merchant Product Studio state (Add & Edit)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodCategory, setProdCategory] = useState('منتجات');
  const [prodPrice, setProdPrice] = useState('');
  const [prodComparePrice, setProdComparePrice] = useState('');
  const [prodStock, setProdStock] = useState('15');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImage, setProdImage] = useState(PRESET_PRODUCT_IMAGES[0].url);
  const [prodPublished, setProdPublished] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productSavedNotice, setProductSavedNotice] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // Orders filter & expanded row
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Keys state
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeySecret, setNewKeySecret] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [revealedKeyOnce, setRevealedKeyOnce] = useState<string | null>(null);
  const [keyVerifyResults, setKeyVerifyResults] = useState<
    Record<number, { verified: boolean; verifiedAt: string }>
  >({});

  // Comprehensive YouCan-style Store Settings
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('identity');
  const [settingsName, setSettingsName] = useState('');
  const [settingsSlug, setSettingsSlug] = useState('');
  const [settingsTagline, setSettingsTagline] = useState('');
  const [settingsCategory, setSettingsCategory] = useState('');
  const [settingsCurrency, setSettingsCurrency] = useState('MAD');
  const [settingsAccent, setSettingsAccent] = useState('#DB2777');
  const [settingsActive, setSettingsActive] = useState(true);
  const [settingsAnnouncementEnabled, setSettingsAnnouncementEnabled] = useState(true);
  const [settingsAnnouncementText, setSettingsAnnouncementText] = useState('');
  const [settingsShippingFee, setSettingsShippingFee] = useState('0');
  const [settingsFreeThreshold, setSettingsFreeThreshold] = useState('0');
  const [settingsDeliveryEst, setSettingsDeliveryEst] = useState('24 - 48 ساعة');
  const [settingsEnableCod, setSettingsEnableCod] = useState(true);
  const [settingsEnableCard, setSettingsEnableCard] = useState(true);
  const [settingsExpressCheckout, setSettingsExpressCheckout] = useState(true);
  const [settingsWhatsapp, setSettingsWhatsapp] = useState('+212 641-747082');
  const [settingsSupportEmail, setSettingsSupportEmail] = useState('');
  const [settingsReturnPolicy, setSettingsReturnPolicy] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === activeStoreId) || null,
    [stores, activeStoreId]
  );

  const fetchSession = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
      setStores(res.stores);
      if (res.stores.length > 0) {
        setActiveStoreId((prev) =>
          prev && res.stores.some((s) => s.id === prev) ? prev : res.stores[0].id
        );
      }
    } catch {
      setUser(null);
      setStores([]);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const loadStoreWorkspace = useCallback(async (storeId: number, silent = false) => {
    if (!silent) setDataLoading(true);
    try {
      const [prodRes, ordRes, keyRes, syncRes, storesRes] = await Promise.all([
        api.getStoreProducts(storeId),
        api.getStoreOrders(storeId),
        api.getStoreKeys(storeId),
        api.getSyncEvents(storeId),
        api.getSellerStores(),
      ]);
      setProducts(prodRes.products);
      setOrders(ordRes.orders);
      setKeys(keyRes.keys);
      setSyncEvents(syncRes.events);
      setStores(storesRes.stores);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeStoreId || !user) return;
    loadStoreWorkspace(activeStoreId);

    const interval = setInterval(() => {
      loadStoreWorkspace(activeStoreId, true);
    }, 6000);
    return () => clearInterval(interval);
  }, [activeStoreId, user, loadStoreWorkspace]);

  useEffect(() => {
    if (activeStore) {
      setSettingsName(activeStore.name);
      setSettingsSlug(activeStore.slug);
      setSettingsTagline(activeStore.tagline);
      setSettingsCategory(activeStore.category);
      setSettingsCurrency(activeStore.currency);
      setSettingsAccent(activeStore.accent_color);
      setSettingsActive(activeStore.is_active);
      setSettingsAnnouncementEnabled(activeStore.announcement_enabled);
      setSettingsAnnouncementText(activeStore.announcement_text || '');
      setSettingsShippingFee(String(activeStore.shipping_fee ?? 0));
      setSettingsFreeThreshold(String(activeStore.free_shipping_threshold ?? 0));
      setSettingsDeliveryEst(activeStore.delivery_estimate || '24 - 48 ساعة');
      setSettingsEnableCod(activeStore.enable_cod);
      setSettingsEnableCard(activeStore.enable_card);
      setSettingsExpressCheckout(activeStore.express_checkout);
      setSettingsWhatsapp(activeStore.whatsapp_number || '+212 641-747082');
      setSettingsSupportEmail(activeStore.support_email || '');
      setSettingsReturnPolicy(activeStore.return_policy || '');
    }
  }, [activeStore]);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      if (authMode === 'login') {
        await api.login({ email: authEmail, password: authPassword });
        await fetchSession();
      } else {
        const res = await api.register({
          name: authName,
          email: authEmail,
          password: authPassword,
          storeName: firstStoreName.trim() || undefined,
          storeCategory: firstStoreCategory,
          currency: firstStoreCurrency,
        });
        await fetchSession();
        if (res.createdStore) {
          setActiveStoreId(res.createdStore.id);
          setProvisionedNotice({ store: res.createdStore });
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'فشل المصادقة.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      await api.login({ email: 'seller@youstor.app', password: 'youstor2026' });
      await fetchSession();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setStores([]);
    setActiveStoreId(null);
  };

  const handleCreateStore = async (e: FormEvent) => {
    e.preventDefault();
    setCreateStoreError(null);
    setCreatingStore(true);
    try {
      const res = await api.createStore({
        name: newStoreName,
        category: newStoreCategory,
        currency: newStoreCurrency,
        tagline: newStoreTagline,
        accentColor: newStoreAccent,
        customSlug: newStoreSlug.trim() || undefined,
      });
      setStores((prev) => [res.store, ...prev]);
      setActiveStoreId(res.store.id);
      setCreateStoreOpen(false);
      setNewStoreName('');
      setNewStoreTagline('');
      setNewStoreSlug('');
      setProvisionedNotice({ store: res.store, syncKey: res.initialSyncKey });
    } catch (err) {
      setCreateStoreError(err instanceof Error ? err.message : 'تعذر إنشاء المتجر.');
    } finally {
      setCreatingStore(false);
    }
  };

  const startNewProduct = () => {
    setEditingProduct(null);
    setProdName('');
    setProdSku('');
    setProdCategory(activeStore?.category || 'منتجات');
    setProdPrice('');
    setProdComparePrice('');
    setProdStock('15');
    setProdDesc('');
    setProdImage(PRESET_PRODUCT_IMAGES[0].url);
    setProdPublished(true);
    setProductError(null);
    setProductSavedNotice(null);
    setActiveTab('add-product');
  };

  const startEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProdName(prod.name);
    setProdSku(prod.sku);
    setProdCategory(prod.category);
    setProdPrice(String(prod.price));
    setProdComparePrice(prod.compare_at_price ? String(prod.compare_at_price) : '');
    setProdStock(String(prod.stock));
    setProdDesc(prod.description);
    setProdImage(prod.image_url || PRESET_PRODUCT_IMAGES[0].url);
    setProdPublished(prod.is_published !== false);
    setProductError(null);
    setProductSavedNotice(null);
    setActiveTab('add-product');
  };

  const handleProductImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setProdImage(dataUrl);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : 'تعذر تحميل الصورة.');
    }
  };

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeStore) return;
    setSavingProduct(true);
    setProductError(null);
    setProductSavedNotice(null);
    try {
      const compareVal = prodComparePrice.trim() ? Number(prodComparePrice) : null;
      if (editingProduct) {
        await api.updateProduct(activeStore.id, editingProduct.id, {
          name: prodName,
          sku: prodSku,
          category: prodCategory,
          description: prodDesc,
          price: Number(prodPrice),
          compare_at_price: compareVal,
          stock: Number(prodStock),
          image_url: prodImage,
          is_published: prodPublished,
        });
        setProductSavedNotice('تم تحديث المنتج ومزامنته مع واجهة المتجر.');
      } else {
        await api.createProduct(activeStore.id, {
          name: prodName,
          sku: prodSku,
          category: prodCategory,
          description: prodDesc,
          price: Number(prodPrice),
          compare_at_price: compareVal,
          stock: Number(prodStock),
          image_url: prodImage,
          is_published: prodPublished,
        });
        setProductSavedNotice('تمت إضافة المنتج ونشره في متجرك المستقل بنجاح!');
        setProdName('');
        setProdSku('');
        setProdPrice('');
        setProdComparePrice('');
        setProdDesc('');
      }
      await loadStoreWorkspace(activeStore.id);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : 'تعذر حفظ المنتج.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!activeStore) return;
    await api.deleteProduct(activeStore.id, productId);
    await loadStoreWorkspace(activeStore.id);
  };

  const handleOrderStatusChange = async (orderId: number, status: OrderStatus) => {
    if (!activeStore) return;
    await api.updateOrderStatus(activeStore.id, orderId, status);
    await loadStoreWorkspace(activeStore.id);
  };

  const handleCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeStore || !newKeyLabel.trim()) return;
    setSavingKey(true);
    setRevealedKeyOnce(null);
    try {
      const res = await api.createOrRotateKey(activeStore.id, {
        keyLabel: newKeyLabel.trim(),
        keyName: newKeyName.trim() || undefined,
        customSecret: newKeySecret.trim() || undefined,
      });
      setRevealedKeyOnce(res.revealedOnce);
      setNewKeyLabel('');
      setNewKeyName('');
      setNewKeySecret('');
      await loadStoreWorkspace(activeStore.id);
    } finally {
      setSavingKey(false);
    }
  };

  const handleVerifyKey = async (keyId: number) => {
    if (!activeStore) return;
    const res = await api.verifyKey(activeStore.id, keyId);
    setKeyVerifyResults((prev) => ({
      ...prev,
      [keyId]: { verified: res.verified, verifiedAt: res.verifiedAt },
    }));
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeStore) return;
    setSavingSettings(true);
    setSettingsSavedMsg(null);
    setSettingsError(null);
    try {
      await api.updateStore(activeStore.id, {
        name: settingsName,
        slug: settingsSlug,
        tagline: settingsTagline,
        category: settingsCategory,
        currency: settingsCurrency,
        accent_color: settingsAccent,
        is_active: settingsActive,
        announcement_enabled: settingsAnnouncementEnabled,
        announcement_text: settingsAnnouncementText,
        shipping_fee: Number(settingsShippingFee) || 0,
        free_shipping_threshold: Number(settingsFreeThreshold) || 0,
        delivery_estimate: settingsDeliveryEst,
        enable_cod: settingsEnableCod,
        enable_card: settingsEnableCard,
        express_checkout: settingsExpressCheckout,
        whatsapp_number: settingsWhatsapp,
        support_email: settingsSupportEmail,
        return_policy: settingsReturnPolicy,
      });
      await loadStoreWorkspace(activeStore.id);
      setSettingsSavedMsg('تم حفظ ومزامنة جميع إعدادات المتجر بنجاح.');
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات.');
    } finally {
      setSavingSettings(false);
    }
  };

  const copyActiveStoreLink = (slug: string) => {
    navigator.clipboard?.writeText(getFullStoreUrl(slug)).catch(() => {});
    setCopiedStoreUrl(true);
    setTimeout(() => setCopiedStoreUrl(false), 1800);
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'all') return orders;
    return orders.filter((o) => o.status === orderStatusFilter);
  }, [orders, orderStatusFilter]);

  const fulfillmentRate = useMemo(() => {
    if (!activeStore || activeStore.stats.orderCount === 0) return 0;
    const valid = activeStore.stats.orderCount - activeStore.stats.cancelledOrders;
    if (valid <= 0) return 0;
    return Math.round((activeStore.stats.deliveredOrders / valid) * 100);
  }, [activeStore]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Seller Auth Gate
  // ---------------------------------------------------------------------------
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
        <header className="bg-white border-b border-zinc-200 px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="font-display text-2xl font-bold text-zinc-900 whitespace-nowrap"
          >
            youstor
          </a>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>العودة للمنصة</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-zinc-900 mb-1.5">لوحة تحكم التاجر</h1>
              <p className="text-sm text-zinc-600">
                سجّل الدخول لإدارة متاجرك ومنتجاتك، أو أنشئ حساباً ومتجراً جديداً برابط مستقل فوراً.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  authMode === 'login' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  authMode === 'register' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                }`}
              >
                تسجيل
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                    الاسم الكامل
                  </label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="مثال: كريم العلمي"
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-pink-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-pink-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-pink-600"
                />
              </div>

              {authMode === 'register' && (
                <div className="pt-3 border-t border-zinc-200 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      اسم متجرك الأول
                    </label>
                    <input
                      type="text"
                      required
                      value={firstStoreName}
                      onChange={(e) => setFirstStoreName(e.target.value)}
                      placeholder="مثال: متجر أطلس للأناقة"
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-pink-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                        التخصص
                      </label>
                      <input
                        type="text"
                        value={firstStoreCategory}
                        onChange={(e) => setFirstStoreCategory(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-pink-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                        العملة
                      </label>
                      <select
                        value={firstStoreCurrency}
                        onChange={(e) => setFirstStoreCurrency(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white focus:outline-none focus:border-pink-600"
                      >
                        {CURRENCY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {authSubmitting
                  ? 'جاري المعالجة...'
                  : authMode === 'login'
                  ? 'دخول إلى لوحة التاجر'
                  : 'تسجيل'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-zinc-200">
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={authSubmitting}
                className="w-full py-2.5 px-4 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
              >
                دخول سريع بحساب التاجر الافتراضي (seller@youstor.app)
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Authenticated Merchant Workspace
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#F9FAFB] text-zinc-900 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-[276px] shrink-0 bg-white border-b lg:border-b-0 lg:border-l border-zinc-200 flex flex-col">
        <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="font-display text-xl font-bold text-zinc-900"
          >
            youstor
          </a>
          <span className="text-xs text-zinc-500">لوحة التاجر</span>
        </div>

        {/* Store Switcher & Independent URL */}
        <div className="p-4 border-b border-zinc-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">المتجر النشط</span>
            <button
              type="button"
              onClick={() => setCreateStoreOpen(true)}
              className="text-xs font-semibold text-pink-600 hover:text-pink-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>متجر جديد</span>
            </button>
          </div>

          {stores.length > 0 ? (
            <>
              <select
                value={activeStore?.id || ''}
                onChange={(e) => setActiveStoreId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-semibold text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-pink-600"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.currency})
                  </option>
                ))}
              </select>

              {activeStore && (
                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>الرابط المستقل للمتجر</span>
                    <span className={activeStore.is_active ? 'text-emerald-700' : 'text-amber-700'}>
                      {activeStore.is_active ? 'نشط' : 'متوقف'}
                    </span>
                  </div>
                  <div
                    className="text-xs font-mono-tabular text-zinc-800 truncate"
                    dir="ltr"
                    title={getFullStoreUrl(activeStore.slug)}
                  >
                    /store/{activeStore.slug}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => copyActiveStoreLink(activeStore.slug)}
                      className="py-1.5 px-2 text-xs font-medium bg-white border border-zinc-200 hover:border-zinc-300 rounded-md inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {copiedStoreUrl ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ الرابط</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(`/store/${activeStore.slug}`)}
                      className="py-1.5 px-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-md inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>فتح المتجر</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={startNewProduct}
                className="w-full py-2.5 px-3 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <PackagePlus className="w-4 h-4" />
                <span>إضافة منتج جديد</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setCreateStoreOpen(true)}
              className="w-full py-2.5 px-3 text-xs font-semibold text-white bg-pink-600 rounded-lg cursor-pointer"
            >
              + إنشاء أول متجر
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto flex-1">
          {[
            { id: 'overview' as const, label: 'نظرة عامة والعدادات', icon: LayoutDashboard },
            { id: 'analytics' as const, label: 'تحليلات الأداء', icon: TrendingUp },
            { id: 'add-product' as const, label: 'استوديو إضافة منتج', icon: PackagePlus },
            { id: 'products' as const, label: 'كتالوج المنتجات', icon: Package },
            { id: 'orders' as const, label: 'إدارة الطلبات', icon: ShoppingCart },
            { id: 'keys' as const, label: 'مفاتيح الربط المشفرة', icon: KeyRound },
            { id: 'settings' as const, label: 'إعدادات المتجر', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg flex items-center gap-2.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-pink-50 text-pink-700'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Support Contact Block */}
        <div className="mx-3 mb-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
          <span className="text-[11px] font-semibold text-zinc-700 block">
            فريق الدعم — تواصل معنا
          </span>
          <a
            href="tel:+212641747082"
            dir="ltr"
            className="text-xs font-mono-tabular font-bold text-zinc-900 hover:text-pink-600 inline-flex items-center gap-1.5"
          >
            <Phone className="w-3.5 h-3.5 text-pink-600" />
            <span>+212 641-747082</span>
          </a>
          <a
            href="https://wa.me/212641747082"
            target="_blank"
            rel="noreferrer"
            className="w-full py-1.5 px-2.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>واتساب الدعم المباشر</span>
          </a>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-zinc-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900 truncate">{user.name}</p>
            <p className="text-[11px] text-zinc-500 truncate" dir="ltr">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="تسجيل الخروج"
            className="p-2 text-zinc-500 hover:text-rose-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-zinc-200 px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 truncate">
            <span>لوحة التاجر</span>
            <span>/</span>
            <span className="font-semibold text-zinc-900 truncate">
              {activeStore ? activeStore.name : 'بدون متجر'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeStore && (
              <button
                type="button"
                onClick={() => loadStoreWorkspace(activeStore.id)}
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
                <span>مزامنة</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreateStoreOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إنشاء متجر</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1200px] w-full mx-auto space-y-6">
          {!activeStore ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
              <StoreIcon className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-zinc-900 mb-2">لا يوجد متجر محدد</h2>
              <p className="text-sm text-zinc-600 mb-6">
                أنشئ متجرك الأول الآن للحصول على رابط مستقل وربطه بلوحة التحكم.
              </p>
              <button
                type="button"
                onClick={() => setCreateStoreOpen(true)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-pink-600 rounded-lg cursor-pointer"
              >
                + إنشاء متجر جديد
              </button>
            </div>
          ) : (
            <>
              {/* Overview & YouCan-Style Counters Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {activeStore.stats.productCount === 0 && (
                    <div className="p-5 bg-white border border-pink-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 mb-1">
                          متجرك جاهز — أضف منتجاتك الخاصة الآن
                        </h3>
                        <p className="text-xs text-zinc-600">
                          لا توجد منتجات مسبقة في المتجر. التوصيل مجاني مفعل تلقائياً ويمكنك إضافة
                          أول منتج لتظهر بطاقته فوراً في واجهة المتجر.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={startNewProduct}
                        className="px-4 py-2.5 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <PackagePlus className="w-4 h-4" />
                        <span>أضف أول منتج</span>
                      </button>
                    </div>
                  )}

                  {/* Primary Financial & Performance Counters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 bg-white border border-zinc-200 rounded-xl">
                      <span className="text-xs text-zinc-500 block mb-2">إجمالي المبيعات</span>
                      <span className="text-2xl font-bold font-mono-tabular text-zinc-900">
                        {formatMoney(activeStore.stats.totalRevenue, activeStore.currency)}
                      </span>
                    </div>
                    <div className="p-5 bg-white border border-zinc-200 rounded-xl">
                      <span className="text-xs text-zinc-500 block mb-2">إجمالي الطلبات</span>
                      <span className="text-2xl font-bold font-mono-tabular text-zinc-900">
                        {activeStore.stats.orderCount}
                      </span>
                    </div>
                    <div className="p-5 bg-white border border-zinc-200 rounded-xl">
                      <span className="text-xs text-zinc-500 block mb-2">متوسط قيمة السلة</span>
                      <span className="text-2xl font-bold font-mono-tabular text-zinc-900">
                        {formatMoney(activeStore.stats.averageOrderValue, activeStore.currency)}
                      </span>
                    </div>
                    <div className="p-5 bg-white border border-zinc-200 rounded-xl">
                      <span className="text-xs text-zinc-500 block mb-2">نسبة إتمام التسليم</span>
                      <span className="text-2xl font-bold font-mono-tabular text-emerald-700">
                        {fulfillmentRate}%
                      </span>
                    </div>
                  </div>

                  {/* YouCan-Style Order Status Counters */}
                  <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-900">عدادات حالات الطلبات</h3>
                      <span className="text-xs text-zinc-500">
                        اضغط على أي عداد لتصفية الطلبات
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        {
                          key: 'pending',
                          label: 'بانتظار التأكيد',
                          count: activeStore.stats.pendingOrders,
                          color: 'text-amber-700',
                        },
                        {
                          key: 'processing',
                          label: 'قيد التجهيز',
                          count: activeStore.stats.processingOrders,
                          color: 'text-sky-700',
                        },
                        {
                          key: 'shipped',
                          label: 'تم الشحن',
                          count: activeStore.stats.shippedOrders,
                          color: 'text-indigo-700',
                        },
                        {
                          key: 'delivered',
                          label: 'تم التسليم',
                          count: activeStore.stats.deliveredOrders,
                          color: 'text-emerald-700',
                        },
                        {
                          key: 'cancelled',
                          label: 'ملغاة',
                          count: activeStore.stats.cancelledOrders,
                          color: 'text-rose-700',
                        },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setOrderStatusFilter(item.key);
                            setActiveTab('orders');
                          }}
                          className="p-4 rounded-xl border border-zinc-200 bg-[#FAFAFA] hover:border-zinc-300 text-right transition-colors cursor-pointer"
                        >
                          <span className="text-xs text-zinc-500 block mb-1">{item.label}</span>
                          <span className={`text-2xl font-bold font-mono-tabular ${item.color}`}>
                            {item.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Inventory & Security Counters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-5 bg-white border border-zinc-200 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">المنتجات المنشورة</span>
                        <span className="text-xl font-bold font-mono-tabular text-zinc-900">
                          {activeStore.stats.publishedProductCount} / {activeStore.stats.productCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={startNewProduct}
                        className="px-3 py-1.5 text-xs font-semibold text-pink-600 bg-pink-50 rounded-lg hover:bg-pink-100 cursor-pointer"
                      >
                        + منتج
                      </button>
                    </div>

                    <div className="p-5 bg-white border border-zinc-200 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">
                          تنبيهات المخزون المنخفض
                        </span>
                        <span
                          className={`text-xl font-bold font-mono-tabular ${
                            activeStore.stats.lowStockCount > 0 ? 'text-amber-700' : 'text-zinc-900'
                          }`}
                        >
                          {activeStore.stats.lowStockCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('products')}
                        className="text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                      >
                        مراجعة
                      </button>
                    </div>

                    <div className="p-5 bg-white border border-zinc-200 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">
                          مفاتيح الربط المشفرة
                        </span>
                        <span className="text-xl font-bold font-mono-tabular text-zinc-900">
                          {activeStore.stats.keyCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('keys')}
                        className="text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                      >
                        إدارة
                      </button>
                    </div>
                  </div>

                  {/* Independent URL Showcase */}
                  <div className="p-5 bg-white border border-zinc-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 mb-1">
                        رابط المتجر العام المستقل
                      </h3>
                      <p className="text-xs text-zinc-600">
                        شارك هذا الرابط مع عملائك للطلب المباشر. تتم مزامنة المنتجات والطلبات تلقائياً.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code
                        dir="ltr"
                        className="px-3 py-2 text-xs font-mono-tabular bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800"
                      >
                        {getFullStoreUrl(activeStore.slug)}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyActiveStoreLink(activeStore.slug)}
                        className="px-3 py-2 text-xs font-medium bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg cursor-pointer"
                      >
                        {copiedStoreUrl ? 'تم النسخ' : 'نسخ'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/store/${activeStore.slug}`)}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>معاينة المتجر</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Recent Orders & Sync Feed */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-zinc-900">أحدث الطلبات</h3>
                        <button
                          type="button"
                          onClick={() => setActiveTab('orders')}
                          className="text-xs font-semibold text-pink-600 hover:underline cursor-pointer"
                        >
                          عرض الكل
                        </button>
                      </div>
                      {orders.length === 0 ? (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          لم تصل طلبات بعد. جرّب فتح المتجر المستقل وإتمام طلب تجريبي.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-100">
                          {orders.slice(0, 5).map((ord) => (
                            <div
                              key={ord.id}
                              className="px-5 py-3 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span
                                  className="font-mono-tabular font-semibold text-zinc-900 block"
                                  dir="ltr"
                                >
                                  {ord.order_number}
                                </span>
                                <span className="text-zinc-500">
                                  {ord.customer_name} · {ord.city}
                                </span>
                              </div>
                              <div className="text-left">
                                <span className="font-mono-tabular font-bold text-zinc-900 block">
                                  {formatMoney(ord.total_amount, activeStore.currency)}
                                </span>
                                <span
                                  className={`inline-block mt-0.5 px-2 py-0.5 text-[11px] font-medium border rounded ${
                                    ORDER_STATUS_META[ord.status].toneClass
                                  }`}
                                >
                                  {ORDER_STATUS_META[ord.status].label}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-zinc-900">سجل مزامنة الواجهتين</h3>
                        <button
                          type="button"
                          onClick={() => setActiveTab('keys')}
                          className="text-xs font-semibold text-pink-600 hover:underline cursor-pointer"
                        >
                          مفاتيح التشفير
                        </button>
                      </div>
                      {syncEvents.length === 0 ? (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          لا توجد أحداث مزامنة مسجلة بعد.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-100">
                          {syncEvents.slice(0, 5).map((ev) => (
                            <div key={ev.id} className="px-5 py-3 text-xs">
                              <div className="flex items-center justify-between text-zinc-500 mb-1">
                                <span>
                                  {ev.direction === 'storefront_to_seller'
                                    ? 'من المتجر ← لوحة التاجر'
                                    : 'من لوحة التاجر ← المتجر'}
                                </span>
                                <span className="font-mono-tabular" dir="ltr">
                                  {ev.created_at.slice(0, 16)}
                                </span>
                              </div>
                              <p className="text-zinc-800">{ev.summary}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Analytics Tab (Recharts) */}
              {activeTab === 'analytics' && (
                <PerformanceAnalytics
                  storeId={activeStore.id}
                  currency={activeStore.currency}
                />
              )}

              {/* Dedicated Merchant Product Studio Tab */}
              {activeTab === 'add-product' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-8 bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                      <div>
                        <h2 className="text-base font-bold text-zinc-900">
                          {editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد إلى متجرك'}
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          ينعكس المنتج مباشرة في واجهة المتجر المستقلة بالعملة ({activeStore.currency}).
                        </p>
                      </div>
                      {editingProduct && (
                        <button
                          type="button"
                          onClick={startNewProduct}
                          className="text-xs font-medium text-pink-600 hover:underline cursor-pointer"
                        >
                          + إنشاء منتج جديد بدلاً من ذلك
                        </button>
                      )}
                    </div>

                    {productError && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                        {productError}
                      </div>
                    )}
                    {productSavedNotice && (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                        <span>{productSavedNotice}</span>
                        <button
                          type="button"
                          onClick={() => onNavigate(`/store/${activeStore.slug}`)}
                          className="font-semibold underline cursor-pointer"
                        >
                          معاينة في المتجر
                        </button>
                      </div>
                    )}

                    <form onSubmit={handleSaveProduct} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          اسم المنتج *
                        </label>
                        <input
                          type="text"
                          required
                          value={prodName}
                          onChange={(e) => setProdName(e.target.value)}
                          placeholder="مثال: قفطان عصري مطرز يدوياً"
                          className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-pink-600"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            سعر البيع ({activeStore.currency}) *
                          </label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="0.01"
                            dir="ltr"
                            value={prodPrice}
                            onChange={(e) => setProdPrice(e.target.value)}
                            placeholder="250"
                            className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            السعر قبل التخفيض (اختياري)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            dir="ltr"
                            value={prodComparePrice}
                            onChange={(e) => setProdComparePrice(e.target.value)}
                            placeholder="320"
                            className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            الكمية في المخزون *
                          </label>
                          <input
                            type="number"
                            required
                            min="0"
                            dir="ltr"
                            value={prodStock}
                            onChange={(e) => setProdStock(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            الفئة / التصنيف
                          </label>
                          <input
                            type="text"
                            required
                            value={prodCategory}
                            onChange={(e) => setProdCategory(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            رمز المنتج (SKU)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={prodSku}
                            onChange={(e) => setProdSku(e.target.value)}
                            placeholder="تلقائي إذا تُرك فارغاً"
                            className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          وصف المنتج
                        </label>
                        <textarea
                          rows={3}
                          value={prodDesc}
                          onChange={(e) => setProdDesc(e.target.value)}
                          placeholder="اكتب وصفاً واضحاً يبرز مميزات المنتج ومواصفاته..."
                          className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                        />
                      </div>

                      <div className="space-y-3 pt-2 border-t border-zinc-200">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-zinc-700">
                            صورة المنتج (رفع من جهازك أو اختيار صورة جاهزة)
                          </label>
                          <label className="px-3 py-1.5 text-xs font-semibold text-pink-700 bg-pink-50 hover:bg-pink-100 rounded-lg inline-flex items-center gap-1.5 cursor-pointer">
                            <ImagePlus className="w-3.5 h-3.5" />
                            <span>رفع صورة من الجهاز</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleProductImageUpload}
                              className="hidden"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-4 gap-2.5">
                          {PRESET_PRODUCT_IMAGES.map((img) => (
                            <button
                              key={img.url}
                              type="button"
                              onClick={() => setProdImage(img.url)}
                              className={`aspect-[4/3] rounded-lg overflow-hidden border-2 cursor-pointer ${
                                prodImage === img.url ? 'border-pink-600' : 'border-zinc-200'
                              }`}
                            >
                              <ResilientImage
                                src={img.url}
                                alt={img.label}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>

                        <input
                          type="text"
                          dir="ltr"
                          value={prodImage.startsWith('data:') ? 'صورة مرفوعة محلياً (جاهزة للحفظ)' : prodImage}
                          onChange={(e) => setProdImage(e.target.value)}
                          placeholder="أو الصق رابط صورة مباشر..."
                          className="w-full px-3 py-2 text-xs font-mono-tabular border border-zinc-300 rounded-lg"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={prodPublished}
                          onChange={(e) => setProdPublished(e.target.checked)}
                        />
                        <span>نشر المنتج فوراً في واجهة المتجر العامة</span>
                      </label>

                      <div className="pt-2 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveTab('products')}
                          className="px-4 py-2.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
                        >
                          عرض كل المنتجات
                        </button>
                        <button
                          type="submit"
                          disabled={savingProduct}
                          className="px-6 py-2.5 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          {savingProduct
                            ? 'جاري الحفظ...'
                            : editingProduct
                            ? 'حفظ التعديلات'
                            : 'نشر المنتج في المتجر'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Live Storefront Card Preview */}
                  <div className="lg:col-span-4 space-y-3">
                    <span className="text-xs font-semibold text-zinc-500 block">
                      معاينة فورية لشكل المنتج في المتجر
                    </span>
                    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                      <div className="aspect-[4/3] bg-zinc-100 border-b border-zinc-200">
                        <ResilientImage
                          src={prodImage}
                          alt={prodName || 'اسم المنتج'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1.5">
                          <span>{prodCategory || 'منتجات'}</span>
                          <span aria-hidden="true">·</span>
                          <span>متوفر ({prodStock || 0})</span>
                        </div>
                        <h4 className="text-base font-bold text-zinc-900 mb-1">
                          {prodName || 'عنوان المنتج سيظهر هنا'}
                        </h4>
                        <p className="text-xs text-zinc-500 line-clamp-2 mb-4">
                          {prodDesc || 'وصف مختصر للمنتج يظهر للمتسوقين داخل المتجر.'}
                        </p>
                        <div className="pt-3 border-t border-zinc-200 flex items-center justify-between">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-bold font-mono-tabular text-zinc-900">
                              {formatMoney(Number(prodPrice) || 0, activeStore.currency)}
                            </span>
                            {Number(prodComparePrice) > Number(prodPrice) && (
                              <span className="text-xs font-mono-tabular text-zinc-400 line-through">
                                {formatMoney(Number(prodComparePrice), activeStore.currency)}
                              </span>
                            )}
                          </div>
                          <span
                            style={{ backgroundColor: activeStore.accent_color }}
                            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg"
                          >
                            أضف للسلة
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Products Catalog Table Tab */}
              {activeTab === 'products' && (
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900">كتالوج المنتجات والمخزون</h2>
                      <p className="text-xs text-zinc-500">
                        {products.length} منتج · العملة الحالية: {activeStore.currency}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="search"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="بحث بالاسم أو SKU..."
                        className="px-3 py-2 text-xs border border-zinc-300 rounded-lg focus:outline-none focus:border-pink-600"
                      />
                      <button
                        type="button"
                        onClick={startNewProduct}
                        className="px-4 py-2 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة منتج</span>
                      </button>
                    </div>
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-sm text-zinc-600 mb-4">لا توجد منتجات في هذا المتجر.</p>
                      <button
                        type="button"
                        onClick={startNewProduct}
                        className="px-4 py-2 text-xs font-semibold text-white bg-pink-600 rounded-lg cursor-pointer"
                      >
                        + أضف أول منتج
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                          <tr>
                            <th className="py-3 px-4 font-medium">المنتج</th>
                            <th className="py-3 px-4 font-medium">SKU</th>
                            <th className="py-3 px-4 font-medium">الفئة</th>
                            <th className="py-3 px-4 font-medium">السعر</th>
                            <th className="py-3 px-4 font-medium">المخزون</th>
                            <th className="py-3 px-4 font-medium">الحالة</th>
                            <th className="py-3 px-4 font-medium text-left">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {filteredProducts.map((p) => (
                            <tr key={p.id} className="hover:bg-zinc-50/70">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-md overflow-hidden bg-zinc-100 shrink-0">
                                    <ResilientImage
                                      src={p.image_url}
                                      alt={p.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <span className="font-semibold text-zinc-900">{p.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono-tabular text-zinc-600" dir="ltr">
                                {p.sku}
                              </td>
                              <td className="py-3 px-4 text-zinc-600">{p.category}</td>
                              <td className="py-3 px-4 font-mono-tabular">
                                <span className="font-semibold text-zinc-900">
                                  {formatMoney(p.price, activeStore.currency)}
                                </span>
                                {p.compare_at_price && p.compare_at_price > p.price && (
                                  <span className="block text-[11px] text-zinc-400 line-through">
                                    {formatMoney(p.compare_at_price, activeStore.currency)}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono-tabular">
                                <span className={p.stock <= 5 ? 'text-rose-700 font-semibold' : ''}>
                                  {p.stock}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={
                                    p.is_published !== false
                                      ? 'text-emerald-700 font-medium'
                                      : 'text-zinc-500'
                                  }
                                >
                                  {p.is_published !== false ? 'منشور' : 'مسودة'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-left">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditProduct(p)}
                                    className="px-2.5 py-1 text-xs font-medium text-zinc-700 border border-zinc-200 rounded hover:bg-zinc-100 cursor-pointer"
                                  >
                                    تعديل
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProduct(p.id)}
                                    aria-label="حذف"
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Orders Tab */}
              {activeTab === 'orders' && (
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900">إدارة الطلبات الواردة</h2>
                      <p className="text-xs text-zinc-500">
                        طلبات العملاء المتزامنة من واجهة المتجر المستقلة.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg overflow-x-auto">
                      {[
                        { id: 'all', label: `الكل (${orders.length})` },
                        { id: 'pending', label: `بانتظار التأكيد (${activeStore.stats.pendingOrders})` },
                        { id: 'processing', label: `قيد التجهيز (${activeStore.stats.processingOrders})` },
                        { id: 'shipped', label: `تم الشحن (${activeStore.stats.shippedOrders})` },
                        { id: 'delivered', label: `تم التسليم (${activeStore.stats.deliveredOrders})` },
                        { id: 'cancelled', label: `ملغاة (${activeStore.stats.cancelledOrders})` },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setOrderStatusFilter(f.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                            orderStatusFilter === f.id
                              ? 'bg-white text-zinc-900 shadow-xs'
                              : 'text-zinc-600'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredOrders.length === 0 ? (
                    <div className="p-12 text-center text-sm text-zinc-500">
                      لا توجد طلبات ضمن هذا التصنيف.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-200">
                      {filteredOrders.map((ord) => {
                        const expanded = expandedOrderId === ord.id;
                        return (
                          <div key={ord.id} className="p-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className="font-mono-tabular font-bold text-sm text-zinc-900"
                                    dir="ltr"
                                  >
                                    {ord.order_number}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 text-[11px] font-medium border rounded ${
                                      ORDER_STATUS_META[ord.status].toneClass
                                    }`}
                                  >
                                    {ORDER_STATUS_META[ord.status].label}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-600">
                                  {ord.customer_name} · {ord.customer_phone} · {ord.city}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-mono-tabular text-sm font-bold text-zinc-900">
                                  {formatMoney(ord.total_amount, activeStore.currency)}
                                </span>

                                <select
                                  value={ord.status}
                                  onChange={(e) =>
                                    handleOrderStatusChange(ord.id, e.target.value as OrderStatus)
                                  }
                                  className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white focus:outline-none focus:border-pink-600"
                                >
                                  <option value="pending">بانتظار التأكيد</option>
                                  <option value="processing">قيد التجهيز</option>
                                  <option value="shipped">تم الشحن</option>
                                  <option value="delivered">تم التسليم</option>
                                  <option value="cancelled">ملغي (إرجاع المخزون)</option>
                                </select>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedOrderId(expanded ? null : ord.id)
                                  }
                                  className="px-3 py-1.5 text-xs font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer"
                                >
                                  {expanded ? 'إخفاء التفاصيل' : 'التفاصيل'}
                                </button>
                              </div>
                            </div>

                            {expanded && (
                              <div className="mt-4 pt-4 border-t border-zinc-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div className="space-y-1 text-zinc-600">
                                  <p>
                                    <strong className="text-zinc-800">العنوان:</strong>{' '}
                                    {ord.shipping_address}، {ord.city}
                                  </p>
                                  <p>
                                    <strong className="text-zinc-800">طريقة الدفع:</strong>{' '}
                                    {ord.payment_method === 'cod'
                                      ? 'الدفع عند الاستلام'
                                      : 'بطاقة بنكية'}
                                  </p>
                                  <p>
                                    <strong className="text-zinc-800">رسوم الشحن:</strong>{' '}
                                    <span className="font-mono-tabular">
                                      {ord.shipping_fee === 0
                                        ? 'مجاني'
                                        : formatMoney(ord.shipping_fee, activeStore.currency)}
                                    </span>
                                  </p>
                                  {ord.notes && (
                                    <p>
                                      <strong className="text-zinc-800">ملاحظات:</strong>{' '}
                                      {ord.notes}
                                    </p>
                                  )}
                                </div>

                                <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100">
                                  {ord.items.map((item, i) => (
                                    <div
                                      key={i}
                                      className="px-3 py-2 flex items-center justify-between"
                                    >
                                      <span>
                                        {item.product_name} × {item.quantity}
                                      </span>
                                      <span className="font-mono-tabular font-medium">
                                        {formatMoney(item.subtotal, activeStore.currency)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Encrypted Keys & Sync Tab */}
              {activeTab === 'keys' && (
                <div className="space-y-6">
                  <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-pink-600" />
                        <span>مفاتيح الربط المشفرة (AES-256-GCM)</span>
                      </h2>
                      <p className="text-xs text-zinc-500 mt-1">
                        تُحفظ جميع مفاتيح المزامنة وبوابات الدفع والشحن مشفرة في قاعدة البيانات
                        المركزية ولا تُكشف في الواجهة العامة.
                      </p>
                    </div>

                    {revealedKeyOnce && (
                      <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-900">
                            تم تشفير المفتاح وحفظه! انسخه الآن فلن يظهر كاملاً مرة أخرى:
                          </span>
                          <button
                            type="button"
                            onClick={() => setRevealedKeyOnce(null)}
                            className="text-xs text-emerald-700 hover:underline cursor-pointer"
                          >
                            إخفاء
                          </button>
                        </div>
                        <code
                          dir="ltr"
                          className="block p-2.5 bg-white border border-emerald-200 rounded-lg text-xs font-mono-tabular text-zinc-900 select-all"
                        >
                          {revealedKeyOnce}
                        </code>
                      </div>
                    )}

                    <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-xl">
                      {keys.map((k) => {
                        const vRes = keyVerifyResults[k.id];
                        return (
                          <div
                            key={k.id}
                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-zinc-900">
                                  {k.key_label}
                                </span>
                                <span className="text-[11px] font-mono-tabular text-pink-600">
                                  AES-256-GCM
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                                <span className="font-mono-tabular" dir="ltr">
                                  {k.key_prefix}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular" dir="ltr">
                                  {k.key_name}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {vRes && (
                                <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>{vRes.verified ? 'التشفير سليم' : 'فشل التحقق'}</span>
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleVerifyKey(k.id)}
                                className="px-3 py-1.5 text-xs font-medium text-zinc-700 border border-zinc-200 hover:bg-zinc-50 rounded-lg cursor-pointer"
                              >
                                فحص التشفير
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form
                      onSubmit={handleCreateKey}
                      className="pt-4 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
                    >
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          وصف المفتاح
                        </label>
                        <input
                          type="text"
                          required
                          value={newKeyLabel}
                          onChange={(e) => setNewKeyLabel(e.target.value)}
                          placeholder="مثال: مفتاح شركة التوصيل"
                          className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          المعرّف البرمجي
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          placeholder="delivery_webhook_key"
                          className="w-full px-3 py-2 text-xs font-mono-tabular border border-zinc-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          القيمة السرية (أو توليد تلقائي)
                        </label>
                        <input
                          type="password"
                          dir="ltr"
                          value={newKeySecret}
                          onChange={(e) => setNewKeySecret(e.target.value)}
                          placeholder="توليد تلقائي آمن"
                          className="w-full px-3 py-2 text-xs font-mono-tabular border border-zinc-300 rounded-lg"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingKey}
                        className="px-4 py-2 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg cursor-pointer"
                      >
                        {savingKey ? 'جاري التشفير...' : 'تشفير وحفظ المفتاح'}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-zinc-200">
                      <h3 className="text-sm font-bold text-zinc-900">
                        سجل عمليات المزامنة الداخلية
                      </h3>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {syncEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono-tabular text-zinc-400" dir="ltr">
                              #{ev.id}
                            </span>
                            <span className="text-zinc-800">{ev.summary}</span>
                          </div>
                          <span className="font-mono-tabular text-zinc-500 shrink-0" dir="ltr">
                            {ev.created_at}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Comprehensive YouCan-Style Store Settings Tab */}
              {activeTab === 'settings' && (
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900">
                        إعدادات المتجر المتقدمة
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        تحكم في الهوية، العملة، الشحن، وسائل الدفع، والسياسات مثل منصات المتاجر الاحترافية.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg">
                      {[
                        { id: 'identity' as const, label: 'الهوية والمظهر' },
                        { id: 'shipping' as const, label: 'الشحن والدفع' },
                        { id: 'contact' as const, label: 'التواصل والسياسات' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setSettingsSection(tab.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                            settingsSection === tab.id
                              ? 'bg-white text-zinc-900 shadow-xs'
                              : 'text-zinc-600'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleSaveSettings} className="p-6 max-w-2xl space-y-5">
                    {settingsError && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                        {settingsError}
                      </div>
                    )}
                    {settingsSavedMsg && (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                        {settingsSavedMsg}
                      </div>
                    )}

                    {settingsSection === 'identity' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              اسم المتجر
                            </label>
                            <input
                              type="text"
                              required
                              value={settingsName}
                              onChange={(e) => setSettingsName(e.target.value)}
                              className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              معرّف الرابط المستقل (Slug)
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              required
                              value={settingsSlug}
                              onChange={(e) => setSettingsSlug(e.target.value)}
                              className="w-full px-3.5 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            الوصف الترحيبي
                          </label>
                          <textarea
                            rows={2}
                            value={settingsTagline}
                            onChange={(e) => setSettingsTagline(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              التخصص
                            </label>
                            <input
                              type="text"
                              value={settingsCategory}
                              onChange={(e) => setSettingsCategory(e.target.value)}
                              className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              عملة المتجر الأساسية
                            </label>
                            <select
                              value={settingsCurrency}
                              onChange={(e) => setSettingsCurrency(e.target.value)}
                              className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                            >
                              {CURRENCY_OPTIONS.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-2">
                            اللون المميز للواجهة
                          </label>
                          <div className="flex items-center gap-2.5">
                            {ACCENT_CHOICES.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setSettingsAccent(color)}
                                style={{ backgroundColor: color }}
                                className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                                  settingsAccent === color ? 'ring-2 ring-offset-2 ring-zinc-900 scale-110' : ''
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-zinc-200 space-y-3">
                          <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsAnnouncementEnabled}
                              onChange={(e) => setSettingsAnnouncementEnabled(e.target.checked)}
                            />
                            <span>إظهار شريط الإعلان الترويجي أعلى المتجر</span>
                          </label>
                          <input
                            type="text"
                            value={settingsAnnouncementText}
                            onChange={(e) => setSettingsAnnouncementText(e.target.value)}
                            placeholder="مثال: التوصيل مجاني لجميع المدن · الدفع عند الاستلام متاح"
                            className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                          />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-zinc-800 pt-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settingsActive}
                            onChange={(e) => setSettingsActive(e.target.checked)}
                          />
                          <span>المتجر نشط ومتاح لاستقبال الزوار</span>
                        </label>
                      </div>
                    )}

                    {settingsSection === 'shipping' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              رسوم الشحن ({settingsCurrency}) — 0 = مجاني
                            </label>
                            <input
                              type="number"
                              min="0"
                              dir="ltr"
                              value={settingsShippingFee}
                              onChange={(e) => setSettingsShippingFee(e.target.value)}
                              className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              حد الشحن المجاني (0 للتوصيل المجاني الدائم)
                            </label>
                            <input
                              type="number"
                              min="0"
                              dir="ltr"
                              value={settingsFreeThreshold}
                              onChange={(e) => setSettingsFreeThreshold(e.target.value)}
                              className="w-full px-3 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              مدة التوصيل المتوقعة
                            </label>
                            <input
                              type="text"
                              value={settingsDeliveryEst}
                              onChange={(e) => setSettingsDeliveryEst(e.target.value)}
                              placeholder="24 - 48 ساعة"
                              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="pt-3 border-t border-zinc-200 space-y-3">
                          <h4 className="text-xs font-bold text-zinc-900">خيارات الدفع والطلب</h4>
                          <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsEnableCod}
                              onChange={(e) => setSettingsEnableCod(e.target.checked)}
                            />
                            <span>تفعيل الدفع عند الاستلام (COD)</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsEnableCard}
                              onChange={(e) => setSettingsEnableCard(e.target.checked)}
                            />
                            <span>تفعيل الدفع بالبطاقة البنكية</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsExpressCheckout}
                              onChange={(e) => setSettingsExpressCheckout(e.target.checked)}
                            />
                            <span>تفعيل نموذج الطلب السريع مباشرة داخل صفحة المنتج (Express COD)</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {settingsSection === 'contact' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              رقم فريق الدعم / واتساب (تواصل معنا)
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={settingsWhatsapp}
                              onChange={(e) => setSettingsWhatsapp(e.target.value)}
                              placeholder="+212 641-747082"
                              className="w-full px-3.5 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              البريد الإلكتروني للدعم
                            </label>
                            <input
                              type="email"
                              dir="ltr"
                              value={settingsSupportEmail}
                              onChange={(e) => setSettingsSupportEmail(e.target.value)}
                              placeholder="support@store.ma"
                              className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-700 mb-1">
                            سياسة الاسترجاع والاستبدال
                          </label>
                          <textarea
                            rows={3}
                            value={settingsReturnPolicy}
                            onChange={(e) => setSettingsReturnPolicy(e.target.value)}
                            className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-zinc-200">
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="px-6 py-2.5 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg cursor-pointer"
                      >
                        {savingSettings ? 'جاري الحفظ...' : 'حفظ ومزامنة الإعدادات'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Create New Store Modal */}
      {createStoreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setCreateStoreOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 border border-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-900">إنشاء متجر مستقل جديد</h3>
              <button
                type="button"
                onClick={() => setCreateStoreOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createStoreError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {createStoreError}
              </div>
            )}

            <form onSubmit={handleCreateStore} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  اسم المتجر *
                </label>
                <input
                  type="text"
                  required
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="مثال: متجر سُكون للديكور"
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  اسم الرابط المختصر (اختياري)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newStoreSlug}
                  onChange={(e) => setNewStoreSlug(e.target.value)}
                  placeholder="sukoon-decor"
                  className="w-full px-3.5 py-2 text-sm font-mono-tabular border border-zinc-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">التخصص</label>
                  <input
                    type="text"
                    value={newStoreCategory}
                    onChange={(e) => setNewStoreCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">العملة</label>
                  <select
                    value={newStoreCurrency}
                    onChange={(e) => setNewStoreCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">وصف المتجر</label>
                <input
                  type="text"
                  value={newStoreTagline}
                  onChange={(e) => setNewStoreTagline(e.target.value)}
                  placeholder="وصف موجز يظهر في أعلى واجهة متجرك"
                  className="w-full px-3.5 py-2 text-sm border border-zinc-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-2">
                  اللون المميز
                </label>
                <div className="flex items-center gap-2.5">
                  {ACCENT_CHOICES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewStoreAccent(color)}
                      style={{ backgroundColor: color }}
                      className={`w-6 h-6 rounded-full cursor-pointer ${
                        newStoreAccent === color ? 'ring-2 ring-offset-2 ring-zinc-900' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateStoreOpen(false)}
                  className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creatingStore}
                  className="px-5 py-2 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg cursor-pointer"
                >
                  {creatingStore ? 'جاري التجهيز...' : 'إنشاء المتجر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Newly Provisioned Independent Store URL Modal */}
      {provisionedNotice && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setProvisionedNotice(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 border border-zinc-200 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-emerald-700">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-zinc-900">
                تم إنشاء متجرك المستقل بنجاح!
              </h3>
            </div>

            <p className="text-sm text-zinc-600 leading-relaxed">
              تم ربط متجر <strong>{provisionedNotice.store.name}</strong> بقاعدة البيانات المركزية،
              وهذا هو رابط متجرك المستقل الجاهز للاستخدام:
            </p>

            <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
              <span className="text-xs text-zinc-500 block">الرابط المستقل لمتجرك</span>
              <code
                dir="ltr"
                className="block text-sm font-mono-tabular font-semibold text-pink-700 break-all"
              >
                {getFullStoreUrl(provisionedNotice.store.slug)}
              </code>
            </div>

            {provisionedNotice.syncKey && (
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
                <span className="text-xs font-semibold text-amber-900 block">
                  مفتاح الربط المشفر (AES-256-GCM) — يظهر لمرة واحدة:
                </span>
                <code
                  dir="ltr"
                  className="block text-xs font-mono-tabular text-zinc-900 break-all select-all"
                >
                  {provisionedNotice.syncKey}
                </code>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => copyActiveStoreLink(provisionedNotice.store.slug)}
                className="px-4 py-2 text-xs font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50 cursor-pointer"
              >
                {copiedStoreUrl ? 'تم النسخ!' : 'نسخ الرابط'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = `/store/${provisionedNotice.store.slug}`;
                  setProvisionedNotice(null);
                  onNavigate(target);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>فتح المتجر المستقل</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvisionedNotice(null);
                  startNewProduct();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-pink-600 rounded-lg cursor-pointer"
              >
                إضافة أول منتج
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
