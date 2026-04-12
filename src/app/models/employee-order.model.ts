export interface EmployeeOrder {
  id?: number;
  productId: number;
  productName?: string;
  employeeIds: number[];
  quantity: number;
  remarks: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeOrderSearchRequest {
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  currentPage: number;
  perPageRecord: number;
  sortBy?: string;
  sortDir?: string;
}

export interface EmployeeOrderResponse {
  success: boolean;
  message: string;
  data: {
    totalPages: number;
    content: EmployeeOrder[];
    totalElements: number;
  };
} 