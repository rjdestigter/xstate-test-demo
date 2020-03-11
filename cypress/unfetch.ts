import unfetch from 'unfetch'
import { Deferred } from '../src/delay';

export default (buffer: Deferred[]) => async (url: RequestInfo, options: RequestInit) => {
  while (buffer.length > 0) {
    const deferred = buffer[0];

    if (deferred) {
      await deferred;
      // Pop it once it's resolved. Don't pop it before that otherwise
      // the test won't have access to it to resolve it.
      buffer.shift();
    }
  }

  if (/FAILURE/.test(url as string)) {
    throw Error("500")
  }

  return unfetch(url, options)
}