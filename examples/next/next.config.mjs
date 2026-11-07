export default {
  transpilePackages: ["@enitrat/tune", "acme"],
  pageExtensions:
    process.env.NODE_ENV === "development" ? ["dev.ts", "tsx", "ts", "jsx", "js"] : undefined,
}
