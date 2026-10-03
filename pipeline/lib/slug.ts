/** URL-safe ASCII slug: "Crème Fraîche & Co." -> "creme-fraiche-co". */
export function slugify(input: string, maxLength = 60): string {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= maxLength) return s;
  const cut = s.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/** Product URLs carry the barcode, which keeps them unique and stable across data refreshes. */
export function productSlug(name: string, brand: string | null, code: string): string {
  const includeBrand = brand && !name.toLowerCase().includes(brand.toLowerCase());
  const base = slugify(includeBrand ? `${brand} ${name}` : name);
  return base ? `${base}-${code}` : code;
}
