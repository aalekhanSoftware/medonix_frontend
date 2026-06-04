/** Keys passed to searchable-select so product code (e.g. MWP.11.08) is searchable. */
export const PRODUCT_SELECT_SEARCH_KEYS = ['productCode', 'name', 'materialName'] as const;

/**
 * Builds product label: name (materialName) (productCode) — material and code only when non-empty.
 */
export function buildProductDisplayName(product: any): string {
  if (!product) {
    return '';
  }

  const material =
    typeof product.materialName === 'string'
      ? product.materialName.trim()
      : (typeof product.material_name === 'string' ? product.material_name.trim() : '');
  const rawCode =
    typeof product.productCode === 'string'
      ? product.productCode
      : (typeof product.product_code === 'string' ? product.product_code : '');
  const code = rawCode.trim();

  let displayName = product.name ?? '';
  if (material) {
    displayName += ` (${material})`;
  }
  if (code) {
    displayName += ` (${code})`;
  }
  return displayName;
}

/** Normalizes getProducts/refresh API payload to a list with displayName set. */
export function toProductOptionsList(data: any): any[] {
  if (data == null) {
    return [];
  }
  const list = Array.isArray(data) ? data : (data?.content ?? data);
  if (!Array.isArray(list)) {
    return [];
  }
  return transformProductsWithDisplayName(list);
}

/** Adds displayName and normalized materialName/productCode for dropdowns and search. */
export function transformProductsWithDisplayName(products: any[]): any[] {
  if (!products?.length) {
    return products ?? [];
  }
  return products.map(product => {
    const material =
      typeof product.materialName === 'string'
        ? product.materialName.trim()
        : (typeof product.material_name === 'string' ? product.material_name.trim() : '');
    const rawCode =
      typeof product.productCode === 'string'
        ? product.productCode
        : (typeof product.product_code === 'string' ? product.product_code : '');
    const code = rawCode.trim();

    return {
      ...product,
      materialName: material || product.materialName,
      productCode: code || product.productCode,
      displayName: buildProductDisplayName(product)
    };
  });
}
