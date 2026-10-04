import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingExcludes: {
    "/api/admin/products/package": ["./houdini/**/__pycache__/**"],
  },
  outputFileTracingIncludes: {
    "/api/admin/products/package": ["./houdini/python/qatools_licensing/*.py", "./houdini/scripts/pythonrc.py"],
  },
};

export default nextConfig;
