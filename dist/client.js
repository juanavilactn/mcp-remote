#!/usr/bin/env node
import {
  Client,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  NodeOAuthClientProvider,
  connectToRemoteServer,
  createLazyAuthCoordinator,
  getServerUrlHash,
  log,
  parseCommandLineArgs,
  setupSignalHandlers,
  version
} from "./chunk-CNSILOCG.js";

// src/client.ts
import { EventEmitter } from "events";
async function runClient(serverUrl, callbackPort, headers, transportStrategy = "http-first", host, staticOAuthClientMetadata, staticOAuthClientInfo, authEnvironment) {
  const events = new EventEmitter();
  const serverUrlHash = getServerUrlHash(serverUrl);
  const authCoordinator = createLazyAuthCoordinator(serverUrlHash, callbackPort, events);
  const authProvider = new NodeOAuthClientProvider({
    serverUrl,
    callbackPort,
    host,
    clientName: "MCP CLI Client",
    staticOAuthClientMetadata,
    staticOAuthClientInfo
  });
  const client = new Client(
    {
      name: "mcp-remote",
      version
    },
    {
      capabilities: {}
    }
  );
  let server = null;
  const authInitializer = async () => {
    const authState = await authCoordinator.initializeAuth();
    server = authState.server;
    if (authState.skipBrowserAuth) {
      log("Authentication was completed by another instance - will use tokens from disk...");
      await new Promise((res) => setTimeout(res, 1e3));
    }
    return {
      waitForAuthCode: authState.waitForAuthCode,
      skipBrowserAuth: authState.skipBrowserAuth
    };
  };
  try {
    const transport = await connectToRemoteServer(client, serverUrl, authProvider, headers, authInitializer, transportStrategy, authEnvironment);
    transport.onmessage = (message) => {
      log("Received message:", JSON.stringify(message, null, 2));
    };
    transport.onerror = (error) => {
      log("Transport error:", error);
    };
    transport.onclose = () => {
      log("Connection closed.");
      process.exit(0);
    };
    const cleanup = async () => {
      log("\nClosing connection...");
      await client.close();
      if (server) {
        server.close();
      }
    };
    setupSignalHandlers(cleanup);
    log("Connected successfully!");
    try {
      log("Requesting tools list...");
      const tools = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      log("Tools:", JSON.stringify(tools, null, 2));
    } catch (e) {
      log("Error requesting tools list:", e);
    }
    try {
      log("Requesting resource list...");
      const resources = await client.request({ method: "resources/list" }, ListResourcesResultSchema);
      log("Resources:", JSON.stringify(resources, null, 2));
    } catch (e) {
      log("Error requesting resources list:", e);
    }
    log("Exiting OK...");
    if (server) {
      server.close();
    }
    process.exit(0);
  } catch (error) {
    log("Fatal error:", error);
    if (server) {
      server.close();
    }
    process.exit(1);
  }
}
parseCommandLineArgs(process.argv.slice(2), "Usage: npx tsx client.ts <https://server-url> [callback-port] [--debug]").then(({ serverUrl, callbackPort, headers, transportStrategy, host, staticOAuthClientMetadata, staticOAuthClientInfo, authEnvironment }) => {
  return runClient(serverUrl, callbackPort, headers, transportStrategy, host, staticOAuthClientMetadata, staticOAuthClientInfo, authEnvironment);
}).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
