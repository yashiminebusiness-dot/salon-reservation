import aesCmac from 'node-aes-cmac'

const SESAME_API_BASE = 'https://app.candyhouse.co/api/sesame2'
const DEVICE_UUID = process.env.SESAME_DEVICE_UUID!
const SECRET_KEY = process.env.SESAME_SECRET_KEY!
const API_KEY = process.env.SESAME_API_KEY!

function computeSign(): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(timestamp >>> 0, 0)
  const key = Buffer.from(SECRET_KEY, 'hex')
  const mac: Buffer = aesCmac(key, buf, { returnAsBuffer: true }) as Buffer
  return mac.slice(0, 4).toString('base64')
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
