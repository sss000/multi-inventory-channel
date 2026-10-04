export interface Span {
  setAttribute(key: string, value: string | number | boolean): this;
  recordException(error: Error | unknown): this;
  end(): void;
}

class NoopSpan implements Span {
  setAttribute(_key: string, _value: string | number | boolean): this {
    return this;
  }
  recordException(_error: Error | unknown): this {
    return this;
  }
  end(): void {}
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
}

class StandardTracer implements Tracer {
  constructor(private readonly tracerName: string) {}

  startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): Span {
    return new NoopSpan();
  }
}

export function getTracer(tracerName: string): Tracer {
  return new StandardTracer(tracerName);
}
