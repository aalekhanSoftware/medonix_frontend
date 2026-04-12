export interface Purchase {
  // id?: number;
  productId?: number;
  productName?: string;
  categoryId?: number;
  categoryName?: string;
  quantity?: number;
  unitPrice?: number;
  // purchaseDate: string;
  // invoiceNumber?: string;
  otherExpenses?: number;
  remainingQuantity?: number;
  // totalAmount?: number;
  remarks?: string;
  batchNumber?: string;
  isQcPass?: boolean;

  id?: number;
  customerId: number;
  purchaseDate: string;
  invoiceNumber: string;
  customerName?: string;
  totalPurchaseAmount?: number;
  products: PurchaseProduct[];
  totalAmount: number;
  totalProducts: number;
  price?: number;
  taxAmount?: number;
  discountAmount?: number;
}

export interface PurchaseSearchRequest {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  categoryId?: number;
  productId?: number;
}

export interface PurchaseResponse {
  content: Purchase[];
  totalElements: number;
  totalPages: number;
}

export interface PurchaseProduct {
  productId: number;
  quantity: number;
  unitPrice: number;
  price: number;
  discountPercentage?: number;
  discountAmount?: number;
  discountPrice?: number;
  taxPercentage: number;
  taxAmount: number;
  batchNumber?: string;
  remarks?: string;
}

/**
 * Lightweight purchase item used for dropdowns / quick selectors.
 * Source: `GET /api/purchases/last-6-months`
 */
export interface PurchaseRecent {
  id: number;
  purchaseDate: string;
  invoiceNumber: string;
  totalPurchaseAmount: number;
  customerId: number;
  customerName: string;
  numberOfItems: number;
  isQcPass: boolean;
}

export interface PurchaseRecentResponse {
  success: boolean;
  message: string;
  data: PurchaseRecent[];
}