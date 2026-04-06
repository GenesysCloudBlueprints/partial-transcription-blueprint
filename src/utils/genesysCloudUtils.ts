import { proxyBase } from '../config/clientConfig';
import moment from 'moment';

const PROXY = proxyBase;
const cache: any = {};

/**
 * Authenticate via the backend proxy using Client Credentials.
 * The proxy server (server.js) handles the actual OAuth flow.
 *
 * @returns auth confirmation
 */
export function authenticate() {
    return fetch(`${PROXY}/routing/queues?pageSize=1`)
        .then((res) => {
            if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);
            return res.json();
        })
        .then((data: any) => {
            console.log('Proxy connection verified');
            return data;
        })
        .catch((err: any) => {
            console.error('Failed to connect to proxy server:', err);
        });
}

/**
 * Get a user by id.
 *
 * @param id the user's id
 * @returns user search response
 */
export function getAgentByUserId(id: string) {
    if (!id) return Promise.resolve({ agentName: '', imageUri: '' });

    return fetch(`${PROXY}/users/${id}`)
        .then((res) => res.json())
        .then((data: any) => {
            console.log('AGENT USER DATA', data);
            const agentName: string = data.name;
            const imageUri: string = data.images?.find((i: any) => i.resolution === 'x96')?.imageUri;
            return { agentName, imageUri };
        })
        .catch((err: any) => {
            console.error(err);
            return { agentName: '', imageUri: '' };
        });
}

/**
 * Get the queues in logged-in user's organization.
 *
 * @param skipCache determines whether to check cache before API call
 * @returns response with queues
 */
export async function getQueues(skipCache: boolean = false) {
    if (!skipCache && cache['queues']) {
        return cache['queues'];
    }
    try {
        const res = await fetch(`${PROXY}/routing/queues?pageSize=100`);
        const data = await res.json();
        cache['queues'] = data;
        return data;
    } catch (err) {
        console.error(err);
    }
}

/**
 * Get active conversations for queue using conversation analytics details query.
 *
 * @param queueId the queue's id
 * @returns active conversation response
 */
export function getActiveConversationsForQueue(queueId: string) {
    const startInterval = moment().add(-1, 'day').startOf('day');
    const endInterval = moment().add(1, 'day').startOf('day');

    const body: any = {
        interval: `${startInterval.toISOString(true)}/${endInterval.toISOString(true)}`,
        order: "asc",
        orderBy: "conversationStart",
        paging: { pageSize: 25, pageNumber: 1 },
        segmentFilters: [{
            type: "or",
            predicates: [{
                type: "dimension",
                dimension: "queueId",
                operator: "matches",
                value: queueId
            }]
        }],
        conversationFilters: [{
            type: "or",
            predicates: [{
                type: "dimension",
                dimension: "conversationEnd",
                operator: "notExists",
                value: null
            }]
        }]
    };

    return fetch(`${PROXY}/analytics/conversations/details/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then((res) => res.json())
        .then((conversationData: any) => {
            console.log('CONVERSATION DATA', conversationData);
            const conversations: any[] = conversationData?.conversations?.filter((conversation: any) => {
                return conversation.participants?.[0]?.sessions?.[0]?.mediaType === 'voice';
            }) || [];
            return { queueId, conversations };
        })
        .catch((err: any) => {
            console.error(err);
        });
}
