import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { ApiResponse, PaginatedContent } from '../models/employee-master.model';
import type {
  ExpenseExcelImportResult,
  ExpenseMaster,
  ExpenseMasterGetExpensesRequest,
  ExpenseMasterSearchRequest
} from '../models/expense-master.model';

@Injectable({ providedIn: 'root' })
export class ExpenseMasterService {
  private readonly baseUrl = `${environment.apiUrl}/api/expenses`;

  constructor(private http: HttpClient) {}

  create(
    body: Pick<ExpenseMaster, 'employeeIds' | 'amount' | 'reason' | 'expenseDate' | 'isExpense'> & {
      other?: string | null;
      remarks?: string | null;
    }
  ): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(this.baseUrl, body);
  }

  update(
    body: {
      id: number;
      employeeIds: number[];
      amount: number;
      reason: string;
      expenseDate: string;
      isExpense: boolean;
      other?: string | null;
      remarks?: string | null;
    }
  ): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(this.baseUrl, body);
  }

  delete(id: number): Observable<ApiResponse> {
    return this.http.request<ApiResponse>('DELETE', this.baseUrl, { body: { id } });
  }

  getExpenses(payload: ExpenseMasterGetExpensesRequest): Observable<ApiResponse<ExpenseMaster[]>> {
    return this.http.post<ApiResponse<ExpenseMaster[]>>(`${this.baseUrl}/getExpenses`, payload);
  }

  search(payload: ExpenseMasterSearchRequest): Observable<ApiResponse<PaginatedContent<ExpenseMaster>>> {
    return this.http.post<ApiResponse<PaginatedContent<ExpenseMaster>>>(`${this.baseUrl}/search`, payload);
  }

  importExcel(file: File): Observable<ApiResponse<ExpenseExcelImportResult>> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<ApiResponse<ExpenseExcelImportResult>>(`${this.baseUrl}/import-excel`, formData);
  }
}
