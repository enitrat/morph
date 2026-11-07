const dev = process.env.NODE_ENV === "development"

export default {
  transpilePackages: ["example-shared"],
  pageExtensions: dev ? ["dev.ts", "tsx", "ts", "jsx", "js"] : undefined,
}
