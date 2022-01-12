import { clientConfig } from '../config/clientConfig';
import moment from 'moment';
const platformClient = require('purecloud-platform-client-v2/dist/node/purecloud-platform-client-v2.js');

interface IQueue {
    id: string,
    activeUsers: number,
    onQueueUsers: number
}

const searchApi = new platformClient.SearchApi();
const usersApi = new platformClient.UsersApi();
const analyticsApi = new platformClient.AnalyticsApi();
const tokensApi = new platformClient.TokensApi();
const routingApi = new platformClient.RoutingApi();
const presenceApi = new platformClient.PresenceApi();
// const conversationsApi = new platformClient.ConversationsApi();

/* 
 * This presence ID is hardcoded because System presence IDs are hardcoded into Genesys Cloud, can never change, and are not unique to orgs or regions
 * In constrast, Org presences are not hardcoded.
*/
const offlinePresenceId = 'ccf3c10a-aa2c-4845-8e8d-f59fa48c58e5';

const client = platformClient.ApiClient.instance;
const { clientId, redirectUri } = clientConfig;

const cache: any = {};

export function authenticate() {
    return client.loginImplicitGrant(clientId, redirectUri, { state: 'state' })
        .then((data: any) => {
            return data;
        })
        .catch((err: any) => {
            console.error(err);
        });
}

export function getUserByEmail(email: string) {
    const body = {
        pageSize: 25,
        pageNumber: 1,
        query: [{
            type: "TERM",
            fields: ["email", "name"],
            value: email
        }]
    };
    return searchApi.postUsersSearch(body);
}

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

export function getUserRoutingStatus(userId: string) {
    return usersApi.getUserRoutingstatus(userId);
}

export function logoutUser(userId: string) {
    return Promise.all([
        tokensApi.deleteToken(userId),
        presenceApi.patchUserPresence(userId, 'PURECLOUD', {
            presenceDefinition: { id: offlinePresenceId }
        })
    ])
}

export async function logoutUsersFromQueue(queueId: string) {
    routingApi.getRoutingQueueMembers(queueId)
        .then((data: any) => {
            return Promise.all(data.entities.map((user: any) => logoutUser(user.id)));
        })
        .catch((err: any) => {
            console.error(err);
        })
}

export function getQueueObservations(queues: IQueue[]) {
    const predicates = queues.map((queue: IQueue) => {
        return {
            type: 'dimension',
            dimension: 'queueId',
            operator: 'matches',
            value: queue.id
        }
    })
    const body = {
        filter: {
           type: 'or',
           predicates
        },
        metrics: [ 'oOnQueueUsers', 'oActiveUsers' ],
    }
    return analyticsApi.postAnalyticsQueuesObservationsQuery(body);
}

export function getActiveConversationsForQueue(queueId: string) {
  const startInterval = moment().add(-1, 'day').startOf('day');
  const endInterval = moment().add(1, 'day'). startOf('day');

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

export async function getUserMe(skipCache: boolean = false) {
    if (skipCache) {
        return usersApi.getUsersMe({ 
            expand: ['routingStatus', 'presence'],
        });
    } else if (cache['userMe']){
        return cache['userMe'];
    } else {
        try {
            cache['userMe'] = await usersApi.getUsersMe({ 
                expand: ['routingStatus', 'presence'],
            });
            return cache['userMe'];
        } catch (err) {
            console.error(err)
        }
    }
}

export function getUserDetails(id: string, skipCache: boolean = false) {
    if (skipCache) {
        let tempDetails: any = {};
        return usersApi.getUser(id)
            .then((userDetailsData: any) => {
                tempDetails = userDetailsData;
                return presenceApi.getUserPresence(id, 'purecloud')
            })
            .then((userPresenceData: any) => {
                tempDetails['presence'] = userPresenceData;
                return tempDetails;
            })
            .catch((err: any) => {
                console.error(err);
            });
    } else if (cache['userDetails']){
        return cache['userDetails'];
    } else {
        return usersApi.getUser(id)
            .then((userDetailsData: any) => {
                cache['userDetails'] = userDetailsData || {};
                return presenceApi.getUserPresence(id, 'purecloud')
            })
            .then((userPresenceData: any) => {
                cache['userDetails']['presence'] = userPresenceData;
                return cache['userDetails']
            })
            .catch((err: any) => {
                console.error(err);
            });
    }
  }
