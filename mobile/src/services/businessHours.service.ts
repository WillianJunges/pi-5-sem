import { api } from './api';

export interface BusinessDay { weekday: number; opensAt: string | null; closesAt: string | null }
export interface BusinessHours { configured: boolean; todayWeekday: number; days: BusinessDay[] }
export const businessHoursService = {
  public: () => api<BusinessHours>('/business-hours', { auth: false }),
  get: () => api<BusinessHours>('/owner/business-hours'),
  save: (days: BusinessDay[]) => api<BusinessHours>('/owner/business-hours', { method: 'PUT', body: { days } }),
};
