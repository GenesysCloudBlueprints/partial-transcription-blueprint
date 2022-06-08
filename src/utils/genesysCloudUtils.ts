import { clientConfig } from '../config/clientConfig';
import moment from 'moment';
const platformClient = require('purecloud-platform-client-v2/dist/node/purecloud-platform-client-v2.js');

const usersApi = new platformClient.UsersApi();
const analyticsApi = new platformClient.AnalyticsApi();
const routingApi = new platformClient.RoutingApi();

const client = platformClient.ApiClient.instance;
const { clientId, redirectUri } = clientConfig;

const cache: any = {};

/**
 * Authenticate the client using Implicit Grant.
 * 
 * @returns auth data
 */
export function authenticate() {
    return client.loginImplicitGrant(clientId, redirectUri, { state: 'state' })
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
