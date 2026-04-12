export interface LedgerPdfDataApiResponse {
  success: boolean;
  message?: string;
  data?: LedgerPdfDataPayload;
}

export interface LedgerPdfDataPayload {
  ledgerSummary: LedgerSummary;
  companyOther: Record<string, string>;
  statementTitle: string;
  generatedAt?: string;
  generatedAtFormatted: string;
  pdfTransactionRows?: PdfTransactionRow[];
}

export interface LedgerSummary {
  customerId: number;
  customerName?: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGst?: string;
  customerEmail?: string;
  companyName?: string;
  companyAddress?: string;
  companyMobile?: string;
  companyGst?: string;
  startDate?: string;
  endDate?: string;
  openingBalance?: number;
  totalDebit?: number;
  totalCredit?: number;
  closingBalance?: number;
  totalPurchases?: number;
  totalPurchaseReturns?: number;
  totalSales?: number;
  totalSaleReturns?: number;
  totalPurchaseAmount?: number;
  totalPurchaseReturnAmount?: number;
  totalSaleAmount?: number;
  totalSaleReturnAmount?: number;
  totalPaymentsReceived?: number;
  totalPaymentsMade?: number;
  totalPaymentReceivedAmount?: number;
  totalPaymentMadeAmount?: number;
  entries: LedgerEntry[];
}

export interface LedgerEntry {
  id: number;
  transactionType: string;
  invoiceNumber?: string;
  transactionDate?: string;
  description?: string;
  isDiscount?: boolean | null;
  debitAmount?: number;
  creditAmount?: number;
  runningBalance?: number;
  numberOfItems?: number | null;
  taxAmount?: number | null;
  sortOrder?: number;
}

export interface PdfTransactionRow {
  transactionDate?: string;
  transactionType?: string;
  transactionTypeLabel?: string;
  invoiceNumber?: string;
  description?: string;
  descriptionAsInPdf?: string;
  debitAmount?: number;
  creditAmount?: number;
}
