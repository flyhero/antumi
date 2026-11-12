import { getRandomValues } from 'expo-crypto'
import { Utf8Decoder } from './utf8-decoder'

// What the shared protocol code needs from the platform and Hermes may lack: a random source for
// the Noise keys, and a strict UTF-8 decoder for the link's frames. Loaded before anything else.

if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array || array instanceof Uint16Array || array instanceof Uint32Array || array instanceof Int8Array || array instanceof Int16Array || array instanceof Int32Array) getRandomValues(array)
      return array
    } }
  })
}

if (typeof globalThis.TextDecoder !== 'function') {
  Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: Utf8Decoder })
}
