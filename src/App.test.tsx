import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { QueueList } from './components/queue-list/QueueList';
import * as utils from './utils/genesysCloudUtils';
import * as notificationsController from './utils/notificationsController';

jest.mock('./utils/genesysCloudUtils')
jest.mock('./utils/notificationsController');

const mockAuthenticate = jest.spyOn(utils, 'authenticate');
const mockGetQueues = jest.spyOn(utils, 'getQueues');
const mockGetAgentByUserId = jest.spyOn(utils, 'getAgentByUserId');
const mockGetActiveConversationsForQueue = jest.spyOn(utils, 'getActiveConversationsForQueue');
const mockAddSubscription = jest.spyOn(notificationsController, 'addSubscription');

// QueueList component
test('renders expected queue in the QueueList component', async () => {
  mockAuthenticate.mockResolvedValue({});
  mockGetQueues.mockResolvedValue({
    entities: [{
      activeUsers: 0,
      id: '86779fdc-b549-4e66-8c62-7bcfa9eb0540',
      name: 'Transcription Queue',
      onQueueUsers: 0
    }]
  });
  mockGetActiveConversationsForQueue.mockResolvedValue([{
    queueId: '86779fdc-b549-4e66-8c62-7bcfa9eb0540',
    conversations: []
  }]);
  mockGetAgentByUserId.mockResolvedValue({
    agentName: 'Davy Crockett',
    imageUri: 'image.png'
  });
  mockAddSubscription.mockResolvedValue({});

  render(<QueueList />);
  const queueHeader = await screen.findByText('Transcription Queue');
  expect(queueHeader).toBeInTheDocument();
});

// Conversation component
test('renders active conversations in the Conversation component', async () => {
  mockAuthenticate.mockResolvedValue({});
  mockGetQueues.mockResolvedValue({
    entities: [{
      // conversationIds: ['33bb501f-2a0f-44cc-84d1-db2b2fa4c64f'],
      // conversations: [{

      // }],
      activeUsers: 1,
      id: '86779fdc-b549-4e66-8c62-7bcfa9eb0540',
      name: 'Transcription Queue',
      onQueueUsers: 1
    }]
  });
  mockGetActiveConversationsForQueue.mockResolvedValue({
    queueId: '86779fdc-b549-4e66-8c62-7bcfa9eb0540',
    conversations: [{
      conversationId: 'b1ce52cf-ddc6-493f-91c9-b76b05ce932f',
      participants: [{
        user: {
          id: '4ade77ec-ebf6-420f-a862-5e365db5e58c'
        },
        purpose: 'agent'
      }]
    }]
  });
  mockGetAgentByUserId.mockResolvedValue({
    agentName: 'Davy Crockett',
    imageUri: 'image.png'
  });
  mockAddSubscription.mockResolvedValue({});

  act(async () => {
    render(<QueueList />);
    const queueAccordion = await screen.getByText('Transcription Queue');
    fireEvent.click(queueAccordion);
    const queueHeader = await screen.findByText('Davy Crockett');
    expect(queueHeader).toBeInTheDocument();
  });
});