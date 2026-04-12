export interface PurchaseOrder {
  id?: number;
  customerId: number;
  orderDate: string;
  invoiceNumber: string;
  customerName?: string;
  totalOrderAmount?: number;
  products: PurchaseOrderItem[];
  totalAmount: number;
  totalProducts: number;
  price?: number;
  taxAmount?: number;
  packagingAndForwadingCharges?: number;
  /**
   * New backend linkage (source of truth). Present on detail responses.
   * A purchase order can be linked to multiple purchases over time.
   */
  purchaseIds?: number[];
}

/**
 * Request payload for `POST /api/purchase-orders/create`.
 * - If `id` is null/undefined -> creates a new PO
 * - If `id` is provided -> updates an existing PO
 * - If `purchaseId` is provided -> appends PO items into that existing Purchase
 * - If `purchaseId` is null -> creates a new Purchase for the PO items
 */
export interface PurchaseOrderCreateUpdateRequest {
  id?: number | null;
  customerId: number;
  purchaseId?: number | null;
  orderDate: string;
  invoiceNumber?: string | null;
  packagingAndForwadingCharges?: number;
  products: PurchaseOrderCreateUpdateItem[];
}

export interface PurchaseOrderCreateUpdateItem {
  id?: number | null;
  productId: number;
  quantity: number;
  getQuantity?: number | null;
  unitPrice: number;
  remarks?: string;
}

/**
 * Detail response model for `POST /api/purchase-orders/detail`.
 * Legacy scalar linkage keys (`purchaseId`, item `purchaseId`, `purchaseItemId`) are removed by backend.
 */
export interface PurchaseOrderDetail {
  id: number;
  invoiceNumber: string;
  orderDate: string;
  totalAmount?: number;
  price?: number;
  taxAmount?: number;
  sgst?: number;
  cgst?: number;
  igst?: number;
  packagingAndForwadingCharges?: number;
  isQcPass?: boolean;
  createdAt?: string;
  updatedAt?: string;
  customerId: number;
  createdBy?: number;
  customerName?: string;
  purchaseIds: number[];
  items: PurchaseOrderDetailItem[];
}

export interface PurchaseOrderDetailItem {
  id: number;
  quantity: number;
  getQuantity?: number | null;
  unitPrice: number;
  price?: number;
  taxPercentage?: number;
  taxAmount?: number;
  sgst?: number;
  cgst?: number;
  igst?: number;
  finalPrice?: number;
  productId: number;
  remarks?: string;
  productName?: string;
  hsnCode?: string;
  purchaseIds: number[];
  purchaseItemIds: number[];
}

export interface PurchaseOrderSearchRequest {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  customerId?: number;
  startDate?: string;
  endDate?: string;
  batchNumber?: string;
}

export interface PurchaseOrderResponse {
  content: PurchaseOrder[];
  totalElements: number;
  totalPages: number;
}

export interface PurchaseOrderItem {
  id?: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  batchNumber?: string;
  remarks?: string;
}

