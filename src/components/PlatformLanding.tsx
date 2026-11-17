import {
  ArrowUpLeft,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  MessageCircle,
  PackagePlus,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, getFullStoreUrl } from '../lib/api';
import { DirectoryStore } from '../types';
import { ResilientImage } from './ResilientImage';

interface PlatformLandingProps {
  onNavigate: (path: string) => void;
}

export function PlatformLanding({ onNavigate }: PlatformLandingProps) {
  const [stores, setStores] = useState<DirectoryStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getStorefrontDirectory()
      .then((res) => {
        if (active) {
          setStores(res.stores);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'تعذر تحميل المتاجر.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopy = (slug: string) => {
    const url = getFullStoreUrl(slug);
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1800);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-zinc-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="font-display text-2xl font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
          >
            youstor
          </a>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600">
            <a
              href="#stores"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              المتاجر النشطة
            </a>
            <a
              href="#features"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              مميزات المنصة
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
              onClick={() => onNavigate('/dashboard')}
              className="px-4 py-2 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              أطلق متجرك الآن
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* YouCan-Inspired Clean Conversion Hero */}
        <section className="bg-white border-b border-zinc-200">
          <div className="max-w-[1200px] mx-auto px-6 py-14 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-semibold text-pink-600 mb-3">
                  منصة التجارة الإلكترونية متعددة المتاجر · دعم كامل للدرهم المغربي (MAD)
                </p>
                <h1
                  className="text-3xl sm:text-4xl lg:text-[2.85rem] font-bold leading-[1.2] text-zinc-900 mb-5"
                  style={{ textWrap: 'balance' }}
                >
                  حوّل مشروعك إلى متجر إلكتروني مستقل خلال دقائق
                </h1>
                <p className="text-base text-zinc-600 leading-relaxed mb-8 max-w-[56ch]">
                  تمنحك منصة youstor لوحة تحكم احترافية لإضافة منتجاتك وتتبع العدادات
                  والإحصائيات والطلبات، مع رابط مستقل خاص بمتجرك تلقائياً ومزامنة آمنة
                  عبر قاعدة بيانات مركزية ومفاتيح ربط مشفرة.
                </p>

                <div className="flex flex-wrap items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => onNavigate('/dashboard')}
                    className="px-6 py-3.5 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <span>أنشئ متجرك واحصل على رابطك</span>
                    <ArrowUpLeft className="w-4 h-4" />
                  </button>
                  <a
                    href="#stores"
                    className="px-5 py-3.5 text-sm font-semibold text-zinc-800 bg-zinc-50 border border-zinc-300 hover:border-zinc-400 rounded-lg transition-colors whitespace-nowrap"
                  >
                    تصفح المتاجر المباشرة
                  </a>
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-200 grid grid-cols-3 gap-4 text-xs text-zinc-600">
                  <div>
                    <span className="block text-base font-bold font-mono-tabular text-zinc-900">
                      MAD / د.م
                    </span>
                    <span>دعم الدرهم والعملات</span>
                  </div>
                  <div>
                    <span className="block text-base font-bold text-emerald-700">
                      توصيل مجاني
                    </span>
                    <span>شحن مجاني لجميع المدن</span>
                  </div>
                  <div>
                    <span className="block text-base font-bold font-mono-tabular text-zinc-900">
                      AES-256
                    </span>
                    <span>تشفير مفاتيح الربط</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="h-full min-h-[340px] rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-100">
                  <ResilientImage
                    src="/src/assets/images/store_hero_artisan_1794923524198.jpg"
                    alt="واجهة متجر احترافي على منصة youstor"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Active Stores Directory */}
        <section id="stores" className="py-16 bg-[#FAFAFA]">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 mb-2">
                  متاجر نشطة مبنية على youstor
                </h2>
                <p className="text-sm text-zinc-600">
                  كل متجر يمتلك رابطاً عاماً مستقلاً وتصميماً مخصصاً مرتبطاً مباشرة بلوحة التاجر.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="text-sm font-semibold text-pink-600 hover:text-pink-700 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span>أضف متجرك الآن</span>
                <ArrowUpLeft className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-80 rounded-xl border border-zinc-200 bg-white animate-pulse"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm">
                {error}
              </div>
            ) : stores.length === 0 ? (
              <div className="p-12 rounded-xl border border-zinc-200 bg-white text-center">
                <p className="text-zinc-600 text-sm mb-4">لا توجد متاجر نشطة بعد.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('/dashboard')}
                  className="px-4 py-2 text-sm font-semibold text-white bg-pink-600 rounded-lg cursor-pointer"
                >
                  أنشئ أول متجر
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {stores.map((store) => (
                  <article
                    key={store.id}
                    className="group flex flex-col rounded-xl border border-zinc-200 bg-white overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div className="aspect-[4/3] bg-zinc-100 overflow-hidden border-b border-zinc-200">
                      <ResilientImage
                        src={store.hero_image}
                        alt={store.name}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                        <span>{store.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{store.productCount} منتج</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{store.currency}</span>
                      </div>

                      <h3 className="text-lg font-bold text-zinc-900 mb-1.5">{store.name}</h3>
                      <p className="text-sm text-zinc-600 line-clamp-2 mb-4 flex-1">
                        {store.tagline}
                      </p>

                      <div className="pt-4 border-t border-zinc-200/80 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => handleCopy(store.slug)}
                          title="نسخ رابط المتجر المستقل"
                          className="text-xs font-mono-tabular text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1.5 truncate max-w-[170px] cursor-pointer"
                          dir="ltr"
                        >
                          {copiedSlug === store.slug ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="truncate">/store/{store.slug}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onNavigate(`/store/${store.slug}`)}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>زيارة المتجر</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Platform Capabilities */}
        <section id="features" className="border-t border-zinc-200 bg-white py-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">
                كل ما يحتاجه التاجر في مكان واحد
              </h2>
              <p className="text-sm text-zinc-600">
                أدوات عملية مستوحاة من أفضل منصات التجارة الإلكترونية لتشغيل متجرك ومضاعفة
                مبيعاتك بأمان تام.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 rounded-xl border border-zinc-200 bg-[#FAFAFA]">
                <PackagePlus className="w-5 h-5 text-pink-600 mb-4" />
                <h3 className="text-base font-bold text-zinc-900 mb-2">
                  استوديو إضافة المنتجات
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  أضف منتجاتك برفع الصور مباشرة، مع سعر التخفيض، والمخزون، ومعاينة فورية لشكل
                  البطاقة في المتجر.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-zinc-200 bg-[#FAFAFA]">
                <BarChart3 className="w-5 h-5 text-pink-600 mb-4" />
                <h3 className="text-base font-bold text-zinc-900 mb-2">
                  عدادات وإحصائيات شاملة
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  راقب المبيعات بالدرهم، متوسط قيمة السلة، عدادات حالات الطلبات الخمس، وتنبيهات
                  المخزون المنخفض.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-zinc-200 bg-[#FAFAFA]">
                <ShieldCheck className="w-5 h-5 text-pink-600 mb-4" />
                <h3 className="text-base font-bold text-zinc-900 mb-2">
                  توصيل مجاني ودفع عند الاستلام
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  شحن مجاني مفعل افتراضياً لجميع المدن، نموذج طلب سريع داخل صفحة المنتج، ودعم
                  مباشر عبر واتساب.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-zinc-200 bg-[#FAFAFA]">
                <KeyRound className="w-5 h-5 text-pink-600 mb-4" />
                <h3 className="text-base font-bold text-zinc-900 mb-2">
                  قاعدة مركزية مشفرة
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  مزامنة عبر API داخلي بين الواجهتين مع تشفير مفاتيح الربط بخوارزمية AES-256-GCM.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Support Team / Contact Us */}
        <section id="support" className="border-t border-zinc-200 bg-[#FAFAFA] py-12">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 mb-1.5">
                  فريق الدعم — تواصل معنا
                </h2>
                <p className="text-sm text-zinc-600">
                  هل تحتاج مساعدة في إطلاق متجرك أو إضافة منتجاتك؟ فريق الدعم متاح للرد المباشر عبر
                  الهاتف أو واتساب.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <a
                  href="tel:+212641747082"
                  className="px-4 py-2.5 text-sm font-semibold text-zinc-900 bg-zinc-50 border border-zinc-300 hover:bg-zinc-100 rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  <Phone className="w-4 h-4 text-pink-600" />
                  <span dir="ltr" className="font-mono-tabular">
                    +212 641-747082
                  </span>
                </a>
                <a
                  href="https://wa.me/212641747082"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>تواصل معنا عبر واتساب</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white py-8">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <span>© 2026 youstor — منصة التجارة الإلكترونية متعددة المتاجر</span>
          <div className="flex flex-wrap items-center gap-6">
            <a
              href="tel:+212641747082"
              className="hover:text-zinc-900 inline-flex items-center gap-1.5 transition-colors"
            >
              <span>فريق الدعم:</span>
              <span dir="ltr" className="font-mono-tabular font-semibold text-zinc-800">
                +212 641-747082
              </span>
            </a>
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/dashboard');
              }}
              className="hover:text-zinc-900 transition-colors"
            >
              لوحة تحكم التاجر
            </a>
            <a href="#stores" className="hover:text-zinc-900 transition-colors">
              المتاجر النشطة
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
