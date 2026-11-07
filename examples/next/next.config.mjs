const dev = process.env.NODE_ENV === "development"

export default {
  transpilePackages: dev ? ["@enitrat/tune", "acme"] : ["acme"],
  pageExtensions: dev ? ["dev.ts", "tsx", "ts", "jsx", "js"] : undefined,
}
