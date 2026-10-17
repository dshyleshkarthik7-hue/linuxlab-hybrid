declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

declare const process: {
  env: Record<string, string | undefined>;
};

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface CacheStorage { readonly default: Cache; }
