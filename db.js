// db.js - Supabase queries for product catalog
const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

// Get all products (for Claude context)
async function getCatalogSummary() {
  const { data } = await supabase
    .from("products")
    .select("id, name_ru, category, texture, color, size, price, article")
    .eq("in_stock", true)
    .order("id");
  return data || [];
}

// Get products by IDs (after Claude selects them)
async function getProductsByIds(ids) {
  const { data } = await supabase
    .from("products")
    .select("*")
    .in("id", ids)
    .eq("in_stock", true);
  return data || [];
}

// Search products by filters
async function searchProducts(filters) {
  let query = supabase.from("products").select("*").eq("in_stock", true);

  if (filters.category) query = query.ilike("category", `%${filters.category}%`);
  if (filters.size) query = query.eq("size", filters.size);
  if (filters.color) query = query.ilike("color", `%${filters.color}%`);
  if (filters.maxPrice) query = query.lte("price", filters.maxPrice);
  if (filters.minPrice) query = query.gte("price", filters.minPrice);

  const { data } = await query.order("price");
  return data || [];
}

module.exports = { getCatalogSummary, getProductsByIds, searchProducts };
