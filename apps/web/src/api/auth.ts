import type { Locale, LoginRequest, RegisterRequest, UserView } from '@philax/types';
import { apiRequest } from './client';

export const authApi = {
  me: () => apiRequest<{ user: UserView }>('GET', '/api/auth/me'),
  login: (body: LoginRequest) => apiRequest<{ user: UserView }>('POST', '/api/auth/login', body),
  register: (body: RegisterRequest) =>
    apiRequest<{ user: UserView }>('POST', '/api/auth/register', body),
  logout: () => apiRequest<undefined>('POST', '/api/auth/logout'),
  updateLocale: (locale: Locale) =>
    apiRequest<{ user: UserView }>('PATCH', '/api/auth/me', { locale }),
  deleteAccount: () => apiRequest<undefined>('DELETE', '/api/auth/me'),
};
