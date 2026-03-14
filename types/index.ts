// 共通型定義

export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'cancelled'
export type BookingStatus = 'confirmed' | 'cancelled' | 'completed'

export interface Customer {
  id: string
  line_user_id: string
  email: string | null
  name: string | null
  square_customer_id: string | null
  square_subscription_id: string | null
  subscription_status: SubscriptionStatus
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  customer_id: string
  square_booking_id: string | null
  start_at: string
  end_at: string
  pin_valid_from: string
  pin_valid_until: string
  sesami_passcode_id: string | null
  status: BookingStatus
  created_at: string
}

export interface TimeSlot {
  start: string         // ISO 8601
  available: boolean
  reason?: 'interval_restriction' | 'already_booked'
}

export interface ApiError {
  error: string
  code?: string
}
