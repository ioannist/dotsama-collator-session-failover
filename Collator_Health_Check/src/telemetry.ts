import { Maybe } from "./telemetry/common";
import { Connection, NodeBlockInfo } from "./telemetry/connection";
import WebSocket from 'ws';
import { Subject } from 'rxjs';

export const nodeBlockInfoSubject = new Subject<NodeBlockInfo>();

const networkHash = process.env.NETWORK_TELEMETRY_HASH;
let socket: Maybe<WebSocket> = null;
let connection: Maybe<Connection> = null

async function handleDisconnect() {
    connection?.clean();
    socket?.close();
    socket = await Connection.socket();
    bindSocket();
}

async function bindSocket() {
    socket?.addEventListener('message', Connection.handleFeedData);
    socket?.addEventListener('close', handleDisconnect);
    socket?.addEventListener('error', handleDisconnect);
    // subscribe();
}

async function subscribe() {
    socket?.send(`subscribe:${networkHash}`);
    console.log(`Subscribed to ${process.env.NETWORK_NAME} telemetry`)
}

export async function startTelemetryClient() {
    socket = await Connection.socket();
    connection = await Connection.create(nodeBlockInfoSubject, socket, bindSocket);
    console.log('Socket connected')
    subscribe();
}