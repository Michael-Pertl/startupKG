// Development entry point uses the same unrestricted Ask API as production.
process.env.PORT ||= process.env.GRAPH_ASSISTANT_PORT || "8787";
process.env.STATIC_DIR ||= "public";
await import("./app-server.mjs");
