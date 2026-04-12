export interface PurchaseReturnItemDto {
  purchaseItemId?: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  price: number;
  discountPercentage?: number;
  discountAmount?: number;
  discountPrice?: number;
  taxPercentage: number;
  taxAmount: number;
  sgst?: number;
  cgst?: number;
  igst?: number;
  finalPrice: number;
  remarks?: string;
  batchNumber?: string;
}

/** Standalone purchase return: product line for create-standalone API */
export interface StandalonePurchaseReturnProductDto {
  productId: number;
  quantity: number;
  unitPrice: number;
  /** When discount type is percentage */
  discountPercentage?: number;
  /** When discount type is amount */
  discountAmount?: number;
  taxPercentage?: number;
  remarks?: string | null;
  batchNumber?: string | null;
}

/** Request payload for POST /api/purchase-returns/create-standalone */
export interface StandalonePurchaseReturnRequest {
  purchaseReturnDate: string; // dd-MM-yyyy
  customerId: number;
  isDiscount: boolean;
  packagingAndForwadingCharges: number;
  products: StandalonePurchaseReturnProductDto[];
}

/** Request payload for update standalone (e.g. PUT/POST create-standalone) */
export interface StandalonePurchaseReturnUpdateRequest extends StandalonePurchaseReturnRequest {
  id: number;
}

export interface PurchaseReturnCreateDto {
  id?: number;
  purchaseId: number;
  customerId: number | null;
  purchaseReturnDate: string;
  invoiceNumber: string;
  packagingAndForwadingCharges: number;
  price?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  products: PurchaseReturnItemDto[];
}