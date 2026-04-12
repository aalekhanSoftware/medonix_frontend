import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  UserSearchRequest,
  UserSearchResponse,
  UserDetailRequest,
  UserDetailResponse,
  UserUpdatePasswordRequest,
  UserUpdatePasswordResponse
} from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/api/users`;

  constructor(private http: HttpClient) {}

  searchUsers(params: UserSearchRequest): Observable<UserSearchResponse> {
    return this.http.post<UserSearchResponse>(`${this.apiUrl}/search`, params);
  }

  getUserDetail(params: UserDetailRequest): Observable<UserDetailResponse> {
    return this.http.post<UserDetailResponse>(`${this.apiUrl}/detail`, params);
  }

  updatePassword(params: UserUpdatePasswordRequest): Observable<UserUpdatePasswordResponse> {
    return this.http.put<UserUpdatePasswordResponse>(`${this.apiUrl}/update-password`, params);
  }

  getCurrentUser(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/me`);
  }
}

