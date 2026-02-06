/// <reference lib="webworker" />

import { readBarcodes } from 'zxing-wasm/reader';

interface DecodePayload {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

addEventListener('message', async (event) => {
  const { type, payload } = event.data || {};
  if (type !== 'decode') return;

  const { id, width, height, buffer } = payload as DecodePayload;
  try {
    const data = new Uint8ClampedArray(buffer);
    const imageData = new ImageData(data, width, height);
    const results = await readBarcodes(imageData, { maxNumberOfSymbols: 1 });
    const first = results[0];
    if (first?.text) {
      postMessage({ type: 'result', id, text: first.text, format: first.format });
    } else {
      postMessage({ type: 'result', id, text: null, format: null });
    }
  } catch (error) {
    postMessage({ type: 'error', id, error: String(error) });
  }
});
