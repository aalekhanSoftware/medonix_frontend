export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  status: 'A' | 'I';
  isSystem: boolean;
  roles: string[];
  clientId: number;
  clientName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSearchRequest {
  clientId: number;
  search?: string;
  status?: 'A' | 'I';
  page: number;
  size: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface UserSearchResponse {
  success: boolean;
  message: string;
  data: {
    content: User[];
    totalElements: number;
    totalPages: number;
  };
}

export interface UserDetailRequest {
  id: number;
}

export interface UserDetailResponse {
  success: boolean;
  message: string;
  data: User;
}

export interface UserUpdatePasswordRequest {
  id: number;
  password: string;
  status: 'A' | 'I';
}

export interface UserUpdatePasswordResponse {
  success: boolean;
  message: string;
  data: null;
}