import pThrottle, { AbortError } from '../src/index';
import { delay, inRange, timeSpan } from './utils';

const fixture = Symbol('fixture');

describe('pThrottle', () => {
  it('main', async () => {
    const totalRuns = 100;
    const limit = 5;
    const interval = 100;
    const end = timeSpan();
    const throttled = pThrottle({ limit, interval })(async () => {});

    await Promise.all(
      Array.from({ length: totalRuns })
        .fill(0)
        .map((x) => throttled(x))
    );

    const totalTime = (totalRuns * interval) / limit;
    expect(
      inRange(end(), {
        start: totalTime - 200,
        end: totalTime + 200,
      })
    ).toBeTruthy();
  });

  it('queue size', async () => {
    const limit = 10;
    const interval = 100;
    const throttled = pThrottle<[], number>({ limit, interval })(() =>
      Date.now()
    );
    const promises: Promise<number>[] = [];

    expect(throttled.queueSize).toEqual(0);

    for (let index = 0; index < limit; index++) {
      promises.push(throttled());
    }

    expect(throttled.queueSize).toEqual(limit);

    await Promise.all(promises);

    expect(throttled.queueSize).toEqual(0);
  });

  it('strict mode', async () => {
    const totalRuns = 100;
    const limit = 5;
    const interval = 100;
    const strict = true;
    const end = timeSpan();
    const throttled = pThrottle({ limit, interval, strict })(async () => {});

    await Promise.all(
      Array.from({ length: totalRuns })
        .fill(0)
        .map((x) => throttled(x))
    );

    const totalTime = (totalRuns * interval) / limit;
    expect(
      inRange(end(), {
        start: totalTime - 200,
        end: totalTime + 200,
      })
    ).toBeTruthy();
  });

  it('limits after pause in strict mode', async () => {
    const limit = 10;
    const interval = 100;
    const strict = true;
    const throttled = pThrottle<[], number>({ limit, interval, strict })(() =>
      Date.now()
    );
    const pause = 40;
    const promises: Promise<number>[] = [];
    const start = Date.now();

    await throttled();

    await delay(pause);

    for (let index = 0; index < limit + 1; index++) {
      promises.push(throttled());
    }

    const results = await Promise.all(promises);

    for (const [index, executed] of results.entries()) {
      const elapsed = executed - start;
      if (index < limit - 1) {
        // Executed immediately after the pause
        expect(
          inRange(elapsed, { start: pause, end: pause + 50 })
        ).toBeTruthy();
      } else if (index === limit - 1) {
        // Executed after the interval
        expect(
          inRange(elapsed, { start: interval, end: interval + 50 })
        ).toBeTruthy();
      } else {
        // Waited the interval
        const difference = executed - results[index - limit];
        expect(
          inRange(difference, { start: interval - 10, end: interval + 50 })
        ).toBeTruthy();
      }
    }
  });

  it('limits after pause in windowed mode', async () => {
    const limit = 10;
    const interval = 100;
    const strict = false;
    const throttled = pThrottle<[], number>({ limit, interval, strict })(() =>
      Date.now()
    );
    const pause = 40;
    const promises: Promise<number>[] = [];
    const start = Date.now();

    await throttled();

    await delay(pause);

    for (let index = 0; index < limit + 1; index++) {
      promises.push(throttled());
    }

    const results = await Promise.all(promises);

    for (const [index, executed] of results.entries()) {
      const elapsed = executed - start;
      if (index < limit - 1) {
        // Executed immediately after the pause
        expect(
          inRange(elapsed, { start: pause, end: pause + 10 })
        ).toBeTruthy();
      } else {
        // Executed immediately after the interval
        expect(
          inRange(elapsed, { start: interval - 10, end: interval + 10 })
        ).toBeTruthy();
      }
    }
  });

  it('passes arguments through', async () => {
    const throttled = pThrottle({ limit: 1, interval: 100 })(async (x) => x);
    expect(await throttled(fixture)).toEqual(fixture);
  });

  it('can be aborted', async () => {
    const limit = 1;
    const interval = 10_000; // 10 seconds
    const end = timeSpan();
    const throttled = pThrottle({ limit, interval })(async () => {});

    await throttled();
    const promise = throttled();
    throttled.abort();
    let error;
    try {
      await promise;
    } catch (error_) {
      error = error_;
    }

    expect(error).toBeInstanceOf(AbortError);
    expect(end()).toBeLessThan(100);
  });

  it('can be disabled', async () => {
    let counter = 0;

    const throttled = pThrottle({
      limit: 1,
      interval: 10_000,
    })(async () => ++counter);

    expect(await throttled()).toEqual(1);

    const end = timeSpan();

    throttled.isEnabled = false;
    expect(await throttled()).toEqual(2);

    expect(end()).toBeLessThan(200);
  });

  it('promise rejections are thrown', async () => {
    const throttled = pThrottle({
      limit: 1,
      interval: 10_000,
    })(() => Promise.reject(new Error('Catch me if you can!')));

    await expect(throttled()).rejects.toThrow(
      new Error('Catch me if you can!')
    );
  });

  it('`this` is preserved in throttled function', async () => {
    class FixtureClass {
      public _foo: any;

      constructor() {
        this._foo = fixture;
      }

      foo() {
        // If `this` is not preserved by `pThrottle()`
        // then `this` will be undefined and accesing `this._foo` will throw.
        return this._foo;
      }

      getThis() {
        // If `this` is not preserved by `pThrottle()`
        // then `this` will be undefined.
        return this;
      }
    }
    FixtureClass.prototype.foo = pThrottle({ limit: 1, interval: 100 })(
      FixtureClass.prototype.foo
    );
    // @ts-ignore
    FixtureClass.prototype.getThis = pThrottle({ limit: 1, interval: 100 })(
      FixtureClass.prototype.getThis
    );

    const thisFixture = new FixtureClass();

    expect(await thisFixture.getThis()).toEqual(thisFixture);
    expect(thisFixture.foo()).resolves.toBeTruthy();
    expect(await thisFixture.foo()).toEqual(fixture);
  });
});
