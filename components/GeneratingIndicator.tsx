import React from 'react';

type GeneratingIndicatorProps = {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
};

export const GeneratingIndicator: React.FC<GeneratingIndicatorProps> = ({
    size = 'md',
    className = '',
}) => {
    return (
        <div
            className={`generating-indicator generating-indicator--${size} ${className}`.trim()}
            aria-label="Generating"
            role="img"
        >
            <span className="generating-indicator__halo" />
            <span className="generating-indicator__ring" />
            <span className="generating-indicator__core" />
            <span className="generating-indicator__orbit generating-indicator__orbit--outer">
                <span className="generating-indicator__particle generating-indicator__particle--1" />
                <span className="generating-indicator__particle generating-indicator__particle--2" />
            </span>
            <span className="generating-indicator__orbit generating-indicator__orbit--inner">
                <span className="generating-indicator__particle generating-indicator__particle--3" />
                <span className="generating-indicator__particle generating-indicator__particle--4" />
            </span>
        </div>
    );
};
