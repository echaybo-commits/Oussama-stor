export interface User {
  id: number;
  name: string;
  email: string;
}

export interface StoreStats {
  productCount: number;
  publishedProductCount: number;
  lowStockCount: number;
  orderCount: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  keyCount: number;
}

export interface Store {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  tagline: string;
  category: string;
  currency: string;
  accent_color: string;
  hero_image: string;
  is_active: boolean;
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
  created_at: string;
  publicPath: string;
  stats: StoreStats;
}

export interface DirectoryStore {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  category: string;
  currency: string;
  accent_color: string;
  hero_image: string;
  productCount: number;
}

export interface Product {
  id: number;
  store_id: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  compare_at_price?: number | null;
  stock: number;
  image_url: string;
  is_published?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id?: number;
  order_id?: number;
  product_id?: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: number;
  store_id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  shipping_address: string;
  city: string;
  payment_method: 'cod' | 'card';
  status: OrderStatus;
  shipping_fee: number;
  total_amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface IntegrationKey {
  id: number;
  store_id: number;
  key_name: string;
  key_label: string;
  key_prefix: string;
  last_rotated_at: string;
  created_at: string;
  encrypted: boolean;
}

export interface SyncEvent {
  id: number;
  store_id: number;
  direction: 'storefront_to_seller' | 'seller_to_storefront';
  event_type: string;
  summary: string;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface AnalyticsPoint {
  date: string;
  label: string;
  visits: number;
  sales: number;
  orders: number;
}

export interface StoreAnalytics {
  days: number;
  summary: {
    totalVisits: number;
    totalSales: number;
    totalOrders: number;
    avgDailyVisits: number;
    conversionRate: number;
  };
  series: AnalyticsPoint[];
}

