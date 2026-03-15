/**
 * LINE Messaging API クライアント
 */

const LINE_API_BASE = 'https://api.line.me/v2/bot'

async function pushMessage(to: string, messages: object[]) {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LINE push failed: ${res.status} ${text}`)
  }
}

/**
 * 予約確定通知（PINコード付き）
 */
export async function sendBookingConfirmation(params: {
  lineUserId: string
  customerName: string
  startAt: Date
  endAt: Date
  pinValidFrom: Date
  pinValidUntil: Date
  passcode: string
}) {
  const dateStr = params.startAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  })
  const startStr = params.startAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
  const endStr = params.endAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
  const pinFromStr = params.pinValidFrom.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
  const pinUntilStr = params.pinValidUntil.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  await pushMessage(params.lineUserId, [
    {
      type: 'text',
      text:
        `【予約完了】\n` +
        `${params.customerName}様、ご予約が確定しました！\n\n` +
        `📅 日時: ${dateStr} ${startStr}〜${endStr}\n\n` +
        `🔑 入室PINコード: ${params.passcode}\n` +
        `⏰ 有効時間: ${pinFromStr}〜${pinUntilStr}\n\n` +
        `【ご来店時の注意】\n` +
        `・到着後、ドアのキーパッドにPINを入力してください\n` +
        `・終了時間になると自動で施錠されます\n` +
        `・ご不明な点はLINEでご連絡ください`,
    },
  ])
}

/**
 * サブスク登録完了通知
 */
export async function sendRegistrationComplete(params: {
  lineUserId: string
  customerName: string
  reserveUrl: string
}) {
  await pushMessage(params.lineUserId, [
    {
      type: 'text',
      text:
        `【会員登録完了】\n` +
        `${params.customerName}様、ご登録ありがとうございます！\n\n` +
        `月額プランの登録が完了しました。\n` +
        `さっそく予約してみましょう！\n\n` +
        `▼ 予約はこちら\n${params.reserveUrl}`,
    },
  ])
}

/**
 * キャンセル完了通知
 */
export async function sendCancellationConfirmation(params: {
  lineUserId: string
  startAt: Date
}) {
  const dateStr = params.startAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  })
  const timeStr = params.startAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  await pushMessage(params.lineUserId, [
    {
      type: 'text',
      text:
        `【予約キャンセル完了】\n\n` +
        `以下の予約をキャンセルしました。\n\n` +
        `📅 ${dateStr} ${timeStr}〜\n\n` +
        `またのご予約をお待ちしております。`,
    },
  ])
}

/**
 * 初回予約確認通知（PIN なし・スタッフ対応）
 */
export async function sendFirstVisitConfirmation(params: {
  lineUserId: string
  customerName: string
  startAt: Date
  phone: string
}) {
  const dateStr = params.startAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  })
  const timeStr = params.startAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  await pushMessage(params.lineUserId, [
    {
      type: 'text',
      text:
        `【初回予約完了】\n` +
        `${params.customerName}様、ご予約ありがとうございます！\n\n` +
        `📅 日時: ${dateStr} ${timeStr}〜\n` +
        `📞 お電話番号: ${params.phone}\n\n` +
        `初回はスタッフがご案内いたします。\n` +
        `ご来店をお待ちしております！\n\n` +
        `【ご注意】\n` +
        `・ご来店の際はLINEを開いてお待ちください\n` +
        `・キャンセル・変更はこのLINEにご連絡ください`,
    },
  ])
}

/**
 * サブスク失効通知
 */
export async function sendSubscriptionDeactivated(params: {
  lineUserId: string
}) {
  await pushMessage(params.lineUserId, [
    {
      type: 'text',
      text:
        `【重要】サブスクリプションが停止されました\n\n` +
        `お支払い情報の確認をお願いします。\n` +
        `サブスクが停止中は予約できません。\n\n` +
        `ご不明な点はこちらにご連絡ください。`,
    },
  ])
}
