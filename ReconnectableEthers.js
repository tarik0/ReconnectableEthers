"use strict";

const ethers = require("ethers");
const AsyncLock = require("async-lock");
const EventEmitter = require("events").EventEmitter;

/**
 * @notice RecEthers:
 *  A wrapper for the ethers.js module
 *  with the auto reconnection support.
 *  @dev This class is for serve-side Node JS.
 * 
 * Events:
 *  @notice `connected`:
 *      This event triggers when websocket is connected to the node.
 * 
 *  @notice `disconnected`:
 *      This event triggers when websocket is disconnected from the node.
 *      @dev It only triggers once after disconnection.
 * 
 *  @notice `pending`:
 *      This event triggers when a new pending transaction arrives.
 *  
 *  @notice `block`:
 *      This event triggers when a new block gets mined.
 * 
 * Functions:
 *  @notice `init`:
 *      Initializes the class.
 *      @param `uri`: Websocket URI.
 *      @dev You can do async things here.
 * 
 *  @notice `connect`:
 *      Connect to the websocket.
 *  
 *  @notice `reconnect`:
 *      Disconnect from the websocket and reconnect it again.
 * 
 *  @notice `waitConnection`:
 *      Waits until connection is established.
 * 
 * Locks:
 *  @notice `startConnection`:
 *      Locks itself when the function `connect` is called.
 *      Unlocks when `__customOpen` gets triggered.
 *      Unlocks when `__customClose` gets triggered and the websocket state is OPEN.
 * 
 *  @author cool guy (tarik0)
 */
class RecEthers extends EventEmitter {
    /** Construct the class. */
    constructor() {
        super();

        this.uri = undefined;
        this.lock = new AsyncLock();

        this._isConnected = false;
        this._lastConnectionResponse = 0;
        this._lastTransaction = undefined;
    }

    /**
     * Initialize the class.
     * @param {String} uri Websocket address.
     * @param {Integer} max_timeout Maximum timeout.
     */
    async init(uri, max_timeout) {
        this.uri = uri;
        this.MAX_TIMEOUT = max_timeout;
    }

    /**
     * Try to establish connection.
     */
    __establishConnection() {
        return new Promise(async (resolve, reject) => {
            // Clear the last response.
            this._lastConnectionResponse = 0;
            this._lastTransaction = undefined;

            // Start connection.
            this.provider = new ethers.providers.WebSocketProvider(this.uri);

            // Remove old listeners.
            this.provider.removeAllListeners("pending");
            this.provider.removeAllListeners("block");

            //  Set event handlers.
            this.provider._websocket.on("error", async (event) => await this.__customClose(event, true));
            this.provider._websocket.on("close", async (event) => await this.__customClose(event, false));
            this.provider._websocket.on("open", async (event) => await this.__customOpen(event));

            // Set new listeners.
            this.provider.on("pending", (txHash) => {
                this._lastTransaction = Date.now();
                this.emit("pending", txHash)
            });
            this.provider.on("block", (blockNum) => this.emit("block", blockNum));

            // Wait until connection returns a response.
            // 0: No response yet.
            // 1: Connected successfully.
            // 2: Got error.
            var tempInterval = setInterval((() => {
                if (this._lastConnectionResponse === 0) return;

                // Clear the interval.
                clearInterval(tempInterval);
                
                if (this._lastConnectionResponse === 1) resolve();
                else reject();
            }).bind(this), 100)
        })
    }

    /**
     * Connect to the websocket.
     */
    connect() {
        return new Promise(async (resolve) => {
            // Return if it's already connected.
            if (this._isConnected) return;

            // Lock the mutex.
            await this.lock.acquire("startConnection", (async () => {
                // Try to connect till successfull.
                var tempInterval = setInterval((async () => {
                    try {
                        // Establish connection.
                        await this.__establishConnection();
                        clearInterval(tempInterval);
                        resolve();
                    } catch {};
                }).bind(this), 100);
            }).bind(this))
        })
    }

    /**
     * Reconnect to the websocket.
     */
    async reconnect() {
        // Close the connection if it's connected.
        // After that the event handler will call that eventualy.
        if (this._isConnected) {
            this.provider._websocket.close();
            return;
        }

        // Connect again.
        await this.connect();
    }

    /* Websocket events. */

    /**
     * Custom websocket open event handler.
     * @param {Event} event Websocket OPEN event.
     */
    async __customOpen(event) {
        // Return if websocket is at CONNECTING state.
        // if (this.provider._websocket.readyState === WebSocket.CONNECTING) return

        // Return if it's already connected.
        if (this._isConnected) return;

        // Set last connection response as success.
        if (this._lastConnectionResponse === 0) this._lastConnectionResponse = 1;
        
        // Clear the keep alive interval.
        if (this.__keepAliveInterval) clearInterval(this.__keepAliveInterval);

        // Start the keep alive interval.
        this.__keepAliveInterval = setInterval((async () => {
            // Check if we have timed out.
            if (this._lastTransaction === undefined) return;
            if (Date.now() - this._lastTransaction < this.MAX_TIMEOUT) return;

            // We've timed out. Reconnect again.
            this.reconnect();
        }).bind(this), 100);

        // Emit the `connected` event.
        this._isConnected = true;
        this.emit("connected");
    }

    /**
     * Custom websocket close event handler.
     * @param {Event} event Websocket CLOSE event.
     * @param {Bool} isError True if it's fired because of an error.
     */
    async __customClose(event, isError) {
        // Return if it's not connected.
        if (this._isConnected === false) return;

        // Set last connection response as success.
        if (this._lastConnectionResponse === 0) this._lastConnectionResponse = 2;

        // Clear the keep alive interval.
        if (this.__keepAliveInterval) clearInterval(this.__keepAliveInterval);

        // Emit `disconnected` event.
        this._isConnected = false;
        this.emit("disconnected");

        // Reconnect.
        await this.reconnect();
    }

    /* Properties */
    
    isConnected = () => { return (this._isConnected && this.provider._websocket.readyState === WebSocket.OPEN); };
    getProvider = () => { return this.provider; };
    getUri = () => { return this.uri; };

    /* Helpers */

    /**
     * Wait till a websocket successfully connects.
     * @returns Promise.
     */
    waitConnection() {
        return new Promise((resolve) => {
            var tmpInterval = setInterval(() => {
                if (!this.isConnected) return;

                clearInterval(tmpInterval);
                resolve();
            }, 100);
        })    
    }
}

module.exports = RecEthers;