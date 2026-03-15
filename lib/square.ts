import { SquareClient, SquareEnvironment } from 'square'

const environment =
  process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox

export const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment,
})

export const LOCATION_ID = process.env.SQUARE_LOCATION_ID!

/**
 * Square Customer を作成する
 */
export async function createSquareCustomer(params: {
  name: string
  email: string
  lineUserId: string
}) {
  const result = await squareClient.customers.create({
    givenName: params.name,
    emailAddress: params.email,
    referenceId: params.lineUserId,
  })
  return result.customer!
}

/**
 * Square Appointments で予約を作成する
 */
export async function createSquareBooking(params: {
  startAt: string
  customerId: string
  serviceVariationId?: string
}) {
  const result = await squareClient.bookings.create({
    idempotencyKey: `booking-${params.customerId}-${Date.now()}`,
    booking: {
      startAt: params.startAt,
      locationId: LOCATION_ID,
      customerId: params.customerId,
      locationType: 'BUSINESS_LOCATION',
      appointmentSegments: [
        {
          durationMinutes: 30,
          serviceVariationId: params.serviceVariationId || process.env.SQUARE_SERVICE_VARIATION_ID!,
          teamMemberId: process.env.SQUARE_TEAM_MEMBER_ID || 'any',
        },
      ],
    },
  })
  return result.booking!
}

/**
 * Square Appointments で予約をキャンセルする
 */
export async function cancelSquareBooking(bookingId: string) {
  const current = await squareClient.bookings.get({ bookingId })
  const version = current.booking?.version ?? 1

  await squareClient.bookings.cancel({
    bookingId,
    idempotencyKey: `cancel-${bookingId}-${Date.now()}`,
    bookingVersion: version,
  })
}

/**
 * Square Appointments の空き枠を取得する
 */
export async function getAvailableSlots(params: {
  startAt: string
  endAt: string
}) {
  const result = await squareClient.bookings.searchAvailability({
    query: {
      filter: {
        startAtRange: {
          startAt: params.startAt,
          endAt: params.endAt,
        },
        locationId: LOCATION_ID,
        segmentFilters: [
          {
            serviceVariationId: process.env.SQUARE_SERVICE_VARIATION_ID!,
          },
        ],
      },
    },
  })
  return result.availabilities ?? []
}

/**
 * Square Subscription のステータスを取得する
 */
export async function getSubscriptionStatus(subscriptionId: string) {
  const result = await squareClient.subscriptions.get({ subscriptionId })
  return result.subscription?.status
}

/**
 * Square Subscription を作成する（支払い完了後に呼ぶ）
 */
export async function createSquareSubscription(customerId: string) {
  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  const today = new Date().toISOString().split('T')[0]

  const res = await fetch(`${baseUrl}/v2/subscriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: `sub-${customerId}-${Date.now()}`,
      location_id: process.env.SQUARE_LOCATION_ID,
      plan_variation_id: process.env.SQUARE_SUBSCRIPTION_PLAN_VARIATION_ID,
      customer_id: customerId,
      start_date: today,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.subscription?.id) {
    throw new Error(`Subscription creation failed: ${JSON.stringify(data)}`)
  }
  return data.subscription as { id: string; status: string }
}
