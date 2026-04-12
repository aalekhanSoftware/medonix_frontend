import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EmployeeOrder, EmployeeOrderResponse, EmployeeOrderSearchRequest } from '../models/employee-order.model';

@Injectable({
  providedIn: 'root'
})
export class EmployeeOrderService {
  private apiUrl = `${environment.apiUrl}/api/employee-orders`;

  constructor(private http: HttpClient) {}

  searchEmployeeOrders(params: EmployeeOrderSearchRequest): Observable<EmployeeOrderResponse> {
    return this.http.post<EmployeeOrderResponse>(`${this.apiUrl}/search`, params);
  }

  createEmployeeOrder(order: EmployeeOrder): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, order);
  }

  updateEmployeeOrder(order: EmployeeOrder): Observable<any> {
    return this.http.put(`${this.apiUrl}/update`, order);
  }

  deleteEmployeeOrder(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getEmployeeOrderDetail(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/detail`, { id });
  }
} 