export interface ExpenseMasterEmployeeRef {
  id: number;
  name: string;
}

export interface ExpenseMaster {
  id?: number;
  employeeIds: number[];
  /** Present on paginated search responses; same order as `employeeIds`. */
  employeeNames?: string[] | null;
  /** Present on paginated search responses. */
  employees?: ExpenseMasterEmployeeRef[] | null;
  amount: number;
  reason: string;
  expenseDate: string;
  other?: string | null;
  remarks?: string | null;
  isExpense?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
}

export interface ExpenseMasterGetExpensesRequest {
  search?: string;
  reason?: string;
}

export interface ExpenseMasterSearchRequest {
  search?: string;
  reason?: string;
  isExpense?: boolean | null;
  page?: number;
  size?: number;
  sortBy?: 'id' | 'amount' | 'reason' | 'created_at';
  sortDir?: 'asc' | 'desc';
}

/** Response `data` from POST /api/expenses/import-excel */
export interface ExpenseExcelImportResult {
  processedRows: number;
  insertedRows: number;
}
