import React from 'react';
import { AccordionSection } from './AccordionSection';
import './Accordion.scss';

interface IAccordionProps {
    sections: AccordionData[],
    innerClass?: string,
    outerClass?: string
}

export interface AccordionData {
    heading: React.ReactNode;
    content: React.ReactNode;
    showExpanded: boolean;
    sectionClass?: string,
    contentClass?: string
}

/**
 * Wrapper component for a collection of accordion sections
 * 
 * @param props 
 * @returns 
 */
export function Accordion(props: IAccordionProps) {
    const outerClass = props.outerClass ? `accordion ${props.outerClass}` : 'accordion';
    const innerClass = props.innerClass ? `section-wrapper ${props.innerClass}` : 'section-wrapper'
    return (
        <div className={outerClass}>
            {props.sections.map((section: AccordionData) => {
                return (
                    <div className={innerClass}>
                        <AccordionSection data={section} />
                    </div>
                );
            })}
        </div>
    )
}