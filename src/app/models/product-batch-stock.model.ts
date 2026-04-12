/**
 * Product Batch Stock Model
 * Represents batch-wise stock information for products
 */
export interface ProductBatchStock {
  id?: number;
  batchName: string;
  productId: number;
  productName?: string;
  remainingQuantity?: number;
  blockedQuantity?: number;
  totalRemainingQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Search request for product batch stock
 */
export interface ProductBatchStockSearchRequest {
  search?: string;
  productId?: number;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * Paginated response for product batch stock
 */
export interface ProductBatchStockResponse {
  content: ProductBatchStock[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    sort: {
      empty: boolean;
      sorted: boolean;
      unsorted: boolean;
    };
  };
  totalElements: number;
  totalPages: number;
  last: boolean;
  size: number;
  number: number;
  sort: {
    empty: boolean;
    sorted: boolean;
    unsorted: boolean;
  };
  numberOfElements: number;
  first: boolean;
  empty: boolean;
}
