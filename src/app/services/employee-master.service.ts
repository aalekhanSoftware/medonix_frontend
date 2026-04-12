import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  ApiResponse,
  EmployeeMaster,
  EmployeeMasterGetEmployeesRequest,
  EmployeeMasterSearchRequest,
  PaginatedContent
} from '../models/employee-master.model';

@Injectable({ providedIn: 'root' })
export class EmployeeMasterService {
  private readonly baseUrl = `${environment.apiUrl}/api/employee-master`;

  constructor(private http: HttpClient) {}

  create(body: Pick<EmployeeMaster, 'name' | 'status'> & { remarks?: string | null }): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(this.baseUrl, body);
  }

  update(body: { id: number; name: string; status: string; remarks?: string | null }): Observable<ApiResponse> {
    return this.http.put<ApiResponse>(this.baseUrl, body);
  }

  delete(id: number): Observable<ApiResponse> {
    return this.http.request<ApiResponse>('DELETE', this.baseUrl, { body: { id } });
  }

  getEmployees(payload: EmployeeMasterGetEmployeesRequest): Observable<ApiResponse<EmployeeMaster[]>> {
    return this.http.post<ApiResponse<EmployeeMaster[]>>(`${this.baseUrl}/getEmployees`, payload);
  }

  search(payload: EmployeeMasterSearchRequest): Observable<ApiResponse<PaginatedContent<EmployeeMaster>>> {
    return this.http.post<ApiResponse<PaginatedContent<EmployeeMaster>>>(`${this.baseUrl}/search`, payload);
  }
}
