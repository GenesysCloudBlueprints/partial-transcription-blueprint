import { clientConfig } from '../config/clientConfig';
import moment from 'moment';
const platformClient = require('purecloud-platform-client-v2/dist/web-cjs/bundle.js');

const usersApi = new platformClient.UsersApi();
const analyticsApi = new platformClient.AnalyticsApi();
const routingApi = new platformClient.RoutingApi();

const client = platformClient.ApiClient.instance;
const { clientId, redirectUri, gcEnvironment } = clientConfig;

client.setEnvironment(gcEnvironment);

// Authenticate in a pop-out window instead of a redirect/iframe.
// Embedding the Genesys Cloud login web application within an iframe is deprecated
// (effective 2027-02-04), so pop-out authentication is required.
// See: https://help.genesys.cloud/announcements/genesys-cloud/deprecation-ability-to-embed-the-genesys-cloud-login-web-application-within-an-iframe/
client.setAuthPopupConfiguration({ usePopup: true });

const cache: any = {};

/**
 * Detects whether the current window is the Genesys Cloud auth popup that has
 * just been redirected back to the configured redirectUri with an auth result
 * (`?code=...` or `?error=...`) in the URL.
 */
export function isInAuthPopup(): boolean {
    return (
        typeof window !== 'undefined' &&
        !!window.opener &&
        window.opener !== window &&
        /[?&](code|error)=/.test(window.location.search)
    );
}

/**
 * Completes popup-based authentication from inside the popup window.
 *
 * The SDK has no popup-side logic: the PKCE exchange runs entirely in the opener
 * (the main app window), which is waiting for a postMessage handshake. When our
 * app happens to load inside the popup after Genesys redirects back to
 * redirectUri with `?code=...`, we must hand the auth result back to the opener
 * so its loginPKCEGrant promise resolves — we must NOT run loginPKCEGrant, render
 * the dashboard, or make any API calls here.
 *
 * Call this before rendering the app. It returns true when it handled a popup
 * completion (in which case the caller should not render the app), false
 * otherwise.
 */
export function completeAuthPopupIfPresent(): boolean {
    if (!isInAuthPopup()) return false;

    const opener: Window | null = window.opener;
    if (!opener) {
        // No opener to hand the result to — nothing we can safely do. Do NOT fall
        // through to the dashboard init.
        console.error('Popup auth completion failed: no window.opener to notify.');
        return true;
    }

    // The message shape must match ApiClient._handleAuthPopupMessage: name
    // "gc_auth_popup", type "message", with search/hash carrying the ?code=...
    // back. Target the opener's exact origin (never '*') — this also matches the
    // origin check the opener runs via redirectUri.startsWith(event.origin).
    const openerOrigin = new URL(redirectUri).origin;
    opener.postMessage(
        {
            name: 'gc_auth_popup',
            type: 'message',
            search: window.location.search,
            hash: window.location.hash,
        },
        openerOrigin,
    );

    // The opener is configured with autoClosePopup (default true) and will close
    // this window after processing the message; close as a fallback.
    window.close();
    return true;
}

/**
 * Authenticate the client using Code Authorization with PKCE.
 *
 * Authentication is performed in a pop-out window (usePopup: true) rather than a
 * same-window redirect so the app continues to work when hosted inside an iframe.
 *
 * @returns auth data
 */
export function authenticate() {
    return client.loginPKCEGrant(clientId, redirectUri, {
        state: 'state',
        authPopupConfiguration: { usePopup: true },
    })
        .then((data: any) => {
            return data;
        })
        .catch((err: any) => {
            console.error(err);
        });
}

/**
 * Get a user by id.
 * 
 * @param id the user's id
 * @returns user search response
 */
export function getAgentByUserId(id: string) {
    if (!id) return '';

    return usersApi.getUser(id)
        .then((data: any) => {
            console.log('AGENT USER DATA', data);
            const agentName: string = data.name;
            const imageUri: string = data.images?.find((i: any) => i.resolution === 'x96')?.imageUri;
            return { agentName, imageUri };
        })
        .catch((err: any) => {
            console.error(err);
            return '';
        });
}

/**
 * Get the queues in logged-in user's organization.
 * 
 * @param skipCache determines whether to check cache before API call
 * @returns response with queues
 */ 
export async function getQueues(skipCache: boolean = false) {
    if (skipCache) {
        return routingApi.getRoutingQueues({ pageSize: 100 });
    } else if (cache['queues']){
        return cache['queues'];
    } else {
        try {
            cache['queues'] = await routingApi.getRoutingQueues({ pageSize: 100 });
            return cache['queues'];
        } catch (err) {
            console.error(err)
        }
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
    paging: {
     pageSize: 25,
     pageNumber: 1
    },
    segmentFilters: [
     {
      type: "or",
      predicates: [
       {
        type: "dimension",
        dimension: "queueId",
        operator: "matches",
        value: queueId
       }
      ]
     }
    ],
    conversationFilters: [
     {
      type: "or",
      predicates: [
       {
        type: "dimension",
        dimension: "conversationEnd",
        operator: "notExists",
        value: null
       }
      ]
     }
    ]
   }
  return analyticsApi.postAnalyticsConversationsDetailsQuery(body)
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
