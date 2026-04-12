export enum ProductMainType {
  NOS = 'Nos',
  REGULAR = 'Regular',
  POLY_CARBONATE = 'Poly Carbonate',
  POLY_CARBONATE_ROLL = 'Poly Carbonate Roll',
  ACCESSORIES = 'Accessories'
}

export enum ProductCalculationType {
  SQ_FEET = 'SQ_FEET',
  MM = 'MM'
}

export enum PolyCarbonateType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  FULL_SHEET = 'FULL_SHEET'
}

// Add a new mapping for display values
export const PolyCarbonateTypeDisplay = {
  [PolyCarbonateType.SINGLE]: 'Single',
  [PolyCarbonateType.DOUBLE]: 'Double',
  [PolyCarbonateType.FULL_SHEET]: 'Full sheet'
};

export interface Product {
  id?: number;
  name: string;
  hsnCode?: string;
  productCode?: string;
  materialName?: string;
  categoryId: number;
  categoryName?: string;
  description: string;
  minimumStock: number;
  remainingQuantity?: number;
  purchaseAmount?: number;
  saleAmount?: number;
  measurement?: string;
  status: 'A' | 'I';
  blockedQuantity?: number;
  totalRemainingQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
  weight: number;
  type: ProductMainType;
  calculationType?: ProductCalculationType;
  polyCarbonateType?: PolyCarbonateType;
  // New field for sqFeetMultiplier - only for REGULAR product type
  sqFeetMultiplier?: number;
  // New normalized map from API: keys like "6","8",... with numeric rates
  accessoriesWeight?: { [size: string]: number };
  accessories_size_rate?: { [size: string]: number };
  taxPercentage?: number;
}

export interface ProductSearchRequest {
  search?: string;
  hsnCode?: string;
  productCode?: string;
  materialName?: string;
  categoryId?: number;
  status?: string;
  size?: number;
  page?: number;
}

export interface ProductResponse {
  success: boolean;
  message: string;
  data: {
    content: Product[];
    totalElements: number;
    totalPages: number;
  };
}