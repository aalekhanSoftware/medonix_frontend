import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Employee, EmployeeResponse, EmployeeSearchRequest } from '../models/employee.model';
import { EncryptionService } from '../shared/services/encryption.service';

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  private readonly CACHE_KEY = 'active_employees';
  private apiUrl = `${environment.apiUrl}/api/employees`;

  constructor(private http: HttpClient, private encryptionService: EncryptionService) {}

  searchEmployees(params: EmployeeSearchRequest): Observable<EmployeeResponse> {
    return this.http.post<EmployeeResponse>(`${this.apiUrl}/search`, params);
  }

  createEmployee(employee: Partial<Employee>): Observable<any> {
    return this.http.post(this.apiUrl, employee);
  }

  updateEmployee(id: number, employee: Partial<Employee>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, employee);
  }

  deleteEmployee(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getEmployeeDetail(id: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/detail`, { id })
      .pipe(
        tap(response => {
          if (response.success) {
            const encryptedData = this.encryptionService.encrypt(JSON.stringify(response.data));
            localStorage.setItem('selectedEmployee', encryptedData);
          }
        })
      );
  }

  // getAllEmployees(): Observable<any> {
  //   return this.http.post(`${this.apiUrl}/all`, {});
  // }  

  getAllEmployees(): Observable<any> {
    const encryptedData = localStorage.getItem(this.CACHE_KEY);
      if (encryptedData) {
        const decryptedData = this.encryptionService.decrypt(encryptedData);
        if (decryptedData) {
          return of(decryptedData);
        }
      }

      return this.http.post<any>(`${this.apiUrl}/all`, {
    }).pipe(
      tap(response => {
        if (response.success) {
          const encryptedData = this.encryptionService.encrypt(response);
          localStorage.setItem(this.CACHE_KEY, encryptedData);
        }
      })
    );
  }

  refreshEmployees(): Observable<any> {
    localStorage.removeItem(this.CACHE_KEY);
    return this.getAllEmployees();
  }
} 