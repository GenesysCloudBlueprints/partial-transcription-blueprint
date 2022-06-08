import React, { useEffect, useRef } from 'react';
import moment from 'moment';
import { IConversation, Interaction, Standing } from '../queue-list/QueueList';
import './Conversation.scss';

interface IProps {
    conversation: IConversation
}

/**
 * Conversation component
 * 
 * @param props 
 * @returns 
 */
export function Conversation(props: IProps) {
    const { conversation } = props;
    
    const transcriptRef: React.RefObject<HTMLDivElement> = useRef(null);

    // autoscroll the transcript as it updates, like a chat window
    useEffect(() => {
        if (props.conversation?.interactions && props.conversation.interactions.length > 0) {
            transcriptRef.current?.scrollIntoView();
        }
    }, [props.conversation?.interactions])

    const standingStyles: any = {
        'color': conversation.standing === Standing.badStanding ? 'red' : 'green'
    };

    return (
        <div className="conversation">
            <div className="status-container">
                <div className="standing-header" style={standingStyles}>
                    {(conversation.standing || Standing.goodStanding)}
                </div>
                <div className="status-lower">
                    <div className="status-group-top">
                        <div className="status-title">Started</div>
                        <div className="status-name"> {conversation.startTime?.format('h:mm a').toString()}</div>
                    </div>
                    <div className="status-group-bottom">
                        <div className="status-title">Agent</div>
                        <div className="status-name">{conversation.assignedAgent?.agentName}</div>
                    </div>
                    <div className="agent-image">
                        <img alt="agent" src={conversation.assignedAgent?.imageUri || ''} />
                    </div>
                </div>
            </div>
            <div className="transcript-wrapper">
                <h5>Transcript</h5>
                <div className="transcript-container">
                    {conversation.interactions?.map((interaction: Interaction, index: number) => {
                        return (
                            <div ref={index === conversation.interactions?.length! - 1 ? transcriptRef : null} className="interaction">
                                <div className="speaker">{interaction.speaker}</div>
                                <div className="interaction-time">
                                    {moment(interaction.timestamp).format('h:mm a').toString()}
                                </div>
                                <div>
                                    {interaction.transcript}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}