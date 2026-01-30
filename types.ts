
export enum ResourceType {
  HOTEL = 'Hotel',
  RESTAURANT = 'Restaurant',
  ATTRACTION = 'Attraction',
  VEHICLE = 'Vehicle',
  GUIDE = 'Guide',
  OTHERS = 'Others'
}

export enum TaskStatus {
  PENDING = 'Pending',
  CONFIRMED = 'Confirmed',
  ALERT = 'Alert',
  CANCELLED = 'Cancelled'
}

export enum AlertLevel {
  INFO = 'Info',
  WARNING = 'Warning',
  CRITICAL = 'Critical'
}

export enum UserRole {
  ADMIN = 'admin',
  SUB_ACCOUNT = 'staff'
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isTrial: boolean;
  createdAt: string;
  status?: 'active' | 'suspended';
  permissions: string[];
}

export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  location: 'UAE' | 'Oman';
  city: string;
  priceRange: string;
  rating?: number;
  tags: string[];
  contact: string;
  cancelPolicy: string;
  matchedCount?: number;
}

export interface BookingTask {
  id: string;
  itineraryId: string;
  type: ResourceType;
  description: string;
  date: string;
  endDate?: string;
  time?: string;
  endTime?: string;
  status: TaskStatus;
  latestBookingDate: string;
  cost?: number;
  confirmationNo?: string;
  resourceId?: string;
  isResourceMatched: boolean;
  notes?: string;
}

export interface Itinerary {
  id: string;
  ownerId: string;
  groupName: string;
  startDate: string;
  endDate: string;
  paxCount: number;
  guideLanguage: string;
  tasks: BookingTask[];
  status: 'Draft' | 'Operational' | 'Completed';
  income?: number;
}
