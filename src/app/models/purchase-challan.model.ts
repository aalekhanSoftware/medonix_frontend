export interface PurchaseChallan {
  id?: number;
  customerId: number;
  challanDate: string;
  invoiceNumber: string;
  customerName?: string;
  totalChallanAmount?: number;
  items: PurchaseChallanItem[];
  totalAmount: number;
  totalProducts: number;
  price?: number;
  taxAmount?: number;
  packagingAndForwadingCharges?: number;
  isQcPass?: boolean;
}

export interface PurchaseChallanSearchRequest {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  customerId?: number;
  startDate?: string;
  endDate?: string;
  batchNumber?: string;
}

export interface PurchaseChallanResponse {
  content: PurchaseChallan[];
  totalElements: number;
  totalPages: number;
}

export interface PurchaseChallanItem {
  id?: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  price: number;
  taxPercentage: number;
  taxAmount: number;
  batchNumber?: string;
  remarks?: string;
  qcPass?: number;
}