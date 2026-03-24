declare module 'node-aes-cmac' {
  function aesCmac(key: Buffer, message: Buffer, options?: { returnAsBuffer?: boolean }): Buffer | string
  export = aesCmac
}
