/**
 * This file manages the channel that listens to conversation events.
 * API calls are proxied through the backend server (server.js) which
 * handles Client Credentials authentication.
 */

import { proxyBase } from '../config/clientConfig';

const PROXY = proxyBase;

interface IChannelResponse {
    connectUri: string,
    expires: string,
    id: string
}

interface IEntity {
    id: string
}

interface ISubscriptionResponse {
    entities: IEntity[]
}

let channel: any = {};
let ws: WebSocket | null = null;

// Object that will contain the subscription topic as key and the
// callback function as the value
const subscriptionMap: any = {
    'channel.metadata': () => {
        console.log('Notification heartbeat.');
    }
};

/**
 * Callback function for notications event-handling.
 * It will reference the subscriptionMap to determine what function to run
 * @param {Object} event
 */
function onSocketMessage(event: any) {
    const data = JSON.parse(event.data);
    subscriptionMap[data.topicName](data);
}

/**
 * Creation of the channel. If called multiple times,
 * the last one will be the active one.
 */
export function createChannel() {
    return fetch(`${PROXY}/notifications/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })
        .then((res) => res.json())
        .then((data: IChannelResponse) => {
            console.log('---- Created Notifications Channel ----');
            channel = data;
            // Connect via the proxy WebSocket to avoid browser auth issues
            const proxyWsUrl = `ws://localhost:3001?target=${encodeURIComponent(channel.connectUri)}`;
            ws = new WebSocket(proxyWsUrl);
            ws.onmessage = onSocketMessage;
        });
}

/**
 * Add a subscription to the channel
 * @param {String} topic Genesys Cloud notification topic string
 * @param {Function} callback callback function to fire when the event occurs
 */
export function addSubscription(topic: string, callback: any) {
    const body = [{ 'id': topic }];
    return fetch(`${PROXY}/notifications/channels/${channel.id}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then((res) => res.json())
        .then((data: ISubscriptionResponse) => {
            subscriptionMap[topic] = callback;
            console.log(`Added subscription to ${topic}`, data);
        })
        .catch((err: any) => {
            console.error('Error adding subscription', err);
            return err;
        });
}

/**
 * Remove a subscription from the channel
 * @param {String} topic Genesys Cloud notification topic string
 * @param {Function} callback callback function to fire when the event occurs
 */
export async function removeSubscription(topic: string, callback: any) {
    const res = await fetch(`${PROXY}/notifications/channels/${channel.id}/subscriptions`);
    const { entities = [] } = await res.json();
    const body = entities.filter((entity: any) => entity.id !== topic);
    return fetch(`${PROXY}/notifications/channels/${channel.id}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then((res) => res.json())
        .then((data: ISubscriptionResponse) => {
            subscriptionMap[topic] = callback;
            console.log(`Removed subscription to ${topic}`);
        });
}
