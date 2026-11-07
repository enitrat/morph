const dev = process.env.NODE_ENV === "development"

export default {
  transpilePackages: dev ? ["@enitrat/tune", "example-shared"] : ["example-shared"],
  pageExtensions: dev ? ["dev.ts", "tsx", "ts", "jsx", "js"] : undefined,
}
