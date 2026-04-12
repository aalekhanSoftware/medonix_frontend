export interface Category {
  id?: number;
  name: string;
  status: 'A' | 'I';
  remainingQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryResponse {
  success: boolean;
  message: string;
  data: Category[];
}

export interface CategorySearchRequest {
  name?: string;
  status?: string;
  size?: number;
  page?: number;
  search?: string;
}