export interface Employee {
  id: number;
  name: string;
  mobileNumber: string;
  email: string;
  address: string;
  designation: string;
  department: string;
  status: string;
  createdAt: string;
}

export interface EmployeeSearchRequest {
  search?: string;
  page: number;
  size: number;
  sortBy?: string;
  sortDir?: string;
}

export interface EmployeeResponse {
  success: boolean;
  message: string;
  data: {
    totalPages: number;
    content: Employee[];
    totalElements: number;
  };
} 