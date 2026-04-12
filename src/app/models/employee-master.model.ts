export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export interface EmployeeMaster {
  id?: number;
  name: string;
  status: string;
  remarks?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
}

export interface EmployeeMasterGetEmployeesRequest {
  name?: string;
  status?: string;
  search?: string;
}

export interface EmployeeMasterSearchRequest {
  search?: string;
  status?: string;
  page?: number;
  size?: number;
  sortBy?: 'id' | 'name' | 'status' | 'created_at';
  sortDir?: 'asc' | 'desc';
}

export interface PaginatedContent<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
}
