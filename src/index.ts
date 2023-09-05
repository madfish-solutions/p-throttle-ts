export class AbortError extends Error {
  constructor() {
    super('Throttled function aborted');
    this.name = 'AbortError';
  }
}

export interface Options {
  /**
	The maximum number of calls within an `interval`.
	*/
  readonly limit: number;

  /**
	The timespan for `limit` in milliseconds.
	*/
  readonly interval: number;

  /**
	Use a strict, more resource intensive, throttling algorithm. The default algorithm uses a windowed approach that will work correctly in most cases, limiting the total number of calls at the specified limit per interval window. The strict algorithm throttles each call individually, ensuring the limit is not exceeded for any interval.

	@default false
	*/
  readonly strict?: boolean;
}

export type ThrottledFunction<
  Argument extends readonly unknown[],
  ReturnValue
> = ((...args: Argument) => Promise<Awaited<ReturnValue>>) & {
  /**
	Whether future function calls should be throttled or count towards throttling thresholds.

	@default true
	*/
  isEnabled: boolean;

  /**
	The number of queued items waiting to be executed.
	*/
  readonly queueSize: number;

  /**
	Abort pending executions. All unresolved promises are rejected with a `pThrottle.AbortError` error.
	*/
  abort(): void;
};

export default function pThrottle<
  Argument extends readonly unknown[],
  ReturnValue
>({
  limit,
  interval,
  strict,
}: Options): (
  function_: (...args: Argument) => ReturnValue
) => ThrottledFunction<Argument, ReturnValue> {
  if (!Number.isFinite(limit)) {
    throw new TypeError('Expected `limit` to be a finite number');
  }

  if (!Number.isFinite(interval)) {
    throw new TypeError('Expected `interval` to be a finite number');
  }

  const queue = new Map();

  let currentTick = 0;
  let activeCount = 0;

  function windowedDelay() {
    const now = Date.now();

    if (now - currentTick > interval) {
      activeCount = 1;
      currentTick = now;
      return 0;
    }

    if (activeCount < limit) {
      activeCount++;
    } else {
      currentTick += interval;
      activeCount = 1;
    }

    return currentTick - now;
  }

  const strictTicks: number[] = [];

  function strictDelay() {
    const now = Date.now();

    if (strictTicks.length < limit) {
      strictTicks.push(now);
      return 0;
    }

    const earliestTime = strictTicks.shift()! + interval;

    if (now >= earliestTime) {
      strictTicks.push(now);
      return 0;
    }

    strictTicks.push(earliestTime);
    return earliestTime - now;
  }

  const getDelay = strict ? strictDelay : windowedDelay;

  return (
    function_: (
      this: ThrottledFunction<Argument, ReturnValue>,
      ...args: Argument
    ) => ReturnValue
  ) => {
    // @ts-ignore
    const throttled: ThrottledFunction<Argument, ReturnValue> = function (
      ...args
    ) {
      if (!throttled.isEnabled) {
        // @ts-ignore
        return (async () => function_.apply(this, args))();
      }

      let timeout: NodeJS.Timeout;
      return new Promise((resolve, reject) => {
        const execute = () => {
          // @ts-ignore
          resolve(function_.apply(this, args));
          queue.delete(timeout);
        };

        timeout = setTimeout(execute, getDelay());

        queue.set(timeout, reject);
      });
    };

    throttled.abort = () => {
      for (const timeout of queue.keys()) {
        clearTimeout(timeout);
        queue.get(timeout)(new AbortError());
      }

      queue.clear();
      strictTicks.splice(0, strictTicks.length);
    };

    throttled.isEnabled = true;

    Object.defineProperty(throttled, 'queueSize', {
      get() {
        return queue.size;
      },
    });

    return throttled;
  };
}
