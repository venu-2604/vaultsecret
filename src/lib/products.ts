export interface Product {
  id: number;
  name: string;
  category: string;
  price: string;
  badge?: string;
  image: string;
}

// Central catalog used across the app (home page, detail page, etc.)
export const ALL_PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Men Solid Cotton T‑Shirt",
    category: "Men",
    price: "₹799",
    badge: "BESTSELLER",
    image:
      "https://images.pexels.com/photos/3755706/pexels-photo-3755706.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 2,
    name: "Women Floral A‑Line Dress",
    category: "Women",
    price: "₹1,499",
    badge: "NEW",
    image:
      "https://images.pexels.com/photos/7940621/pexels-photo-7940621.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 3,
    name: "Kids Printed Hoodie",
    category: "Kids",
    price: "₹1,199",
    image:
      "https://images.pexels.com/photos/3763584/pexels-photo-3763584.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 4,
    name: "Running Shoes",
    category: "Sports",
    price: "₹2,999",
    badge: "TRENDING",
    image:
      "https://images.pexels.com/photos/19090/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 5,
    name: "Casual Checked Shirt",
    category: "Men",
    price: "₹1,299",
    image:
      "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 6,
    name: "Ethnic Anarkali Kurta",
    category: "Women",
    price: "₹1,999",
    image:
      "https://images.pexels.com/photos/6311572/pexels-photo-6311572.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 7,
    name: "Wireless Over‑Ear Headphones",
    category: "Electronics",
    price: "₹3,499",
    badge: "HOT",
    image:
      "https://images.pexels.com/photos/373945/pexels-photo-373945.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 8,
    name: "Minimalist Analog Wrist Watch",
    category: "Accessories",
    price: "₹1,799",
    image:
      "https://images.pexels.com/photos/190819/pexels-photo-190819.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 9,
    name: "Leather Crossbody Bag",
    category: "Women",
    price: "₹2,299",
    image:
      "https://images.pexels.com/photos/939660/pexels-photo-939660.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 10,
    name: "Classic Denim Jacket",
    category: "Men",
    price: "₹2,199",
    image:
      "https://images.pexels.com/photos/3758930/pexels-photo-3758930.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 11,
    name: "Cotton Bedsheet Set",
    category: "Home",
    price: "₹1,299",
    image:
      "https://images.pexels.com/photos/164595/pexels-photo-164595.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 12,
    name: "Sports Smartwatch",
    category: "Electronics",
    price: "₹4,999",
    image:
      "https://images.pexels.com/photos/267394/pexels-photo-267394.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 13,
    name: "Women Solid Fit & Flare Dress",
    category: "Women",
    price: "₹1,899",
    badge: "POPULAR",
    image:
      "https://images.pexels.com/photos/6311579/pexels-photo-6311579.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 14,
    name: "Women Polka Dot Midi Dress",
    category: "Women",
    price: "₹1,699",
    image:
      "https://images.pexels.com/photos/6311575/pexels-photo-6311575.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 15,
    name: "Women Casual Summer Dress",
    category: "Women",
    price: "₹1,299",
    image:
      "https://images.pexels.com/photos/6311587/pexels-photo-6311587.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 16,
    name: "Women Belted Shirt Dress",
    category: "Women",
    price: "₹2,099",
    image:
      "https://images.pexels.com/photos/6311622/pexels-photo-6311622.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 17,
    name: "Men Slim Fit Jeans",
    category: "Men",
    price: "₹1,799",
    badge: "TRENDING",
    image:
      "https://images.pexels.com/photos/1342609/pexels-photo-1342609.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 18,
    name: "Men Formal Blazer",
    category: "Men",
    price: "₹3,999",
    badge: "POPULAR",
    image:
      "https://images.pexels.com/photos/450212/pexels-photo-450212.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 19,
    name: "Men Chino Pants",
    category: "Men",
    price: "₹1,599",
    image:
      "https://images.pexels.com/photos/6764034/pexels-photo-6764034.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 20,
    name: "Men Classic Polo T‑Shirt",
    category: "Men",
    price: "₹999",
    image:
      "https://images.pexels.com/photos/9558783/pexels-photo-9558783.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    id: 21,
    name: "Men Lightweight Bomber Jacket",
    category: "Men",
    price: "₹2,899",
    badge: "NEW",
    image:
      "https://images.pexels.com/photos/1040945/pexels-photo-1040945.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
];

