import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, ArrowRight, ArrowLeft, Heart, ShoppingBag } from 'lucide-react';
import vsLogo from '@/assets/vs-logo.png';
import { hashPassword } from '@/lib/crypto';
import { useUser } from '@/hooks/useUser';
import LoginForm from '@/components/LoginForm';
import { ALL_PRODUCTS, type Product } from '@/lib/products';

const SECRET_CODE = 'vs2614';
const HERO_BG_URL =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSX_OYr14qncHNweMlweBu-uNZdgJqcV5HMoQ&s';

const LOWER_NAV_ITEMS = [
  'Groceries',
  'Gift Cards',
  'Shopzone Pay',
  'Buy Again',
  'Zone Plus',
  'Home Improvement',
  'Health & Personal Care',
  "Today's Deals",
  'Books',
  'Sell',
  'Electronics',
  'Jewelry',
  'Home & Kitchen',
  'Beauty',
  'Toys & Games',
  'Sports & Outdoors',
  'Automotive',
  'Tools & Home Improvement',
] as const;

export default function Index() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchCategory, setSearchCategory] = useState<string>('All');
  const [showSecretLogin, setShowSecretLogin] = useState(false);
  const searchResultsRef = useRef<HTMLElement>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [navPanel, setNavPanel] = useState<'account' | 'orders' | 'cart' | null>(null);
  const [showAllMenu, setShowAllMenu] = useState(false);
  const [activeLowerNav, setActiveLowerNav] = useState<string | null>(null);
  const [blurred, setBlurred] = useState(false);
  const navigate = useNavigate();
  const { user, loading: userLoading, login, logout } = useUser();

  // Privacy: blur when tab/window is in background (mobile and desktop) so previews don’t show content
  useEffect(() => {
    const handleVisibility = () => {
      setBlurred(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const mensProducts = useMemo(
    () => ALL_PRODUCTS.filter(p => p.category.toLowerCase() === 'men'),
    []
  );

  const handleLowerNavClick = (item: (typeof LOWER_NAV_ITEMS)[number]) => {
    setActiveLowerNav(item);
    // Map nav item to existing product categories where possible
    let category: string = 'All';
    if (item === 'Electronics') category = 'Electronics';
    else if (item === 'Groceries' || item === 'Home Improvement' || item === 'Home & Kitchen') category = 'Home';
    else if (item === 'Beauty') category = 'Women';
    else if (item === 'Toys & Games' || item === 'Sports & Outdoors') category = 'Kids';
    else if (item === 'Automotive' || item === 'Tools & Home Improvement') category = 'Sports';

    setSearchCategory(category);
    setShowSecretLogin(false);
    // Clear any previous text search so category filter is obvious
    setSearch('');
    // Smooth scroll to product grid area
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const heroSlides = useMemo(() => {
    const mens = mensProducts.slice(0, 6);
    const women = ALL_PRODUCTS.filter(p => p.category.toLowerCase() === 'women').slice(0, 6);
    const electronics = ALL_PRODUCTS.filter(p => p.category.toLowerCase() === 'electronics').slice(0, 6);
    const home = ALL_PRODUCTS.filter(p => p.category.toLowerCase() === 'home').slice(0, 6);

    return [
      {
        tag: "TODAY'S DEALS",
        title: 'Up to 60% off | Men’s wear',
        description: 'T‑shirts, jeans, jackets & more. Limited time offers.',
        chips: ['Best sellers', 'Top rated', 'Fast delivery'],
        items: mens,
        accent: 'from-amber-400/30 via-orange-300/20 to-rose-300/20',
      },
      {
        tag: 'MEGA SAVINGS',
        title: 'Wardrobe refresh | Women’s picks',
        description: 'Dresses, bags & trending styles at great prices.',
        chips: ['New arrivals', 'Trending', 'Easy returns'],
        items: women,
        accent: 'from-fuchsia-400/25 via-pink-300/15 to-purple-300/20',
      },
      {
        tag: 'TECH WEEK',
        title: 'Best of Electronics',
        description: 'Headphones, smartwatches & everyday gadgets.',
        chips: ['Hot deals', 'Top brands', 'Secure payments'],
        items: electronics,
        accent: 'from-sky-400/25 via-cyan-300/15 to-emerald-300/15',
      },
      {
        tag: 'HOME ESSENTIALS',
        title: 'Upgrade your home',
        description: 'Comfort, décor & daily needs—handpicked for you.',
        chips: ['Value packs', 'Top picks', 'Budget friendly'],
        items: home,
        accent: 'from-emerald-400/20 via-lime-300/15 to-amber-300/15',
      },
    ] as const;
  }, [mensProducts]);

  useEffect(() => {
    if (heroPaused) return;
    if (!heroSlides.length) return;
    const id = window.setInterval(() => {
      setHeroIndex(i => (i + 1) % heroSlides.length);
    }, 3500);
    return () => window.clearInterval(id);
  }, [heroPaused, heroSlides.length]);

  useEffect(() => {
    if (!heroSlides.length) return;
    if (heroIndex >= heroSlides.length) setHeroIndex(0);
  }, [heroIndex, heroSlides.length]);

  const filteredProducts = useMemo(() => {
    let list = ALL_PRODUCTS;
    if (searchCategory && searchCategory !== 'All') {
      list = list.filter(
        p => p.category.toLowerCase() === searchCategory.toLowerCase()
      );
    }
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      p =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
    );
  }, [search, searchCategory]);

  const activeSearchTerm = search.trim();
  const searchResults =
    activeSearchTerm && !showSecretLogin ? filteredProducts : [];
  const hasActiveSearch = activeSearchTerm.length > 0 && !showSecretLogin;

  const goToProduct = (product: Product) => {
    navigate(`/product/${product.id}`);
  };

  const handleJoin = async () => {
    if (!password.trim() || !user) return;
    setLoading(true);
    const roomId = await hashPassword(password);
    try {
      // User is intentionally starting a chat: clear any auto-logout flag
      localStorage.removeItem('vaultsecret_force_index');
    } catch {
      // ignore
    }
    navigate(`/chat/${roomId}`, { state: { password, userId: user.id, userName: user.full_name } });
  };

  const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = search.trim().toLowerCase();
    if (!term) return;
    if (term === SECRET_CODE) {
      setShowSecretLogin(true);
      setSearch('');
      return;
    }
    setShowSecretLogin(false);
    // Scroll to search results so user sees them
    requestAnimationFrame(() => {
      searchResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full"
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#f3f3f3] text-foreground transition-all duration-300 ${blurred ? 'blur-lg' : ''}`}>
      {/* Amazon-inspired top navbar */}
      <header className="sticky top-0 z-40">
        {/* Main dark bar */}
        <div className="bg-[#131921] text-white">
          <div className="w-full mx-auto flex items-center gap-3 px-4 py-2">
        {/* Logo */}
            <button
              type="button"
              onClick={() => window.location.replace('/')}
              className="flex items-center gap-2 focus:outline-none flex-shrink-0"
              aria-label="Go to Shopzone home"
            >
              <div className="text-2xl font-bold tracking-tight leading-none">
                shopzone
              </div>
            </button>

            {/* Search */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-1 min-w-0 items-stretch mx-2"
            >
              <select
                value={searchCategory}
                onChange={e => setSearchCategory(e.target.value)}
                className="text-xs px-1 bg-gray-100 text-black rounded-l-md border-r border-gray-300 flex-shrink-0 w-[72px] sm:w-[96px]"
              >
                <option value="All">All</option>
                <option value="Men">Clothes (Men)</option>
                <option value="Women">Clothes (Women)</option>
                <option value="Kids">Kids</option>
                <option value="Sports">Sports</option>
                <option value="Electronics">Electronics</option>
                <option value="Accessories">Accessories</option>
                <option value="Home">Home</option>
              </select>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-0 px-3 py-1 text-sm text-black outline-none"
                placeholder="Search Shopzone.in"
              />
              <button className="px-3 bg-[#febd69] text-black rounded-r-md text-sm font-semibold flex-shrink-0">
                Go
              </button>
            </form>

            {/* Language / Account / Orders / Cart */}
            <div className="hidden md:flex items-center gap-4 text-xs">
              <button type="button" className="flex items-center gap-1">
                <span className="text-lg">🇮🇳</span>
                <span className="font-semibold">EN</span>
              </button>
              <button
                type="button"
                onClick={() => setNavPanel(prev => (prev === 'account' ? null : 'account'))}
                className="text-left leading-tight"
              >
                <div className="text-gray-200">Hello</div>
                <div className="font-bold">Account &amp; Lists</div>
              </button>
              <button
                type="button"
                onClick={() => setNavPanel(prev => (prev === 'orders' ? null : 'orders'))}
                className="text-left leading-tight"
              >
                <div>Returns</div>
                <div className="font-bold">&amp; Orders</div>
              </button>
              <button
                type="button"
                onClick={() => setNavPanel(prev => (prev === 'cart' ? null : 'cart'))}
                className="flex items-center gap-1 font-bold"
              >
                <span className="text-lg">🛒</span>
                <span>Cart</span>
              </button>
            </div>
          </div>
        </div>

        {/* Second nav row */}
        <div className="bg-[#232f3e] text-white text-xs">
          <div className="w-full mx-auto flex items-center gap-4 px-4 py-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setShowAllMenu(true)}
              className="font-semibold whitespace-nowrap"
            >
              ☰ All
            </button>
            {LOWER_NAV_ITEMS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => handleLowerNavClick(item)}
                className={`whitespace-nowrap ${
                  activeLowerNav === item ? 'font-semibold text-[#febd69]' : ''
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Simple dropdown panel for Account / Orders / Cart */}
        {navPanel && (
          <div className="bg-white text-black border border-border/60 shadow-lg rounded-md max-w-xs w-full mx-4 mt-2 text-xs">
            {navPanel === 'account' && (
              <div className="p-3 space-y-1">
                <p className="font-semibold text-sm">Your account</p>
                <p className="text-muted-foreground">
                  Sign in with your account to access account &amp; lists.
                </p>
              </div>
            )}
            {navPanel === 'orders' && (
              <div className="p-3 space-y-1">
                <p className="font-semibold text-sm">Your orders</p>
                <p className="text-muted-foreground">
                  You have no recent orders. Start shopping to see them here.
                </p>
              </div>
            )}
            {navPanel === 'cart' && (
              <div className="p-3 space-y-1">
                <p className="font-semibold text-sm">Your cart is empty</p>
                <p className="text-muted-foreground">
                  Browse today&apos;s deals and add items to your cart.
                </p>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Left slide-out menu for "All" */}
      <AnimatePresence>
        {showAllMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black"
              onClick={() => setShowAllMenu(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw] bg-[#131921] text-white shadow-2xl flex flex-col"
            >
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="font-semibold text-sm">All categories</span>
                <button
                  type="button"
                  onClick={() => setShowAllMenu(false)}
                  className="text-xs text-white/70"
                >
                  Close
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-2">
                {LOWER_NAV_ITEMS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      handleLowerNavClick(item);
                      setShowAllMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-white/10 ${
                      activeLowerNav === item ? 'bg-white/15 font-semibold' : ''
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="w-full mx-auto px-4 pb-16 pt-4">
        {showSecretLogin ? (
          <section className="mt-6 space-y-4">
            <button
              type="button"
              onClick={() => {
                setShowSecretLogin(false);
                setPassword('');
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Shopzone home</span>
            </button>

            <div className="grid lg:grid-cols-[1.2fr,0.9fr] gap-8 items-start">
            <div className="hidden lg:flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 via-background to-accent/10 border border-border/60 p-8 text-center">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl overflow-hidden shadow-xl mb-4">
                <img
                  src={vsLogo}
                  alt="VaultSecret logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold gradient-text mb-2">
                VaultSecret
              </h2>
              <p className="text-sm md:text-base text-muted-foreground mb-1">
                Between You and Me...
              </p>
              <p className="text-[11px] text-muted-foreground/90 max-w-sm mt-3">
                Private, password-based rooms for your most personal conversations.
                No accounts, no feeds&mdash;just end-to-end encrypted chat.
              </p>
            </div>

            <div className="max-w-md mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="glass-strong rounded-3xl p-6 md:p-8 shadow-lg"
        >
          {!user ? (
            <LoginForm onLogin={login} />
          ) : (
            <div className="space-y-6">
              {/* Logged in user badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground">{user.full_name}</span>
                </div>
                <button
                  onClick={logout}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Switch
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-2 block">
                  Room Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                          onKeyDown={handlePasswordKeyDown}
                    placeholder="Enter shared password..."
                    className="w-full bg-muted/50 border border-border/50 rounded-xl py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:glow-border transition-all"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Share this password with someone to join the same encrypted room.
                </p>
              </div>

              <button
                onClick={handleJoin}
                disabled={!password.trim() || loading}
                className="w-full gradient-primary text-primary-foreground font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                        />
                ) : (
                  <>
                    Enter Room
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
            </div>
            </div>
          </section>
        ) : (
          <>
            {/* Hero banner - auto-scrolling offers carousel with photo background */}
            <section
              className="mt-0 bg-[#0f2438] text-white"
              style={{
                backgroundImage: `url(${HERO_BG_URL})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            >
              <div
                className="w-full mx-auto px-4 py-10 md:py-16 bg-[#0f2438]/90"
                onMouseEnter={() => setHeroPaused(true)}
                onMouseLeave={() => setHeroPaused(false)}
                onFocusCapture={() => setHeroPaused(true)}
                onBlurCapture={() => setHeroPaused(false)}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={heroIndex}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col md:flex-row items-center gap-10"
                  >
                    <div className="flex-1 space-y-3">
                      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-blue-200">
                        {heroSlides[heroIndex]?.tag || "TODAY'S DEALS"}
                      </p>
                      <h1 className="text-2xl md:text-4xl font-extrabold leading-tight">
                        {heroSlides[heroIndex]?.title || 'Shopzone Deals'}
                      </h1>
                      <p className="text-xs md:text-sm text-blue-100 max-w-xl">
                        {heroSlides[heroIndex]?.description ||
                          'Discover top offers on fashion, electronics and more.'}
                      </p>
                      <div className="flex flex-wrap gap-3 pt-1">
                        {(heroSlides[heroIndex]?.chips || []).map(chip => (
                          <span
                            key={chip}
                            className="px-3 py-1 rounded-full bg-white/10 text-[11px] font-semibold"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-3">
                        {heroSlides.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setHeroIndex(idx)}
                            className={`h-2.5 w-2.5 rounded-full transition-all ${
                              idx === heroIndex ? 'bg-white' : 'bg-white/30 hover:bg-white/50'
                            }`}
                            aria-label={`Go to slide ${idx + 1}`}
                          />
                        ))}
                        <span className="text-[11px] text-white/70 ml-2">
                          {heroPaused ? 'Paused' : 'Auto'}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 hidden md:flex justify-end">
                      <div
                        className={`w-full max-w-lg h-64 md:h-80 bg-gradient-to-br ${
                          heroSlides[heroIndex]?.accent || 'from-blue-500/40 via-cyan-400/40 to-emerald-300/40'
                        } rounded-3xl border border-white/20 overflow-hidden relative`}
                      >
                        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_0_0,#ffffff,transparent_60%),radial-gradient(circle_at_100%_0,#ffffff,transparent_60%)]" />
                        <div className="relative h-full flex items-center justify-center px-6">
                          <div className="grid grid-cols-3 gap-3 w-full">
                            {(heroSlides[heroIndex]?.items || []).slice(0, 6).map(p => (
                              <div
                                key={p.id}
                                className="h-28 md:h-32 bg-white/90 rounded-xl shadow-sm overflow-hidden"
                              >
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </section>

            {/* Girls fashion horizontal strip under hero */}
            <section className="mt-6 bg-white border border-border/60 rounded-md shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-black">
                  Up to 60% off | Best offers on Girls fashion
                </h3>
                <button className="text-xs text-sky-700 hover:underline">
                  See all
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {[
                  'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSSXkIlyCFXsjlUpD684lR8qF1Pl3PQ60PY-xHBsSS3wxT86iCzJbP4YsHbd5AnjukbC17aAN0TUTouvpS7SbDz5jY8JlmWFrQhrgJsAivNcMbT2kFXZWXX',
                  'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTBxB_wxuOn6-kD7XmxoPA7VRj1auFNmQa5HJ6qFFEAxtDJfBKaB1WagC1mbHVOxb6v5oIqA3LqC1Yf5BCyxkdOntQOrYPIV-lgtb-Si8-NopDJkOGjygxGaA',
                  'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQRcqMmDSl9yi0HhNVBf-RjbfXJUijUKIB5ei3xS5zPY2iUfj-22sXg279ZTISR5e9kNeC-o3O3Pahn-AbpCw3hfj2PrsxR5IpzLk4B2H2XCS7B4o9e1qt7',
                  'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSRVHYECHluC87jWCV5PlFctDBFniqOwnsKfV98krJZjEcn3_jFhknTJff6d6HxtsuFfmTsJcL-6e7QEuacPWPFZY0KD-NF1pJZ5D_-gFM',
                  'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcTt6vVQ_a-q5muHVr_klw97SfezlJINIjRbKDPfaNQRlWa-WPV_AgSFloI7bQe5Y1B0I1VJzxdabhf6l4YHbq6onL4xQR83LXeytfEHTlsjGANLooOG8LPG',
                  'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcRse-lmJiFppJIzPKSRaqawib4jlayAbU2nvzvBs_uvCYpl0VxdzdIUuK00YV0sA7KuQ-fSbBTz_QOQpO0kexi0thRjTJ1BID96DMRKhGWAt5N5eLOfNr3Anw',
                  'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQLXvg5yZCoCYy-kniYSPm59Fs_wXtylJ9kRKLRWvQfGUSd-ERzseGO-LZUU-zzoM8AEi7KoZ78hcVXae4E53rxQWFXYTabyaP75kU69yc',
                  'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcSvWfr6Z3Jb3MJN8Sf8BqLGELxtqsFneKDXEJhlyidl096D4MHoogJo37H0obecDdPtuj4uLf3NzjHFmCEFelxtTnB_G9ynSW0-hI_kV_vYnCyVXp1yVlty',
                ].map((src, idx) => (
                  <div
                    key={idx}
                    className="h-40 w-40 bg-muted rounded-sm overflow-hidden flex-shrink-0"
                  >
                    <img
                      src={src}
                      alt="Girls fashion product"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* All products grid */}
            <section className="mt-6">
              <div className="bg-white border border-border/60 rounded-md shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-black">
                    Explore all Shopzone products
                  </h2>
                  <span className="text-[11px] text-muted-foreground">
                    {ALL_PRODUCTS.length} items
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {ALL_PRODUCTS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => goToProduct(p)}
                      className="bg-white border border-border/50 rounded-md p-3 flex flex-col gap-1 text-left text-xs hover:shadow-sm transition-shadow"
                    >
                      <div className="h-36 sm:h-40 bg-muted rounded-sm overflow-hidden flex items-center justify-center">
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="mt-1 line-clamp-2 text-black">{p.name}</p>
                      <p className="text-[10px] text-amber-600 font-semibold">
                        ★★★★☆ <span className="text-muted-foreground">({(p.id + 1) * 61})</span>
                      </p>
                      <p className="text-sm font-semibold text-black">{p.price}</p>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Card grid under hero (Amazon-style rows) */}
            <section className="mt-6 space-y-4">
              {/* First row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Pick up where you left off</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm text-black">
                    {filteredProducts.slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goToProduct(p)}
                        className="space-y-1 text-left"
                      >
                        <div className="h-28 md:h-32 bg-muted rounded-sm overflow-hidden">
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="line-clamp-2">{p.name}</p>
                      </button>
                    ))}
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    See more
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Continue shopping deals</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-black">
                    {ALL_PRODUCTS.slice(1, 7).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goToProduct(p)}
                        className="space-y-1 text-left"
                      >
                        <div className="h-28 md:h-32 bg-muted rounded-sm overflow-hidden">
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="line-clamp-2">{p.name}</p>
                        <p className="font-semibold">{p.price}</p>
                      </button>
                    ))}
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    See more deals
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Deals related to items you&apos;ve saved</h3>
                  <div className="flex flex-wrap gap-3 text-sm text-black">
                    {filteredProducts.slice(2, 5).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goToProduct(p)}
                        className="w-24 space-y-1 text-left"
                      >
                        <div className="h-24 bg-muted rounded-sm overflow-hidden">
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="line-clamp-2">{p.name}</p>
                      </button>
                    ))}
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    See more deals
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Get wholesale prices on 15 Cr+ products</h3>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="h-16 w-24 bg-orange-100 rounded-sm flex items-center justify-center text-xs font-semibold text-orange-700">
                      shopzone<br />business
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Register now
                  </button>
                </article>
              </div>

              {/* Second row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Revamp your home in style</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm text-black">
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/6585752/pexels-photo-6585752.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Cushion covers & bedsheets"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Cushion covers, bedsheets &amp; more</p>
                    </div>
                    <div>
                      <div className="h-20 md:h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/1451479/pexels-photo-1451479.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Figurines & vases"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Figurines, vases &amp; more</p>
                    </div>
                    <div>
                      <div className="h-20 md:h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/3965545/pexels-photo-3965545.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Home storage"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Home storage</p>
                    </div>
                    <div>
                      <div className="h-20 md:h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/112811/pexels-photo-112811.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Lighting solutions"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Lighting solutions</p>
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Explore all
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Up to 60% off | Footwear &amp; handbags</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm text-black">
                    <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Sports shoes"
                        className="w-full h-full object-cover"
                      />
                    </div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/298863/pexels-photo-298863.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Men's shoes"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Women's shoes"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="h-20 md:h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/2983464/pexels-photo-2983464.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Handbags"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    See all offers
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Up to 75% off | Headphones</h3>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="h-40 w-40 bg-muted rounded-lg overflow-hidden">
                      <img
                        src="https://images.pexels.com/photos/3394664/pexels-photo-3394664.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Headphones"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Shop now
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Bulk order discounts &amp; GST savings</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm text-black">
                    <div className="h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/37347/office-freelancer-computer-business-37347.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Laptops"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/3965554/pexels-photo-3965554.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Kitchen appliances"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/37347/office-freelancer-computer-business-37347.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Office furniture"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="h-24 rounded-sm mb-1 overflow-hidden bg-muted">
                      <img
                        src="https://images.pexels.com/photos/3735480/pexels-photo-3735480.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Register your business"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Register your business
                  </button>
                </article>
              </div>

              {/* Men's wear - vertical cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Men&apos;s wear top picks</h3>
                  <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
                    {mensProducts.slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goToProduct(p)}
                        className="text-left"
                      >
                        <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-black line-clamp-2">{p.name}</p>
                      </button>
                    ))}
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    See more
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Up to 50% off | Men&apos;s T‑shirts</h3>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="h-56 md:h-60 w-full bg-muted rounded-sm overflow-hidden">
                      <img
                        src="https://images.pexels.com/photos/6311387/pexels-photo-6311387.jpeg?auto=compress&cs=tinysrgb&w=800"
                        alt="Men's t-shirts"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Shop now
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Jeans, chinos &amp; trousers</h3>
                  <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
                    {mensProducts.filter(p => /jeans|chino|pants/i.test(p.name)).slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goToProduct(p)}
                        className="text-left"
                      >
                        <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-black line-clamp-2">{p.name}</p>
                      </button>
                    ))}
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Explore bottoms
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Trending jackets &amp; blazers</h3>
                  <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
                    {mensProducts.filter(p => /jacket|blazer/i.test(p.name)).slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goToProduct(p)}
                        className="text-left"
                      >
                        <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-black line-clamp-2">{p.name}</p>
                      </button>
                    ))}
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    See styles
                  </button>
                </article>
              </div>

              {/* Men's wear - horizontal strip */}
              <section className="bg-white border border-border/60 rounded-md shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-black">
                    Men&apos;s wear deals | Shirts, tees, jeans &amp; jackets
                  </h3>
                  <button className="text-xs text-sky-700 hover:underline">
                    See all
                  </button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {mensProducts.slice(0, 12).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => goToProduct(p)}
                      className="w-40 flex-shrink-0 space-y-1 text-[11px] text-black text-left"
                    >
                      <div className="h-40 w-40 bg-muted rounded-sm overflow-hidden">
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <p className="line-clamp-2">{p.name}</p>
                      <p className="font-semibold">{p.price}</p>
                    </button>
                  ))}
                </div>
              </section>

              {/* Third row - boys & girls fashion */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <article className="bg-white border border-border/60 rounded-md shadow-sm p-3 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Dress up your little girl</h3>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/3662840/pexels-photo-3662840.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Girls party dress"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Party dresses</p>
                    </div>
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="data:image/jpeg;base64,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"
                          alt="Girls casual wear"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Casual wear</p>
                    </div>
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="data:image/jpeg;base64,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"
                          alt="Girls ethnic"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Ethnic sets</p>
                    </div>
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcQyk2fuPZez-soR0N0lE92Ty2uwHjLvv9U2c4NgwV09e9VtyutI7gR2MUL4ZimF4lfuaNmiPUxW35P1-RZmQMuzmRMxGW4Tp14FBXeSwWBGKkhw_Oy_flpj48Dy"
                          alt="Girls accessories"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Accessories</p>
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Shop girls&apos; fashion
                  </button>
                </article>

                <article className="bg-white border border-border/60 rounded-md shadow-sm p-3 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-black">Dress up your little boy</h3>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcTKpcECBkJnsWzwlIoED0usSIBbYsbI98FnM4BaXwlEE96nyisSPCf1E1RzcEgbkj4WP_XvgqPNvdXNxC6zDhvtVeWiEVvNNV0yjppfos5owzPYT_b0osXR"
                          alt="Boys t‑shirts"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">T‑shirts &amp; polos</p>
                    </div>
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/3662821/pexels-photo-3662821.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Boys casual wear"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Casual sets</p>
                    </div>
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/3875217/pexels-photo-3875217.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Boys ethnic wear"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Ethnic kurta sets</p>
                    </div>
                    <div>
                      <div className="h-28 md:h-32 rounded-sm mb-1 overflow-hidden bg-muted">
                        <img
                          src="https://images.pexels.com/photos/1683975/pexels-photo-1683975.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Boys shoes"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-black">Sneakers &amp; sandals</p>
                    </div>
                  </div>
                  <button className="mt-1 text-xs text-sky-700 hover:underline self-start">
                    Shop boys&apos; fashion
                  </button>
                </article>
              </div>

              {/* Horizontal kitchen deals strips */}
              <div className="space-y-4">
                <section className="bg-white border border-border/60 rounded-md shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-black">
                      Up to 60% off | Best offers on Girls fashion
                    </h3>
                    <button className="text-xs text-sky-700 hover:underline">
                      See all
                    </button>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {[
                      'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSSXkIlyCFXsjlUpD684lR8qF1Pl3PQ60PY-xHBsSS3wxT86iCzJbP4YsHbd5AnjukbC17aAN0TUTouvpS7SbDz5jY8JlmWFrQhrgJsAivNcMbT2kFXZWXX',
                      'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTBxB_wxuOn6-kD7XmxoPA7VRj1auFNmQa5HJ6qFFEAxtDJfBKaB1WagC1mbHVOxb6v5oIqA3LqC1Yf5BCyxkdOntQOrYPIV-lgtb-Si8-NopDJkOGjygxGaA',
                      'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQRcqMmDSl9yi0HhNVBf-RjbfXJUijUKIB5ei3xS5zPY2iUfj-22sXg279ZTISR5e9kNeC-o3O3Pahn-AbpCw3hfj2PrsxR5IpzLk4B2H2XCS7B4o9e1qt7',
                      'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSRVHYECHluC87jWCV5PlFctDBFniqOwnsKfV98krJZjEcn3_jFhknTJff6d6HxtsuFfmTsJcL-6e7QEuacPWPFZY0KD-NF1pJZ5D_-gFM',
'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcTt6vVQ_a-q5muHVr_klw97SfezlJINIjRbKDPfaNQRlWa-WPV_AgSFloI7bQe5Y1B0I1VJzxdabhf6l4YHbq6onL4xQR83LXeytfEHTlsjGANLooOG8LPG',
'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcRse-lmJiFppJIzPKSRaqawib4jlayAbU2nvzvBs_uvCYpl0VxdzdIUuK00YV0sA7KuQ-fSbBTz_QOQpO0kexi0thRjTJ1BID96DMRKhGWAt5N5eLOfNr3Anw',
'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQLXvg5yZCoCYy-kniYSPm59Fs_wXtylJ9kRKLRWvQfGUSd-ERzseGO-LZUU-zzoM8AEi7KoZ78hcVXae4E53rxQWFXYTabyaP75kU69yc',
'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcSvWfr6Z3Jb3MJN8Sf8BqLGELxtqsFneKDXEJhlyidl096D4MHoogJo37H0obecDdPtuj4uLf3NzjHFmCEFelxtTnB_G9ynSW0-hI_kV_vYnCyVXp1yVlty'


                    ].map((src, idx) => (
                      <div key={idx} className="h-40 w-40 bg-muted rounded-sm overflow-hidden flex-shrink-0">
                        <img src={src} alt="Girls fashion product" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-white border border-border/60 rounded-md shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-black">
                      Up to 60% off | Cookware, kitchen tools &amp; more
                    </h3>
                    <button className="text-xs text-sky-700 hover:underline">
                      See all
                    </button>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {[
                      'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQhC3T9azWRRt50kKs2VgdmzUj2nsqPwvXIlLCoKa6ngfgK-ev7Bh2pUeG94ZGwP6OElugNuVFJfRNDw43VP59T1S3JbISyUAeK6mjsYM82ogSuxVU6R7f9',
                      'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcSkSHG-F6WHBqRF530XYwH9mP2ahs71cAdNZ5zY464KBPc-2AoyUwsHQDFWNvBYm0aSqZ9M3CwbFpootLAKYwYYE3U-NjMII3QMuS2yt1oHrP3_-cc2gc7X8A',
                      'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcSNN9lk0P0G_YZXkvOJpugjRxtOba7-tQwdzZ3Jbhpcz7-DqMOo78mPJ0Gu2_lLvtcgFC4rQRlQ8f-qL0EVsmm57QBagBNotKm4j-ElloXWWFG18vTcJC_p',
                      'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcQ7sujWUtVUphBEneynQrTsRio9WiZP4ZYK_LxeJGwaX6zBvoM2hcYC47qhDAr7Z9Cj3_8W6DTWNLzmwSo32ggQ6I2tHGPQnro3J3TbU8WfwQnSdbN138ozQg',
                      'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcRMcUYQs06PjGulLsIUeMzWhQdNKRuC0BLS7Pbt6DxhMM1gyeDSVK2nvdnP8mRVeF2cGfngcOG3c0UL0W8Sz44jyn5N0dI8O41-rUN__8Gk9hktjORV2KaW',
                      'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSN6DsRiQ9jLyBMpK9AK-fKucY2mWXYRIW6byTLQv7oUAweRAJCFeCd9y1L3k8ch304DoeYDU4R2J3r-bTUbLZV_p1MGDwSe4Swk332yaeFSIzAcpOXAm6x',
                      'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcRizFE-B-KnqqR53e5VKdS6mAk5vMocQXFomByZSjV7zqRd9gqgm4zUCcTvojySjv7SopQr3tKYtGCSm2phJ_QNttZhQeJvqstUmJ_KmWOr'
                    ].map((src, idx) => (
                      <div key={idx} className="h-40 w-40 bg-muted rounded-sm overflow-hidden flex-shrink-0">
                        <img src={src} alt="Cookware & kitchen tools" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>

            {/* Search results: show when user has searched, with list or empty state */}
            {hasActiveSearch && (
              <section ref={searchResultsRef} className="mt-8 scroll-mt-4">
                <h2 className="text-sm font-semibold text-black mb-3">
                  Search results for &quot;{activeSearchTerm}&quot;
                  {searchCategory !== 'All' && (
                    <span className="text-muted-foreground font-normal ml-1">
                      in {searchCategory}
                    </span>
                  )}
                </h2>
                {searchResults.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {searchResults.map(product => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => goToProduct(product)}
                        className="bg-white border border-border/60 rounded-md shadow-sm p-3 flex flex-col gap-1 text-sm text-black text-left"
                      >
                        <div className="h-44 md:h-48 bg-muted rounded-sm overflow-hidden flex items-center justify-center">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="mt-1 line-clamp-2 font-medium">{product.name}</p>
                        <p className="text-sm font-semibold">{product.price}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-border/60 rounded-md shadow-sm p-8 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">No results found</p>
                    <p className="text-sm mt-1">
                      Try different keywords or select &quot;All&quot; in the category dropdown.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Full-width recommendation strip */}
            <section className="mt-8 bg-white border-t border-border/40">
              <div className="w-full mx-auto px-4 py-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-sm font-semibold text-black">
                    Customers who viewed items in your browsing history also viewed
                  </h2>
                  <span className="text-[11px] text-muted-foreground">Page 1 of 3</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-3">
                  {ALL_PRODUCTS.slice(0, 8).map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => goToProduct(p)}
                      className="min-w-[190px] bg-white rounded-md border border-border/50 p-3 flex flex-col gap-1 text-[11px] text-left"
                    >
                      <div className="h-52 bg-muted rounded-sm overflow-hidden flex items-center justify-center">
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <p className="line-clamp-2 mt-1 text-xs text-black">{p.name}</p>
                      <p className="text-[10px] text-amber-600 font-semibold">
                        ★★★★☆ <span className="text-muted-foreground">({(idx + 1) * 73})</span>
                      </p>
                      <p className="text-sm font-semibold text-black">{p.price}</p>
                      <p className="text-[10px] text-muted-foreground">
                        FREE Delivery by Shopzone
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#131921] text-white mt-8">
        <div className="max-w-6xl mx-auto px-4 py-8 text-xs md:text-sm space-y-6">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="md:w-1/3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight">shopzone</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Shopzone brings together fashion, electronics, home essentials and business
                supplies under one roof. Discover curated collections, bulk offers and
                everyday deals designed to save you time and money.
              </p>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-6 text-[11px] text-gray-200">
              <div className="space-y-1">
                <p className="font-semibold text-white mb-1">Get to Know Us</p>
                <p>About Shopzone</p>
                <p>Careers</p>
                <p>Press Releases</p>
                <p>Shopzone Science</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-white mb-1">Make Money with Us</p>
                <p>Sell on Shopzone</p>
                <p>Advertise Your Products</p>
                <p>Become an Affiliate</p>
                <p>Protect and Build Your Brand</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-white mb-1">Let Us Help You</p>
                <p>Your Account</p>
                <p>Returns &amp; Replacements</p>
                <p>Help Center</p>
                <p>Report a Problem</p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-300">
            <div className="flex flex-wrap gap-4">
              <span>Conditions of Use</span>
              <span>Privacy Notice</span>
              <span>Cookies &amp; Ads</span>
            </div>
            <span>© {new Date().getFullYear()} Shopzone. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
