/**
 * AR_FIFO — Accounts Receivable FIFO report contracts.
 * Mirrors com.inventory.dto.report.ArFifo* on the backend.
 */

export interface ArFifoBill {
  saleId: number;
  billNo: string;
  billDate: string;
  dueDays: number | null;
  billAmount: number;
  balanceAmount: number;
  cumulativeBalance: number;
}

export interface ArFifoParty {
  customerId: number;
  customerName: string;
  mobile?: string;
  status?: string;
  prevBalance?: number | null;
  prevBalanceDueDays?: number | null;
  totalOutstanding: number;
  billCount?: number;
  bills: ArFifoBill[];
}

export interface ArFifoSearchPayload {
  search?: string;
  customerId?: number;
  /** dd-MM-yyyy */
  fromDate?: string;
  status?: string;
  currentPage: number;
  perPageRecord: number;
}

export interface ArFifoPageResponse {
  content: ArFifoParty[];
  totalElements: number;
  totalPages: number;
  number?: number;
  size?: number;
  last?: boolean;
  first?: boolean;
  numberOfElements?: number;
  empty?: boolean;
}

export interface ArFifoSearchResult {
  page: ArFifoPageResponse;
  /** Server As On date in dd-MM-yyyy (IST). */
  asOn?: string;
}
