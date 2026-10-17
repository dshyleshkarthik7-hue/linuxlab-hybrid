declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

declare const process: {
  env: Record<string, string | undefined>;
};
