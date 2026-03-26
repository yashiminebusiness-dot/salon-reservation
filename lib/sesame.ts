import crypto from 'crypto'

const SESAME_API_BASE = 'https://app.candyhouse.co/api/sesame2'
const DEVICE_UUID = process.env.SESAME_DEVICE_UUID!
const SECRET_KEY = process.env.SESAME_SECRET_KEY!
const API_KEY = process.env.SESAME_API_KEY!

function aesCmac(key: Buffer, message: Buffer): Buffer {
  const Rb = Buffer.from('00000000000000000000000000000087', 'hex')

  const cipher1 = crypto.createCipheriv('aes-128-ecb', key, null)
  cipher1.setAutoPadding(false)
  const L = cipher1.update(Buffer.alloc(16))

  const K1 = shiftLeft(L)
  if (L[0] & 0x80) xorInPlace(K1, Rb)

  const K2 = shiftLeft(K1)
  if (K1[0] & 0x80) xorInPlace(K2, Rb)

  const padded = Buffer.alloc(16)
  message.copy(padded, 0)
  padded[message.length] = 0x80
  xorInPlace(padded, K2)

  const cipher2 = crypto.createCipheriv('aes-128-cbc', key, Buffer.alloc(16))
  cipher2.setAutoPadding(false)
  return cipher2.update(padded)
}

function shiftLeft(buf: Buffer): Buffer {
  const result = Buffer.alloc(buf.length)
  let carry = 0
  for (let i = buf.length - 1; i >= 0; i--) {
    result[i] = ((buf[i] << 1) & 0xff) | carry
    carry = (buf[i] & 0x80) ? 1 : 0
  }
  return result
}

function xorInPlace(a: Buffer, b: Buffer): void {
  for (let i = 0; i < a.length; i++) a[i] ^= b[i]
}

function computeSign(): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(timestamp >>> 0, 0)
  const message = buf.subarray(1, 4)  // 上位3バイト（[1:4]）
  const key = Buffer.from(SECRET_KEY, 'hex')
  const mac = aesCmac(key, message)
  return mac.toString('hex')
}

async function sendCommand(cmd: number, historyTag: string) {
  const sign = computeSign()
  const history = Buffer.from(historyTag).toString('base64')

  const res = await fetch(`${SESAME_API_BASE}/${DEVICE_UUID}/cmd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ cmd, history, sign }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SESAME API error: ${res.status} ${text}`)
  }
}

export async function unlockDoor() {
  await sendCommand(83, 'salon-unlock')
}

export async function lockDoor() {
  await sendCommand(82, 'salon-lock')
}
