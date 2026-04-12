export interface Customer {
  id: number;
  name: string;
  mobile: string;
  email: string;
  gst: string;
  dlNumber?: string;
  address: string;
  pincode: string;
  remainingPaymentAmount: number;
  nextActionDate: string;
  remarks: string;
  status: string;
  coatingUnitPrice?: number;
  validityDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSearchRequest {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  status?: 'A' | 'I' | 'P';
}

export interface CustomerResponse {
  success: boolean;
  message: string;
  data: {
    totalPages: number;
    content: Customer[];
    totalElements: number;
  };
} 