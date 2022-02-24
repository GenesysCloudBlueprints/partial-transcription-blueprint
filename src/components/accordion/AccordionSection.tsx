import React, { useState } from 'react';
import { GenesysDevIcons, GenesysDevIcon } from 'genesys-dev-icons/lib/index';
import { AccordionData } from './Accordion';
import './AccordionSection.scss';

interface IAccordionSectionProps {
    data: AccordionData,
}

/**
 * An expandable component of the accordion.
 * 
 * @param props
 * @returns 
 */
export function AccordionSection(props: IAccordionSectionProps) {
    const [isExpanded, setIsExpanded] = useState<boolean>(props.data.showExpanded);

    const { data } = props;
    const { content, heading } = data;
    const sectionContent = isExpanded ? content : undefined;
    const sectionClasses = `accordion-section${data.sectionClass ? ' ' + data.sectionClass : ''}`
    const contentClasses = `content${data.contentClass ? ' ' + data.contentClass : ''}`

    return (
        <div className={sectionClasses}>
            <h4 className="header" onClick={() => setIsExpanded(!isExpanded)}>
                <span className="header-left">{heading}</span>
                <span className="header-right">
                    <GenesysDevIcon className="chevron" icon={isExpanded ? GenesysDevIcons.AppChevronDown : GenesysDevIcons.AppChevronUp} />
                </span>
            </h4>
            <div className={isExpanded ? contentClasses : ''}>
                {sectionContent}
            </div>
        </div>
    );
}