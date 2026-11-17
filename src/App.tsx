import { useCallback, useEffect, useState } from 'react';
import { PlatformLanding } from './components/PlatformLanding';
import { PublicStorefront } from './components/PublicStorefront';
import { SellerDashboard } from './components/SellerDashboard';

function getCurrentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

export default function App() {
  const [pathname, setPathname] = useState<string>(getCurrentPath);

  useEffect(() => {
    const onPopState = () => {
      setPathname(getCurrentPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (nextPath !== window.location.pathname) {
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  if (pathname.startsWith('/dashboard')) {
    return <SellerDashboard onNavigate={navigate} />;
  }

  if (pathname.startsWith('/store/')) {
    const slug = decodeURIComponent(pathname.slice('/store/'.length).split('/')[0] || '');
    if (slug) {
      return <PublicStorefront slug={slug} onNavigate={navigate} />;
    }
  }

  return <PlatformLanding onNavigate={navigate} />;
}
