/**
 * SESAMI Cloud API クライアント
 * API仕様: https://doc.candyhouse.co/
 */

const SESAMI_BASE_URL = 'https://app.candyhouse.co/api'

/**
 * ランダムな6桁のパスコードを生成する
 */
function generatePasscode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * 時間指定パスコードを発行する
 * @returns { passcode: string, passcodeId: string }
 */
export async function createTimedPasscode(params: {
  validFrom: Date    // PIN 有効開始時刻
  validUntil: Date   // PIN 有効終了時刻
  name: string       // パスコード識別名
}): Promise<{ passcode: string; passcodeId: string }> {
  const passcode = generatePasscode()

  const body = {
    deviceId: process.env.SESAMI_DEVICE_ID!,
    type: 2,                                    // 時間制限付きパスコード
    name: params.name,
    passcode,
    enabledTime: Math.floor(params.validFrom.getTime() / 1000),
    expiryTime: Math.floor(params.validUntil.getTime() / 1000),
  }

  const res = await fetch(`${SESAMI_BASE_URL}/sesame2/passcode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.SESAMI_API_KEY!,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SESAMI passcode creation failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return {
    passcode,
    passcodeId: data.id ?? data.passcodeId ?? String(data.passcode_id),
  }
}

/**
 * パスコードを削除する（キャンセル・失効時）
 */
export async function deletePasscode(passcodeId: string): Promise<void> {
  const res = await fetch(`${SESAMI_BASE_URL}/sesame2/passcode/${passcodeId}`, {
    method: 'DELETE',
    headers: {
      'x-api-key': process.env.SESAMI_API_KEY!,
    },
  })

  if (!res.ok && res.status !== 404) {
    // 404 は既に削除済みなのでスキップ
    const text = await res.text()
    throw new Error(`SESAMI passcode deletion failed: ${res.status} ${text}`)
  }
}
