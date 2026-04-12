export interface PaymentHistoryUpsertRequest {
  id?: number;
  amount: number;
  customerId: number;
  customerName: string;
  type: 'C' | 'B'; // 'C' for Cash, 'B' for Bank
  remarks: string;
  isReceived: boolean;
  date: string; // Format: DD-MM-YYYY
  createdById?: number;
  createdByName?: string;
  updatedById?: number;
  updatedByName?: string;
  clientId?: number;
}

export interface PaymentHistoryListItem {
  id: number;
  amount: number;
  customerId: number;
  customerName: string;
  type: 'C' | 'B';
  remarks: string;
  isReceived: boolean;
  date: string;
  createdAt?: string;
  createdByName?: string;
  updatedAt?: string;
  updatedByName?: string;
}

export interface PaymentHistorySearchRequest {
  search?: string;
  customerId?: number;
  startDate?: string;
  endDate?: string;
  currentPage: number;
  perPageRecord: number;
  clientId?: number;
}

export interface PaymentHistorySearchResponse {
  success: boolean;
  message: string;
  data: {
    content: PaymentHistoryListItem[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
    perPageRecord: number;
  };
}

export interface PaymentHistoryDetailsResponse {
  success: boolean;
  message: string;
  data: {
    id: number;
    amount: number;
    customerId: number;
    customerName: string;
    type: 'C' | 'B';
    remarks: string;
    isReceived: boolean;
    date: string;
    clientId?: number;
    createdAt: string;
    updatedAt?: string | null;
    createdById?: number;
    createdByName?: string;
    updatedById?: number;
    updatedByName?: string;
  };
}

export interface PaymentHistoryUpsertResponse {
  success: boolean;
  message: string;
  data?: {
    id: number;
  };
}

export interface PaymentHistoryDeleteResponse {
  success: boolean;
  message: string;
}