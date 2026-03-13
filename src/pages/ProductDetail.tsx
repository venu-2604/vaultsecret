import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, ShieldCheck, Truck } from 'lucide-react';
import { ALL_PRODUCTS } from '@/lib/products';

export default function ProductDetail() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const product = useMemo(
    () => ALL_PRODUCTS.find(p => p.id === Number(productId)),
    [productId]
  );

  if (!product) {
    return (
      <div className="min-h-screen bg-[#f3f3f3] flex items-center justify-center px-4">
        <div className="bg-white rounded-md shadow-sm border border-border/60 px-6 py-8 max-w-md w-full text-center">
          <p className="text-sm font-semibold text-black mb-2">
            Product not found
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            The product you&apos;re looking for might have moved or no longer exists.
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 text-xs px-4 py-2 rounded-md bg-[#febd69] text-black font-semibold hover:bg-[#f4a944] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Shopzone
          </button>
        </div>
      </div>
    );
  }

  const related = useMemo(() => {
    const sameCategory = ALL_PRODUCTS.filter(
      p => p.id !== product.id && p.category === product.category
    );
    const others = ALL_PRODUCTS.filter(p => p.id !== product.id && p.category !== product.category);
    return [...sameCategory, ...others].slice(0, 8);
  }, [product.id, product.category]);

  return (
    <div className="min-h-screen bg-[#f3f3f3] text-foreground">
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Top back button */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to results
        </button>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Left: image gallery */}
        <section>
          <div className="bg-white border border-border/60 rounded-md shadow-sm p-4 flex flex-col gap-3">
            <div className="w-full bg-muted rounded-md overflow-hidden flex items-center justify-center min-h-[260px] md:min-h-[360px]">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pt-1">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-16 w-16 bg-muted rounded border border-border/60 overflow-hidden flex-shrink-0"
                >
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right: details and actions */}
        <section className="space-y-4">
          <div className="bg-white border border-border/60 rounded-md shadow-sm p-4 space-y-2">
            <p className="text-xs text-sky-700 font-semibold">
              {product.category} • Shopzone
            </p>
            <h1 className="text-lg md:text-xl font-semibold text-black">
              {product.name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                4.{product.id % 5}
              </span>
              <span>•</span>
              <span>{(product.id + 3) * 73} ratings</span>
            </div>
            {product.badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-[10px] font-semibold text-green-700">
                {product.badge}
              </span>
            )}
          </div>

          <div className="bg-white border border-border/60 rounded-md shadow-sm p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Price</p>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-semibold text-black">{product.price}</p>
                <p className="text-xs text-muted-foreground line-through">
                  MRP: {(Number(product.id) * 400 + 999).toLocaleString('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0,
                  })}
                </p>
                <p className="text-xs text-green-700 font-semibold">
                  {(70 + (product.id % 5))}% off
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Inclusive of all taxes.</p>
              <p className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-emerald-600" />
                FREE delivery by Shopzone on eligible orders.
              </p>
              <p className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                Secure transaction • Easy returns within 7 days.
              </p>
            </div>
          </div>

          <div className="bg-white border border-border/60 rounded-md shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-emerald-700">In stock</p>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground" htmlFor="quantity">
                Quantity
              </label>
              <select
                id="quantity"
                className="border border-border/60 rounded px-2 py-1 text-xs bg-white"
                defaultValue="1"
              >
                {[1, 2, 3, 4].map(q => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-full bg-[#ffd814] hover:bg-[#f7ca00] text-xs font-semibold py-2 transition-colors"
              >
                Add to cart
              </button>
              <button
                type="button"
                className="w-full rounded-full bg-[#ffa41c] hover:bg-[#f38c06] text-xs font-semibold py-2 transition-colors"
              >
                Buy now
              </button>
            </div>
          </div>
        </section>
        </div>

        {/* Related products */}
        <section className="bg-white border border-border/60 rounded-md shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-black">
              Customers who viewed this item also viewed
            </h2>
            <span className="text-[11px] text-muted-foreground">
              More like this
            </span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {related.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/product/${p.id}`)}
                className="min-w-[180px] bg-white rounded-md border border-border/50 p-3 flex flex-col gap-1 text-[11px] text-left"
              >
                <div className="h-40 bg-muted rounded-sm overflow-hidden flex items-center justify-center">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="line-clamp-2 mt-1 text-xs text-black">{p.name}</p>
                <p className="text-[10px] text-amber-600 font-semibold">
                  ★★★★☆ <span className="text-muted-foreground">({(p.id + 2) * 53})</span>
                </p>
                <p className="text-sm font-semibold text-black">{p.price}</p>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
