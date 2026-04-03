  Memory-kind plugins are excluded from the gateway's startup plugin loading scope. The gateway's resolveGatewayStartupPluginIds() calls isGatewayStartupSidecar() which
  returns false for memory plugins because hasRuntimeContractSurface() returns true for kind: "memory". This was designed to keep heavy plugins out of the gateway startup
  path, but it also prevents their registered services from ever being started.

  Why you see "registering service" in logs: Those messages come from CLI invocations during init.sh (openclaw plugins enable gralkor, etc.), not from the gateway runtime.
  The CLI loads plugins in a different context where memory plugins ARE loaded, but that registry is discarded.

  This isn't gralkor-specific — the bundled memory-lancedb has the same issue, it just doesn't matter because its start() only logs a message. For gralkor, start() is
  critical because it boots the Graphiti/FalkorDB server.
