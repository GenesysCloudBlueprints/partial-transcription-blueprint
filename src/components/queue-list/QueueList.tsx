import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { 
  addSubscription,
  removeSubscription,
  createChannel
} from '../../utils/notificationsController';
import { Accordion, AccordionData } from '../accordion/Accordion';
import { Conversation } from '../conversation/Conversation';
import { 
  authenticate,
  getQueues,
  getAgentByUserId,
  getActiveConversationsForQueue,
} from '../../utils/genesysCloudUtils';
import './QueueList.scss';
import { GenesysDevIcons, GenesysDevIcon } from 'genesys-dev-icons/lib/index';

interface Agent {
  agentName: string,
  imageUri?: string
}

interface ActiveConversationData {
  queueId: string,
  conversations: ActiveConversation[]
}

interface ActiveConversation {
  conversationId: string,
  participants: Participant[]
}

export interface IConversation {
  assignedAgent?: Agent,
  conversationId: string,
  interactions?: Interaction[],
  startTime?: moment.Moment,
  status?: string,
  standing?: Standing
}

export interface Interaction {
  speaker: SpeakerTypes,
  timestamp: string,
  transcript: string
}

interface Queue {
  conversationIds: string[],
  conversations: IConversation[]
  activeUsers: number,
  id: string,
  isExpanded: boolean,
  name: string,
  onQueueUsers: number
}

interface QueueResponse {
  entities: Queue[]
}

interface Word {
  confidence: number,
  offsetMs: number,
  durationMs: number,
  word: string
}

interface Alternative {
  offsetMs: number,
  durationMs: number,
  transcript: string,
  words: Word[]
}

interface Status {
  offsetMs: number,
  status: string
}

interface Transcript {
  utteranceId: string,
  isFinal: boolean,
  channel: string,
  alternatives: Alternative[],
  engineId: string,
  dialect: string,
  agentAssistEnabled: false,
  voiceTranscriptionEnabled: true
}

interface TranscriptEventBody {
  eventTime: string,
  organizationId: string,
  conversationId: string,
  communicationId: string,
  sessionStartTimeMs: number,
  transcriptionStartTimeMs: number,
  transcripts: Transcript[],
  status: Status
}

interface Metadata {
  CorrelationId: string
}

interface TranscriptEvent {
  topicName: string,
  version: string,
  eventBody: TranscriptEventBody,
  metadata: Metadata
}

interface QueueConversationEvent { 
  eventBody: {
    id: string,
    conversationStart: string,
    recordingState: string,
    participants: Participant[]
  }
}

interface Participant {
  connectedTime?: string,
  endTime?: string,
  state: string,
  purpose: string,
  user?: {
    id: string
  }
}

enum SpeakerTypes {
  agent = 'AGENT',
  customer = 'CUSTOMER'
}

export enum Standing {
  goodStanding = 'Good Standing',
  badStanding = 'Bad Standing'
}

/**
 * High-level component for the Active Conversations Dashboard.
 * 
 * @param props 
 * @returns 
 */
export function QueueList(props: any) {

  let closedConversationIds: string[] = [];
  let retryAfter: number = 0;
  const badWords: string[] = ['um', 'uh', 'mm'];

  const [queues, setQueues] = useState<Queue[]>([]);

  // trigger initialization on component mount
  useEffect(() => {
    setupQueues(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  /*
   * Initializes the data and subscriptions for the Active Conversations Dashboard
   */
  function setupQueues() {
    let tempQueues: Queue[];
    // authenticate logged-in user
    authenticate()
      .then((data: any) => {
        createChannel();
        return data;
      })
      // retrieve all queues in the user's organization
      .then((data: any) => {
        console.log('AUTH', data);
        return getQueues();
      })
      // get the active conversations for the queues
      .then((queueResponse: QueueResponse) => {
        console.log('QUEUES', queueResponse);
        tempQueues = queueResponse?.entities;
        setQueues(tempQueues);

        return Promise.all(tempQueues.map((queue: Queue) => getActiveConversationsForQueue(queue.id)))
      })
      // get the assigned agent info for each active conversation
      .then(async (activeConversationResponse: ActiveConversationData[]) => {
        console.log('ACTIVE CONVERSATION RESPONSE', activeConversationResponse);

        return {
          assignedAgentData: await Promise.all(tempQueues.map(async (queue: Queue) => {
            const activeConversationsData = activeConversationResponse.find((data: any) => data?.queueId && data.queueId === queue.id);
            const activeConversations = activeConversationsData?.conversations || [];

            return await Promise.all(activeConversations.map(async (ac: any) => {
              const agent: any = ac.participants?.find((participant: Participant) => participant.purpose?.toLowerCase() === 'agent');
              const agentId: string = agent?.userId || '';
              const { agentName, imageUri } = await getAgentByUserId(agentId);

              return { conversationId: ac.conversationId, agentName, imageUri };
            }));
          })),
          activeConversationResponse
        }
      })
      // update the queues with active conversation data and subscribe to queue conversations
      .then((combinedResponse: any) => {
        console.log('COMBINED RESPONSE', combinedResponse);
        const { activeConversationResponse, assignedAgentData } = combinedResponse;
        tempQueues = tempQueues.map((queue: Queue) => {
          const activeConversationsData = activeConversationResponse?.find((data: any) => data?.queueId && data.queueId === queue.id);
          const activeConversations = activeConversationsData?.conversations || [];

          return {
            ...queue,
            conversationIds: activeConversations.map((ac: any) => ac.conversationId),
            conversations: activeConversations.map((ac: any) => {
              const agent: any =  assignedAgentData?.flat()?.find((a: any) => a.conversationId === ac.conversationId)
              const agentName: string = agent?.agentName || '';
              const imageUri: string = agent?.imageUri || '';

              return {
                assignedAgent: { agentName, imageUri },
                conversationId: ac.conversationId,
                startTime: moment(ac.conversationStart)
              };
            })
          };
        })
        setQueues(tempQueues);
        tempQueues.map((queue: Queue) => subscribeToQueueConversations(tempQueues, queue, queue.id));
      })
      .catch((err: any) => {
        console.error(err);
      });
  }

  /**
   * Subscribes to conversation notifications of the organization's queues
   * 
   * @param baseQueues the org's queues
   * @param matchingQueue the queue to be updated in notification callback function
   * @param queueId id of the matching queue
   */
  async function subscribeToQueueConversations(baseQueues: Queue[], matchingQueue: Queue, queueId: string) {
    const queueConversationTopic: string = `v2.routing.queues.${queueId}.conversations.calls`;

    // the callback fired when subscription notifications are received
    const queueConversationCallback = async (data: QueueConversationEvent) => {
      console.log('QUEUE CONVERSATION DATA', data);
      const { eventBody } = data;

      if (!matchingQueue || closedConversationIds.some((cid: string) => cid === eventBody.id)) return;
      
      const terminatedParticipantsLength = eventBody.participants?.filter((p: Participant) => p.state?.toLowerCase() === 'terminated' || p.state?.toLowerCase() === 'disconnected')?.length || 0;
      const participantsLength = eventBody.participants?.length || 0;
    
      // If the call is disconnected, remove the subscription
      if (participantsLength && terminatedParticipantsLength === participantsLength) {
        closedConversationIds.push(eventBody.id);
        const newQueues: Queue[] = baseQueues.map((queue: Queue) => {
          return {
            ...queue,
            conversationIds: queue.conversationIds?.filter((cId: string) => cId !== eventBody.id),
            conversations: queue.conversations?.filter((c: IConversation) => c.conversationId !== eventBody.id)
          }
        });
        setQueues(newQueues);
        return;
      }

      const conversationAlreadyPresent = matchingQueue.conversationIds?.length > 0 
        && matchingQueue.conversationIds.some((cId: string) => cId === data.eventBody.id);
      
      // update the matching queue with the new conversation, if not already present
      if (!conversationAlreadyPresent) {
        const agent: Participant | undefined = eventBody.participants.find((participant: Participant) => participant.purpose.toLowerCase() === 'agent');
        const agentId: string = agent?.user?.id || '';
        const { agentName, imageUri } = await getAgentByUserId(agentId);

        const sortedParticipants: Participant[] = eventBody.participants
          ?.filter((p: Participant) => p.connectedTime)
          ?.sort((p1: Participant, p2: Participant) => {
            const moment1: moment.Moment = moment(p1.connectedTime);
            const moment2: moment.Moment = moment(p2.connectedTime);
            if (moment1.isBefore(moment2)) return -1;
            else if (moment1.isAfter(moment2)) return 1;
            else return 0;
          });
        
        const startString: string = sortedParticipants?.[0]?.connectedTime || '';
        const newQueue: Queue = {
          ...matchingQueue,
          conversationIds: [...(matchingQueue.conversationIds || []), eventBody.id],
          conversations: [...(matchingQueue.conversations || []), {
            assignedAgent: { agentName, imageUri },
            conversationId: eventBody.id,
            startTime: moment(startString || 0)
          }]
        };
      
        const newQueues: Queue[] = [...baseQueues];
        const queueIndex = queues.indexOf(matchingQueue);
        newQueues.splice(queueIndex, 1, newQueue);
      
        setQueues(newQueues);

        // subscribe to transcripts of the new conversation
        subscribeToTranscript(newQueues, data.eventBody.id);
      }
    }
    // subscribe to transcripts of initial conversations
    matchingQueue.conversationIds?.forEach((cId: string) => subscribeToTranscript(baseQueues, cId));
    // subscribe to the queue's conversations
    addSubscriptionWrapper(queueConversationTopic, queueConversationCallback);
  }

  async function addSubscriptionWrapper(topic: string, cb: any) {
    if (retryAfter > 0) {
      const timeout = retryAfter * 1000;
      setTimeout(() => {
        retryAfter = 0;
        addSubscriptionWrapper(topic, cb);
      }, timeout);
    } else {
      const err = await addSubscription(topic, cb);
      if (err && err.status === 429) {
        retryAfter = err.headers['retry-after'];
        const timeout = retryAfter * 1000;
        setTimeout(() => {
          retryAfter = 0;
          addSubscriptionWrapper(topic, cb);
        }, timeout);
      }
    }
  }

  /**
   * Subscribe to the transcripts of an active conversation
   * 
   * @param baseQueues the org's queues 
   * @param conversationId the id of the conversation
   * @returns 
   */
  async function subscribeToTranscript(baseQueues: Queue[], conversationId: string) {
    if (!conversationId) return;

    const transcriptionTopic = `v2.conversations.${conversationId}.transcription`;

    // the callback triggered when a transcription notification is received
    const transcriptionCallback = (data: TranscriptEvent) => {
      console.log('CONVERSATION NOTIFICATION', data);

      // unpack relevant data from response
      const { eventBody } = data;
      const { eventTime, transcripts } = eventBody;
      
      // find the matching queue and conversation
      const matchingQueue = baseQueues.find((queue: Queue) => queue.conversationIds?.some((id: string) => id === conversationId));
      const matchingConversation = matchingQueue?.conversationIds?.find((cId: string) => cId === conversationId);

      if (!matchingQueue || !matchingConversation || closedConversationIds.some((cId: string) => cId === conversationId)) return;

      // If the call is disconnected, remove the subscription
      if (eventBody.status?.status === 'SESSION_ENDED') {
        cancelSubscription(transcriptionTopic);
        closedConversationIds.push(conversationId);
        const newQueues: Queue[] = baseQueues.map((queue: Queue) => {
          return {
            ...queue,
            conversationIds: queue.conversationIds?.filter((cId: string) => cId !== eventBody.conversationId),
            conversations: queue.conversations?.filter((c: IConversation) => c.conversationId !== eventBody.conversationId)
          }
        });
        setQueues(newQueues);
        return;
      }

      // determine whether the agent spoke a word that puts the conversation in bad standing
      const agentSpokeBadWord: boolean = eventBody.transcripts?.some((transcript: Transcript) => {
        return transcript.channel.toLowerCase() === 'internal' 
          && badWords.some((badWord: string) => transcript.alternatives?.[0]?.transcript?.toLowerCase()?.includes(badWord));
      });

      // add the new interactions
      const newInteractions: Interaction[] = (transcripts || []).map((transcript: Transcript) => {
        const origin = transcript.channel.toLowerCase();
        const speaker: SpeakerTypes = origin === 'internal' ? SpeakerTypes.agent : SpeakerTypes.customer;
        return {
          speaker,
          timestamp: eventTime,
          transcript: transcript.alternatives?.[0].transcript || ''
        };
      })

      const newConversations: IConversation[] = matchingQueue.conversations?.map((conversation: IConversation) => {
          if (conversation.conversationId === conversationId) {
            return {
              ...conversation,
              startTime: conversation.startTime || moment(eventBody.sessionStartTimeMs || 0),
              status: eventBody.status?.status,
              interactions: [
                ...newInteractions,
                ...(conversation.interactions || [])
              ],
              standing: agentSpokeBadWord ? Standing.badStanding : conversation.standing
            }
          } else {
            return conversation;
          }
      });

      // update the queue with the new interactions
      const newQueue: Queue = {
        ...matchingQueue,
        conversations: newConversations
      };

      const newQueues: Queue[] = [...baseQueues];
      const queueIndex = queues.indexOf(matchingQueue);
      newQueues.splice(queueIndex, 1, newQueue);

      setQueues(newQueues);
    };
    addSubscriptionWrapper(transcriptionTopic, transcriptionCallback);
  }

  /**
   * Removes the subscription when a conversation ends.
   * 
   * @param topic the subscription topic for removal
   */
  async function cancelSubscription(topic: string) {
    await removeSubscription(topic, () => console.log(`Removed subscription to topic: ${topic}`));
  }

  /*
   * Renders the accordion components of the Active Conversation Dashboard
   */
  function renderQueueCards() {

    const queueSections: AccordionData[] = queues.map((queue: Queue) => {
      queue.conversations && console.log('QUEUE CONVERSATIONS', queue.conversations);
      // setup conversations
      const conversationSections: AccordionData[] = (queue.conversations || []).map((conversation: IConversation) => {
        const section: AccordionData = {
          sectionClass: conversation.standing === Standing.badStanding 
            ? 'accordion-section--bad-standing'
            : 'accordion-section--good-standing',
          contentClass: 'content--conversation',
          heading: (
            <React.Fragment>
              <span className={conversation.standing === Standing.badStanding ? 'standing-header--bad' : 'standing-header--good'}>
                {conversation.standing === Standing.badStanding 
                  ? <GenesysDevIcon icon={GenesysDevIcons.AppWarnSolid}/> 
                  : <GenesysDevIcon icon={GenesysDevIcons.AppCheckSolid}/> 
                }
              </span>
              <span className="agent-name-title">{conversation.assignedAgent?.agentName}</span>
              <span className="start-title">
                Active since {`${conversation.startTime?.format('h:mm a').toString()}`}
              </span>
           </React.Fragment>
          ),
          content: (
            <Conversation conversation={conversation} />
          ),
          showExpanded: false,
        }
        return section;
      });

      const conversationHeaderClass = queue.conversationIds?.length > 0 ? 'active-header' : 'inactive-header';

      const section: AccordionData = {
        heading: (
          <React.Fragment>
            <span className="queue__header-left">{queue.name || ''}</span>
            <span className={conversationHeaderClass}>{`${queue.conversationIds?.length || 0} active conversations`}</span>
          </React.Fragment>
        ),
        content: (
          <div className="conversations-container">
            <Accordion sections={conversationSections} innerClass="inner-accordion" />
          </div>
        ),
        showExpanded: false
      }
      return section;
    });

    return (
      <Accordion sections={queueSections} outerClass="outer-accordion" />
    );
  }

  return (
    <div className="queue">
      <div className="queue-title">
          <span><span>Active Conversation Dashboard</span></span>
          <p>This is a list of the queues in your organization.  Expand one to see the active conversations for the queue.</p>
      </div>
      {renderQueueCards()}
    </div>
  );
}
