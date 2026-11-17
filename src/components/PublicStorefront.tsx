import {
  CheckCircle2,
  MessageCircle,
  Minus,
  PackagePlus,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatMoney, ORDER_STATUS_META } from '../lib/api';
import { CartItem, OrderStatus, Product } from '../types';
import { ResilientImage } from './ResilientImage';

interface PublicStorefrontProps {
  slug: string;
  onNavigate: (path: string) => void;
}

interface StoreMeta {
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
}

interface OrderReceipt {
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
}

export function PublicStorefront({ slug, onNavigate }: PublicStorefrontProps) {
  const [store, setStore] = useState<StoreMeta | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [pdpQty, setPdpQty] = useState(1);

  // Express COD Checkout inside PDP
  const [expName, setExpName] = useState('');
  const [expPhone, setExpPhone] = useState('');
  const [expCity, setExpCity] = useState('');
  const [expAddress, setExpAddress] = useState('');
  const [expSubmitting, setExpSubmitting] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Cart Checkout form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [city, setCity] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'card'>('cod');
  const [notes, setNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmedReceipt, setConfirmedReceipt] = useState<OrderReceipt | null>(null);

  // Order tracking state
  const [trackInput, setTrackInput] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<{
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
  } | null>(null);

  const loadStore = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPublicStorefront(slug);
      setStore(data.store);
      setProducts(data.products);
      if (!data.store.enable_cod && data.store.enable_card) {
        setPaymentMethod('card');
      } else {
        setPaymentMethod('cod');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'المتجر غير موجود.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadStore();
    setCart([]);
    setConfirmedReceipt(null);
    setTrackedOrder(null);
    setBannerDismissed(false);
  }, [loadStore]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ['الكل', ...cats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'الكل' || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart]
  );

  const computedShippingFee = useMemo(() => {
    if (!store || cart.length === 0) return 0;
    if (store.free_shipping_threshold > 0 && cartSubtotal >= store.free_shipping_threshold) {
      return 0;
    }
    return store.shipping_fee;
  }, [store, cart.length, cartSubtotal]);

  const cartGrandTotal = cartSubtotal + computedShippingFee;

  const addToCart = (product: Product, qty = 1) => {
    if (product.stock <= 0) return;
    setConfirmedReceipt(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + qty);
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: nextQty } : i
        );
      }
      return [...prev, { product, quantity: Math.min(product.stock, qty) }];
    });
    setCartOpen(true);
  };

  const updateCartQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const next = Math.min(item.product.stock, item.quantity + delta);
          return next <= 0 ? null : { ...item, quantity: next };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const removeCartItem = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || cart.length === 0) return;
    setSubmittingOrder(true);
    setCheckoutError(null);

    try {
      const res = await api.placeOrder(store.slug, {
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress,
        city,
        paymentMethod,
        notes,
        items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
      });
      setConfirmedReceipt(res.order);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setShippingAddress('');
      setCity('');
      setNotes('');
      const refreshed = await api.getPublicStorefront(store.slug);
      setProducts(refreshed.products);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'تعذر إتمام الطلب.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleExpressCheckout = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || !activeProduct) return;
    setExpSubmitting(true);
    setExpError(null);

    try {
      const res = await api.placeOrder(store.slug, {
        customerName: expName,
        customerPhone: expPhone,
        city: expCity,
        shippingAddress: expAddress,
        paymentMethod: store.enable_cod ? 'cod' : 'card',
        items: [{ productId: activeProduct.id, quantity: pdpQty }],
      });
      setActiveProduct(null);
      setExpName('');
      setExpPhone('');
      setExpCity('');
      setExpAddress('');
      setConfirmedReceipt(res.order);
      setCartOpen(true);
      const refreshed = await api.getPublicStorefront(store.slug);
      setProducts(refreshed.products);
    } catch (err) {
      setExpError(err instanceof Error ? err.message : 'تعذر إرسال الطلب السريع.');
    } finally {
      setExpSubmitting(false);
    }
  };

  const handleTrackOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || !trackInput.trim()) return;
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackedOrder(null);

    try {
      const res = await api.trackOrder(store.slug, trackInput.trim());
      setTrackedOrder(res.order);
    } catch (err) {
      setTrackingError(err instanceof Error ? err.message : 'لم يتم العثور على الطلب.');
    } finally {
      setTrackingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-600">جاري تحميل المتجر...</p>
        </div>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900 mb-2">المتجر غير متاح</h1>
          <p className="text-sm text-zinc-600 mb-6">
            {error || 'تأكد من صحة رابط المتجر وحاول مرة أخرى.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="px-5 py-2.5 text-sm font-medium text-white bg-zinc-900 rounded-lg cursor-pointer"
          >
            العودة إلى منصة youstor
          </button>
        </div>
      </div>
    );
  }

  const accent = store.accent_color || '#DB2777';
  const showAnnouncement = store.announcement_enabled && store.announcement_text && !bannerDismissed;
  const supportPhone = store.whatsapp_number?.trim() || '+212 641-747082';
  const whatsappClean = supportPhone.replace(/[^0-9]/g, '') || '212641747082';

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-zinc-900">
      {/* Slim Dismissible Announcement Bar (<= 36px) */}
      {showAnnouncement && (
        <div
          style={{ backgroundColor: accent }}
          className="text-white text-xs h-9 px-4 flex items-center justify-center relative"
        >
          <span className="truncate max-w-[90%] font-medium">{store.announcement_text}</span>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="إخفاء الإعلان"
            className="absolute left-3 p-1 text-white/80 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href={`/store/${store.slug}`}
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 truncate max-w-[220px]"
          >
            {store.name}
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600">
            <a
              href="#catalog"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              المنتجات
            </a>
            <a
              href="#track"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              تتبع طلبك
            </a>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              دليل youstor
            </a>
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/dashboard');
              }}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              لوحة التاجر
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              style={{ backgroundColor: accent }}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>السلة</span>
              <span className="font-mono-tabular">({cartCount})</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Storefront Hero */}
        <section className="bg-white border-b border-zinc-200">
          <div className="max-w-[1200px] mx-auto px-6 py-10 lg:py-14">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-5 flex flex-col justify-center py-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
                  <span>{store.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>توصيل خلال {store.delivery_estimate}</span>
                </div>
                <h1
                  className="text-3xl sm:text-4xl font-bold leading-[1.22] text-zinc-900 mb-4"
                  style={{ textWrap: 'balance' }}
                >
                  {store.name}
                </h1>
                <p className="text-base text-zinc-600 leading-relaxed mb-7">{store.tagline}</p>

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="#catalog"
                    style={{ backgroundColor: accent }}
                    className="px-6 py-3 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
                  >
                    تسوق المنتجات الآن
                  </a>
                  <a
                    href="#track"
                    className="px-5 py-3 text-sm font-semibold text-zinc-800 bg-zinc-50 border border-zinc-300 hover:border-zinc-400 rounded-lg transition-colors whitespace-nowrap"
                  >
                    تتبع الطلب
                  </a>
                </div>

                {store.shipping_fee === 0 ? (
                  <p className="mt-6 text-xs text-emerald-700 font-medium flex items-center gap-2">
                    <Truck className="w-4 h-4 shrink-0" />
                    <span>التوصيل مجاني لجميع المدن · الدفع عند الاستلام متاح</span>
                  </p>
                ) : (
                  store.free_shipping_threshold > 0 && (
                    <p className="mt-6 text-xs text-zinc-500 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-zinc-700 shrink-0" />
                      <span>
                        شحن مجاني للطلبات ابتداءً من{' '}
                        <strong className="font-mono-tabular text-zinc-800">
                          {formatMoney(store.free_shipping_threshold, store.currency)}
                        </strong>
                      </span>
                    </p>
                  )
                )}
              </div>

              <div className="lg:col-span-7">
                <div className="aspect-[16/9] lg:h-full rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-100">
                  <ResilientImage
                    src={store.hero_image}
                    alt={store.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Catalog Grid */}
        <section id="catalog" className="py-14 bg-[#FAFAFA]">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">تشكيلة المنتجات</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  {products.length} منتج متاح للطلب المباشر
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث عن منتج..."
                    className="w-full sm:w-56 pr-9 pl-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-zinc-200/70 rounded-lg overflow-x-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-white text-zinc-900 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {products.length === 0 ? (
              <div className="py-16 px-6 text-center border border-zinc-200 rounded-xl bg-white space-y-4">
                <PackagePlus className="w-10 h-10 text-zinc-300 mx-auto stroke-[1.5]" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-900">
                    لا توجد منتجات مضافة في هذا المتجر بعد
                  </h3>
                  <p className="text-sm text-zinc-600 max-w-md mx-auto">
                    يقوم التاجر بإضافة المنتجات مباشرة من لوحة التحكم لتظهر هنا للعملاء مع توصيل مجاني.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/dashboard')}
                  style={{ backgroundColor: accent }}
                  className="px-5 py-2.5 text-xs font-semibold text-white rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-2 cursor-pointer"
                >
                  <PackagePlus className="w-4 h-4" />
                  <span>الانتقال إلى لوحة التاجر لإضافة منتجات</span>
                </button>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-16 text-center border border-zinc-200 rounded-xl bg-white">
                <p className="text-sm text-zinc-600">
                  لا توجد منتجات مطابقة لخيارات البحث الحالية.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredProducts.map((product) => {
                  const outOfStock = product.stock <= 0;
                  const hasDiscount =
                    product.compare_at_price !== null &&
                    product.compare_at_price !== undefined &&
                    product.compare_at_price > product.price;
                  const discountPct = hasDiscount
                    ? Math.round(
                        ((product.compare_at_price! - product.price) /
                          product.compare_at_price!) *
                          100
                      )
                    : 0;

                  return (
                    <article
                      key={product.id}
                      className="group flex flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProduct(product);
                          setPdpQty(1);
                          setExpError(null);
                        }}
                        className="aspect-[4/3] bg-zinc-100 overflow-hidden border-b border-zinc-200 block text-right cursor-pointer"
                      >
                        <ResilientImage
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                      </button>

                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1.5">
                          <span>{product.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className={outOfStock ? 'text-rose-700 font-medium' : 'text-zinc-500'}>
                            {outOfStock ? 'نفدت الكمية' : `متوفر (${product.stock})`}
                          </span>
                          {hasDiscount && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular text-pink-600 font-semibold">
                                خصم {discountPct}%
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-zinc-900 mb-1.5 line-clamp-1">
                          {product.name}
                        </h3>
                        <p className="text-xs text-zinc-600 line-clamp-2 mb-4 flex-1">
                          {product.description}
                        </p>

                        <div className="pt-3 border-t border-zinc-200/80 flex items-center justify-between gap-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-bold font-mono-tabular text-zinc-900">
                              {formatMoney(product.price, store.currency)}
                            </span>
                            {hasDiscount && (
                              <span className="text-xs font-mono-tabular text-zinc-400 line-through">
                                {formatMoney(product.compare_at_price!, store.currency)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveProduct(product);
                                setPdpQty(1);
                                setExpError(null);
                              }}
                              className="px-3 py-2 text-xs font-medium text-zinc-700 hover:text-zinc-900 border border-zinc-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                            >
                              {store.express_checkout ? 'اطلب الآن' : 'التفاصيل'}
                            </button>
                            <button
                              type="button"
                              disabled={outOfStock}
                              onClick={() => addToCart(product, 1)}
                              style={!outOfStock ? { backgroundColor: accent } : undefined}
                              className="px-3.5 py-2 text-xs font-semibold text-white rounded-lg transition-opacity disabled:bg-zinc-300 disabled:cursor-not-allowed hover:opacity-90 whitespace-nowrap cursor-pointer"
                            >
                              {outOfStock ? 'غير متوفر' : 'أضف للسلة'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Order Tracking & Store Policy/Contact */}
        <section id="track" className="border-t border-zinc-200 bg-white py-14">
          <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 bg-[#FAFAFA] border border-zinc-200 rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-zinc-900 mb-2">تتبع حالة طلبك</h2>
              <p className="text-sm text-zinc-600 mb-6">
                أدخل رقم الطلب الذي حصلت عليه بعد الشراء لمعرفة حالته المباشرة من لوحة التاجر.
              </p>

              <form onSubmit={handleTrackOrder} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={trackInput}
                  onChange={(e) => setTrackInput(e.target.value)}
                  placeholder="مثال: ORD-1041"
                  dir="ltr"
                  className="flex-1 px-4 py-2.5 text-sm font-mono-tabular bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
                />
                <button
                  type="submit"
                  disabled={trackingLoading || !trackInput.trim()}
                  style={{ backgroundColor: accent }}
                  className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {trackingLoading ? 'جاري البحث...' : 'استعلام عن الطلب'}
                </button>
              </form>

              {trackingError && (
                <p className="mt-4 text-sm text-rose-700">{trackingError}</p>
              )}

              {trackedOrder && (
                <div className="mt-6 pt-6 border-t border-zinc-200 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-zinc-500 block">رقم الطلب</span>
                      <span className="text-base font-bold font-mono-tabular" dir="ltr">
                        {trackedOrder.order_number}
                      </span>
                    </div>
                    <span
                      className={`inline-block px-3 py-1 text-xs font-semibold rounded-md border ${
                        ORDER_STATUS_META[trackedOrder.status].toneClass
                      }`}
                    >
                      {ORDER_STATUS_META[trackedOrder.status].label}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-600 flex flex-wrap items-center gap-3">
                    <span>المستلم: {trackedOrder.customer_name}</span>
                    <span aria-hidden="true">·</span>
                    <span>المدينة: {trackedOrder.city}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      الإجمالي: {formatMoney(trackedOrder.total_amount, trackedOrder.currency)}
                    </span>
                  </div>

                  <div className="bg-white divide-y divide-zinc-100 border border-zinc-200 rounded-lg">
                    {trackedOrder.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-2.5 flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-800">
                          {item.product_name} × {item.quantity}
                        </span>
                        <span className="font-mono-tabular font-medium text-zinc-900">
                          {formatMoney(item.subtotal, trackedOrder.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-[#FAFAFA] border border-zinc-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-zinc-900">سياسة الشحن وفريق الدعم</h3>
                <p className="text-sm text-zinc-600 leading-relaxed">{store.return_policy}</p>
                <div className="pt-2 space-y-2 text-xs text-zinc-600">
                  <p>
                    <strong className="text-zinc-900">رسوم الشحن:</strong>{' '}
                    {store.shipping_fee === 0 ? (
                      <span className="text-emerald-700 font-semibold">مجاني لجميع المدن</span>
                    ) : (
                      <>
                        <span className="font-mono-tabular">
                          {formatMoney(store.shipping_fee, store.currency)}
                        </span>
                        {store.free_shipping_threshold > 0 &&
                          ` (مجاني فوق ${formatMoney(store.free_shipping_threshold, store.currency)})`}
                      </>
                    )}
                  </p>
                  <p>
                    <strong className="text-zinc-900">مدة التوصيل:</strong> {store.delivery_estimate}
                  </p>
                  {store.support_email && (
                    <p>
                      <strong className="text-zinc-900">البريد:</strong>{' '}
                      <span dir="ltr" className="font-mono-tabular">
                        {store.support_email}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-900">فريق الدعم — تواصل معنا</span>
                  <a
                    href={`tel:+${whatsappClean}`}
                    dir="ltr"
                    className="font-mono-tabular font-semibold text-zinc-900 hover:underline inline-flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-zinc-600" />
                    <span>{supportPhone}</span>
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <a
                    href={`tel:+${whatsappClean}`}
                    className="py-2.5 px-3 text-xs font-semibold text-zinc-800 bg-white border border-zinc-300 hover:bg-zinc-100 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>اتصل بنا</span>
                  </a>
                  <a
                    href={`https://wa.me/${whatsappClean}`}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2.5 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>تواصل عبر واتساب</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-[#FAFAFA] py-8">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <span>
            {store.name} · متجر مستقل على منصة{' '}
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="underline hover:text-zinc-900 cursor-pointer"
            >
              youstor
            </button>
          </span>
          <div className="flex items-center gap-4">
            <a
              href={`tel:+${whatsappClean}`}
              className="hover:text-zinc-900 inline-flex items-center gap-1.5"
            >
              <span>فريق الدعم:</span>
              <span dir="ltr" className="font-mono-tabular font-semibold text-zinc-700">
                {supportPhone}
              </span>
            </a>
            <span className="font-mono-tabular" dir="ltr">
              /store/{store.slug}
            </span>
          </div>
        </div>
      </footer>

      {/* Product Detail & YouCan Express COD Modal (PDP) */}
      {activeProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveProduct(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto border border-zinc-200 grid grid-cols-1 md:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-[4/3] md:aspect-auto bg-zinc-100">
              <ResilientImage
                src={activeProduct.image_url}
                alt={activeProduct.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-6 sm:p-7 flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{activeProduct.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{activeProduct.sku}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveProduct(null)}
                    aria-label="إغلاق"
                    className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 className="text-xl font-bold text-zinc-900 mb-2">{activeProduct.name}</h3>
                <div className="flex items-baseline gap-2.5 mb-3">
                  <span className="text-xl font-bold font-mono-tabular text-zinc-900">
                    {formatMoney(activeProduct.price, store.currency)}
                  </span>
                  {activeProduct.compare_at_price &&
                    activeProduct.compare_at_price > activeProduct.price && (
                      <span className="text-sm font-mono-tabular text-zinc-400 line-through">
                        {formatMoney(activeProduct.compare_at_price, store.currency)}
                      </span>
                    )}
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed mb-4">
                  {activeProduct.description || 'منتج متوفر للشحن المباشر من المتجر.'}
                </p>

                <div className="flex items-center gap-3 pb-4 border-b border-zinc-200">
                  <div className="flex items-center border border-zinc-300 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPdpQty((q) => Math.max(1, q - 1))}
                      className="p-2 text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-3.5 text-sm font-mono-tabular font-semibold">{pdpQty}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPdpQty((q) => Math.min(Math.max(1, activeProduct.stock), q + 1))
                      }
                      className="p-2 text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={activeProduct.stock <= 0}
                    onClick={() => {
                      addToCart(activeProduct, pdpQty);
                      setActiveProduct(null);
                    }}
                    className="flex-1 py-2.5 px-4 text-xs font-semibold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg disabled:opacity-40 cursor-pointer"
                  >
                    أضف إلى السلة
                  </button>
                </div>
              </div>

              {/* YouCan-Style Instant Express Order Form */}
              {store.express_checkout && activeProduct.stock > 0 && (
                <form onSubmit={handleExpressCheckout} className="space-y-3 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <h4 className="text-xs font-bold text-zinc-900">
                    طلب سريع مباشر (الدفع عند الاستلام)
                  </h4>
                  {expError && <p className="text-xs text-rose-700">{expError}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      value={expName}
                      onChange={(e) => setExpName(e.target.value)}
                      placeholder="الاسم الكامل"
                      className="px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                    />
                    <input
                      type="tel"
                      required
                      dir="ltr"
                      value={expPhone}
                      onChange={(e) => setExpPhone(e.target.value)}
                      placeholder="رقم الهاتف"
                      className="px-3 py-2 text-xs font-mono-tabular bg-white border border-zinc-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      value={expCity}
                      onChange={(e) => setExpCity(e.target.value)}
                      placeholder="المدينة"
                      className="px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                    />
                    <input
                      type="text"
                      required
                      value={expAddress}
                      onChange={(e) => setExpAddress(e.target.value)}
                      placeholder="العنوان"
                      className="px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={expSubmitting}
                    style={{ backgroundColor: accent }}
                    className="w-full py-2.5 text-xs font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {expSubmitting
                      ? 'جاري تأكيد الطلب...'
                      : `تأكيد الطلب الآن (${formatMoney(activeProduct.price * pdpQty, store.currency)})`}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Cart & Checkout Drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex justify-end"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white h-full flex flex-col border-r border-zinc-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900">
                سلة المشتريات <span className="font-mono-tabular text-zinc-500">({cartCount})</span>
              </h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="إغلاق السلة"
                className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {confirmedReceipt ? (
                <div className="p-6 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-4">
                  <div className="flex items-center gap-2.5 text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <h4 className="font-bold text-base">تم تأكيد طلبك بنجاح</h4>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    تمت مزامنة طلبك فوراً مع لوحة التاجر في {store.name} وتحديث المخزون. احتفظ
                    برقم الطلب للمتابعة:
                  </p>
                  <div className="p-3 bg-white border border-emerald-200 rounded-lg flex items-center justify-between">
                    <span className="text-xs text-zinc-500">رقم الطلب</span>
                    <span className="font-mono-tabular font-bold text-zinc-900" dir="ltr">
                      {confirmedReceipt.orderNumber}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-zinc-700">
                    {confirmedReceipt.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {it.name} × {it.quantity}
                        </span>
                        <span className="font-mono-tabular">
                          {formatMoney(it.subtotal, confirmedReceipt.currency)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-zinc-600 pt-1">
                      <span>رسوم الشحن</span>
                      <span className="font-mono-tabular">
                        {confirmedReceipt.shippingFee === 0
                          ? 'مجاني'
                          : formatMoney(confirmedReceipt.shippingFee, confirmedReceipt.currency)}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-emerald-200 flex justify-between font-bold text-zinc-900">
                      <span>الإجمالي النهائي</span>
                      <span className="font-mono-tabular">
                        {formatMoney(confirmedReceipt.totalAmount, confirmedReceipt.currency)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTrackInput(confirmedReceipt.orderNumber);
                      setConfirmedReceipt(null);
                      setCartOpen(false);
                    }}
                    className="w-full py-2.5 text-xs font-semibold text-white bg-zinc-900 rounded-lg cursor-pointer"
                  >
                    متابعة الطلب في المتجر
                  </button>
                </div>
              ) : cart.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingBag className="w-10 h-10 text-zinc-300 mx-auto mb-3 stroke-[1.5]" />
                  <p className="text-sm text-zinc-600">سلة المشتريات فارغة حالياً.</p>
                </div>
              ) : (
                <>
                  {store.shipping_fee === 0 ? (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                      التوصيل مجاني لجميع المدن مشمول في طلبك.
                    </div>
                  ) : (
                    store.free_shipping_threshold > 0 && (
                      <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-700">
                        {cartSubtotal >= store.free_shipping_threshold ? (
                          <span className="text-emerald-700 font-medium">
                            ممتاز! لقد حصلت على شحن مجاني لهذا الطلب.
                          </span>
                        ) : (
                          <span>
                            أضف منتجات بقيمة{' '}
                            <strong className="font-mono-tabular">
                              {formatMoney(store.free_shipping_threshold - cartSubtotal, store.currency)}
                            </strong>{' '}
                            للحصول على شحن مجاني.
                          </span>
                        )}
                      </div>
                    )
                  )}

                  <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-xl">
                    {cart.map((item) => (
                      <div key={item.product.id} className="p-4 flex items-center gap-3">
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                          <ResilientImage
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-zinc-900 truncate">
                            {item.product.name}
                          </h4>
                          <p className="text-xs font-mono-tabular text-zinc-600 mt-0.5">
                            {formatMoney(item.product.price, store.currency)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.product.id, -1)}
                              className="w-6 h-6 border border-zinc-300 rounded flex items-center justify-center hover:bg-zinc-100 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-mono-tabular w-5 text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.product.id, 1)}
                              className="w-6 h-6 border border-zinc-300 rounded flex items-center justify-center hover:bg-zinc-100 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.product.id)}
                          aria-label="إزالة"
                          className="p-1.5 text-zinc-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Checkout Form */}
                  <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4">
                    <h4 className="text-sm font-bold text-zinc-900">بيانات الشحن وإتمام الطلب</h4>

                    {checkoutError && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                        {checkoutError}
                      </div>
                    )}

                    <div className="space-y-3">
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="الاسم الكامل للمستلم"
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="tel"
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="رقم الهاتف"
                          dir="ltr"
                          className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
                        />
                        <input
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="المدينة"
                          className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
                        />
                      </div>
                      <input
                        type="text"
                        required
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        placeholder="العنوان التفصيلي (الحي، الشارع، رقم المنزل)"
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="البريد الإلكتروني (اختياري)"
                        dir="ltr"
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
                      />

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {store.enable_cod && (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('cod')}
                            className={`py-2.5 px-3 text-xs font-medium rounded-lg border text-center cursor-pointer ${
                              paymentMethod === 'cod'
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            الدفع عند الاستلام
                          </button>
                        )}
                        {store.enable_card && (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('card')}
                            className={`py-2.5 px-3 text-xs font-medium rounded-lg border text-center cursor-pointer ${
                              paymentMethod === 'card'
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            بطاقة بنكية
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="ملاحظات إضافية للمندوب (اختياري)"
                        className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                    </div>
                  </form>
                </>
              )}
            </div>

            {cart.length > 0 && !confirmedReceipt && (
              <div className="p-6 border-t border-zinc-200 bg-[#FAFAFA] space-y-3">
                <div className="space-y-1 text-xs text-zinc-600">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي</span>
                    <span className="font-mono-tabular">
                      {formatMoney(cartSubtotal, store.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>رسوم الشحن</span>
                    <span className="font-mono-tabular">
                      {computedShippingFee === 0
                        ? 'مجاني'
                        : formatMoney(computedShippingFee, store.currency)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t border-zinc-200">
                  <span className="font-semibold text-zinc-800">الإجمالي النهائي</span>
                  <span className="text-lg font-bold font-mono-tabular text-zinc-900">
                    {formatMoney(cartGrandTotal, store.currency)}
                  </span>
                </div>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={submittingOrder}
                  style={{ backgroundColor: accent }}
                  className="w-full py-3 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {submittingOrder ? 'جاري إرسال الطلب...' : 'تأكيد وإرسال الطلب'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
