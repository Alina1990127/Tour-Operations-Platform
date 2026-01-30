
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
  ADMIN = 'Admin',
  SUB_ACCOUNT = 'Sub-Account'
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isTrial: boolean;
  createdAt: string;
  status?: 'Active' | 'Suspended';
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
  date: string; // Start Date
  endDate?: string; // End Date
  time?: string; // Start Time
  endTime?: string; // End Time
  status: TaskStatus;
  latestBookingDate: string;
  cost?: number;
  confirmationNo?: string;
  resourceId?: string; // Links to library if matched
  isResourceMatched: boolean;
  notes?: string;
}

export interface Itinerary {
  id: string;
  ownerId: string; // ID of the sub-account who owns this
  groupName: string;
  startDate: string;
  endDate: string;
  paxCount: number;
  guideLanguage: string;
  tasks: BookingTask[];
  status: 'Draft' | 'Operational' | 'Completed';
  income?: number; // Total income from the group
}

export interface Alert {
  id: string;
  itineraryId: string;
  taskId: string;
  message: string;
  level: AlertLevel;
  createdAt: string;
}
