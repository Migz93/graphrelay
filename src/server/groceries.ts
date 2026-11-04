const aisleItems: Record<string, string[]> = {
  Produce: [
    "apple", "apples", "banana", "bananas", "carrot", "carrots", "onion", "onions",
    "spring onion", "spring onions", "mushroom", "mushrooms", "pepper", "peppers", "bell peppers",
    "tomato", "tomatoes", "cherry tomatoes", "cucumber", "cucumbers", "avocado", "avocados",
    "baby corn", "baby corns", "broccoli", "lettuce", "salad", "salad stuff", "potato", "potatoes",
  ],
  Meat: [
    "chicken", "chicken breast", "chicken breasts", "beef", "bacon", "mince", "beef mince",
    "ham", "sliced ham", "sausages", "sausage", "burgers", "burger", "meatballs",
    "bacon lardons", "lardons", "pork chops",
  ],
  Frozen: [
    "peas", "garden peas", "petit pois", "pizza", "pizzas", "ice cream", "ice lolly", "ice lollies",
    "frozen chips", "frozen vegetables", "frozen veg",
  ],
  Dairy: [
    "cheese", "cheeses", "sliced cheese", "grated cheese", "cream cheese", "cheddar",
    "cheese strings", "cheese string", "cheesestring", "cheesestrings", "milk", "butter", "yoghurt",
    "yogurt", "sour cream", "eggs", "egg", "benecol",
  ],
  Bakery: [
    "bread", "roll", "rolls", "burger bun", "burger buns", "bap", "baps", "bagel", "bagels",
    "protein bagels", "wraps", "tortilla wrap", "tortilla wraps", "naan bread",
  ],
  Pantry: [
    "pasta", "rice", "spaghetti", "noodles", "instant noodles", "super noodles", "veg rice",
    "mayo", "mayonnaise", "ketchup", "ranch sauce", "salad dressing", "pasta sauce",
    "pasta bake sauce", "white pasta sauce", "fajita sauce", "meatball sauce", "gravy",
    "chopped tomatoes", "tomato purée", "garlic granules", "paprika", "chicken seasoning",
    "paprika chicken seasoning", "sugar", "olive oil", "pickles", "cereal", "crisps",
    "coffee", "tea", "chocolate", "biscuits", "canned tuna", "tinned tuna",
  ],
};

const groceries = new Map(Object.entries(aisleItems).flatMap(([aisle, items]) => items.map(item => [item, aisle] as const)));

export function groceryAisle(name: string) {
  // Sizes and counts are ignored for aisle matching only.
  const product = name
    .replace(/^\d+\s*[x×]\s*(?=\p{L})/u, "")
    .replace(/\s*(?:[x×]\s*\d+|\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|l)|\d+\s*[- ]?pack)$/u, "")
    .trim();
  if (/^frozen\s+\S/.test(product)) return "Frozen";
  if (/^(?:tinned|canned)\s+\S/.test(product)) return "Pantry";
  return groceries.get(product) ?? "Other";
}
