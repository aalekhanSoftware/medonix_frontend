export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  page: number;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  status: number;
} 