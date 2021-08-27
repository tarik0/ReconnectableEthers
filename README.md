# ReconnectableEthers
A reconnection wrapper for the ethers.js for server-side Node JS.
It automatically reconnects to the websocket when connection drops.

```js
"use strict";

const ethers = require("ethers");

// Connect to the node.
global.__RECETHERS = new RecEthers();
await global.__RECETHERS.init(global.__CONFIG["Node Settings"]["Node Websocket Address"], 5000);

// Set event handlers.
global.__RECETHERS.on("disconnected", () => console.error("Disconnected from the node! Reconnecting..."));
global.__RECETHERS.on("connected", () => console.log("Connected to node!"));

// Connect to the ethers.
await global.__RECETHERS.connect();
```
