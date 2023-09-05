type ExtendedNumber = number | bigint;

//#region from convert-hrtime node module
export function convertHrtime(hrtime: ExtendedNumber) {
  const nanoseconds = hrtime;
  const number = Number(nanoseconds);
  const milliseconds = number / 1000000;
  const seconds = number / 1000000000;

  return {
    seconds,
    milliseconds,
    nanoseconds: Number(nanoseconds),
  };
}
//#endregion from convert-hrtime node module

//#region from time-span node module
export function timeSpan() {
  const start = process.hrtime.bigint();
  const end = (type: 'seconds' | 'milliseconds' | 'nanoseconds') =>
    convertHrtime(process.hrtime.bigint() - start)[type];

  const returnValue = () => end('milliseconds');
  returnValue.rounded = () => Math.round(end('milliseconds'));
  returnValue.seconds = () => end('seconds');
  returnValue.nanoseconds = () => end('nanoseconds');

  return returnValue;
}
//#endregion from time-span node module

//#region from in-range node module
const min = (left: ExtendedNumber, right: ExtendedNumber) =>
  left < right ? left : right;
const max = (left: ExtendedNumber, right: ExtendedNumber) =>
  left > right ? left : right;

const isNumberOrBigInt = (value: unknown): value is ExtendedNumber =>
  ['number', 'bigint'].includes(typeof value);

export const inRange = (
  number: ExtendedNumber,
  { start = 0, end }: { start: ExtendedNumber; end: ExtendedNumber }
) => {
  if (
    !isNumberOrBigInt(number) ||
    !isNumberOrBigInt(start) ||
    !isNumberOrBigInt(end)
  ) {
    throw new TypeError(
      'Expected each argument to be either a number or a BigInt'
    );
  }

  return number >= min(start, end) && number <= max(end, start);
};
//#endregion from in-range node module

//#region from delay node module
export type DelayOptions<T> = {
  /**
	A value to resolve in the returned promise.

	@example
	```
	import delay from 'delay';

	const result = await delay(100, {value: '🦄'});

	// Executed after 100 milliseconds
	console.log(result);
	//=> '🦄'
	```
	*/
  value?: T;

  /**
	An `AbortSignal` to abort the delay.

	The returned promise will be rejected with an `AbortError` if the signal is aborted.

	@example
	```
	import delay from 'delay';

	const abortController = new AbortController();

	setTimeout(() => {
		abortController.abort();
	}, 500);

	try {
		await delay(1000, {signal: abortController.signal});
	} catch (error) {
		// 500 milliseconds later
		console.log(error.name)
		//=> 'AbortError'
	}
	```
	*/
  signal?: AbortSignal;
};

const randomInteger = (minimum: number, maximum: number) =>
  Math.floor(Math.random() * (maximum - minimum + 1) + minimum);

const createAbortError = () => {
  const error = new Error('Delay aborted');
  error.name = 'AbortError';
  return error;
};

const clearMethods = new WeakMap();

export function createDelay<T>(
  timers: {
    clearTimeout?: (timeoutId: any) => void;
    setTimeout?: (
      callback: (...args: any[]) => void,
      milliseconds: number,
      ...args: any[]
    ) => NodeJS.Timeout;
  } = {}
): (milliseconds: number, options?: DelayOptions<T>) => Promise<T> {
  const { clearTimeout: defaultClear, setTimeout: defaultSet } = timers;
  // We cannot use `async` here as we need the promise identity.
  return (milliseconds: number, { value, signal }: DelayOptions<T> = {}) => {
    // TODO: Use `signal?.throwIfAborted()` when targeting Node.js 18.
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    let timeoutId: NodeJS.Timeout | null = null;
    let settle: () => void;
    let rejectFunction: (reason?: any) => void;
    const clear = defaultClear ?? clearTimeout;

    const signalListener = () => {
      clear(timeoutId!);
      rejectFunction(createAbortError());
    };

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', signalListener);
      }
    };

    const delayPromise = new Promise<T>((resolve, reject) => {
      settle = () => {
        cleanup();
        resolve(value!);
      };

      rejectFunction = reject;
      timeoutId = (defaultSet ?? setTimeout)(settle, milliseconds);
    });

    if (signal) {
      signal.addEventListener('abort', signalListener, { once: true });
    }

    clearMethods.set(delayPromise, () => {
      clear(timeoutId!);
      timeoutId = null;
      settle();
    });

    return delayPromise;
  };
}

export const delay = createDelay<any>();

export async function rangeDelay<T>(
  minimum: number,
  maximum: number,
  options: DelayOptions<T> = {}
): Promise<T> {
  return delay(randomInteger(minimum, maximum), options);
}

export function clearDelay(promise: Promise<unknown>) {
  clearMethods.get(promise)?.();
}
//#endregion from delay node module
