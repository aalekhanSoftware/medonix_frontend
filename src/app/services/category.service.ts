import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Category, CategoryResponse, CategorySearchRequest } from '../models/category.model';
import { ApiResponse, PaginatedResponse } from '../models/api.model';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = `${environment.apiUrl}/api/categories`;

  constructor(private http: HttpClient) {}

  getCategories(params: CategorySearchRequest): Observable<CategoryResponse> {
    return this.http.post<CategoryResponse>(`${this.apiUrl}/getCategories`, params);
  }

  searchCategories(params: CategorySearchRequest): Observable<ApiResponse<PaginatedResponse<Category>>> {
    return this.http.post<ApiResponse<PaginatedResponse<Category>>>(`${this.apiUrl}/search`, params);
  }

  createCategory(category: Category): Observable<ApiResponse<Category>> {
    return this.http.post<ApiResponse<Category>>(`${this.apiUrl}`, category);
  }

  updateCategory(id: number, category: Category): Observable<ApiResponse<Category>> {
    return this.http.put<ApiResponse<Category>>(`${this.apiUrl}/${id}`, category);
  }

  deleteCategory(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${id}`);
  }
}