export interface TransportItem {
  productId: number;
  quantity: number;
  remarks?: string;
}

export interface TransportBag {
  weight: number;
  items: TransportItem[];
}

export interface Transport {
  id?: number;
  customerId: number;
  bags: TransportBag[];
  createdAt?: string;
  updatedAt?: string;
  status?: string;
}

export interface TransportSummary {
  totalBags: number;
  totalWeight: number;
  totalSaleAmount: number;
  totalProfit: number;
  totalPurchaseAmount: number;
  createdAt: Date;
} 