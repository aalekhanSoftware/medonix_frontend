export interface Sale {
  id?: number;
  purchaseId: number;
  productId?: number;
  productName?: string;
  categoryId?: number;
  categoryName?: string;
  quantity: number;
  unitPrice: number;
  saleDate: string;
  isBlack: boolean;
  invoiceNumber?: string;
  customerName?: string;
  totalSaleAmount?: number;
  totalProducts?: number;
  totalQuantity?: number;
  salesDate?: string;
  otherExpenses?: number;
  totalAmount?: number;
  price?: number;
  taxAmount?: number;
  customerId?: number;
  discountAmount?: number;
  totalDiscountAmount?: number;
  totalSaleDiscountAmount?: number;
  totalSaleDiscountPercentage?: number;
  hasCreditNote?: boolean;
  paymentDoneAmount?: number;
  isFullPaymentDone?: boolean;
  products?: SaleProduct[];
}

export interface SaleSearchRequest {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface SaleResponse {
  success: boolean;
  message: string;
  data: {
    content: Sale[];
    totalElements: number;
    totalPages: number;
  };
}

export interface SaleRecent {
  id: number;
  saleDate: string;
  invoiceNumber: string;
  totalSaleAmount: number;
  customerId: number;
  customerName: string;
  numberOfItems: number;
  taxAmount: number;
  sgst: number;
  cgst: number;
  igst: number;
}

export interface SaleRecentResponse {
  success: boolean;
  message: string;
  data: SaleRecent[];
}

export interface SaleProduct {
  productId: number;
  quantity: number;
  unitPrice: number;
  price: number;
  discountPercentage?: number;
  discountAmount?: number;
  discountPrice?: number;
  saleDiscountPercentage?: number;
  saleDiscountAmount?: number;
  totalDiscount?: number;
  taxPercentage: number;
  taxAmount: number;
  batchNumber?: string;
  remarks?: string;
}