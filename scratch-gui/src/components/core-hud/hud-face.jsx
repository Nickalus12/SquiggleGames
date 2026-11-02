import PropTypes from 'prop-types';
import React from 'react';

const MOODS = ['great', 'good', 'worried', 'low', 'ouch', 'out'];

const INK = '#1b1f3a';

const Eyes = ({mood}) => {
    if (mood === 'ouch') {
        return (
            <g
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3.2"
            >
                <path d="M18 26 L25 30 L18 34" />
                <path d="M46 26 L39 30 L46 34" />
            </g>
        );
    }
    if (mood === 'out') {
        return (
            <g
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeWidth="2.6"
            >
                <path d="M22 30 m0 0 a2 2 0 1 1 2 2 a4 4 0 1 1 -4 -4 a6 6 0 1 1 6 6" />
                <path d="M42 30 m0 0 a2 2 0 1 1 2 2 a4 4 0 1 1 -4 -4 a6 6 0 1 1 6 6" />
            </g>
        );
    }
    const look = mood === 'low' ? 1.5 : 0;
    return (
        <g>
            <ellipse
                cx="22"
                cy="30"
                rx="7"
                ry="8"
                fill="#ffffff"
            />
            <ellipse
                cx="42"
                cy="30"
                rx="7"
                ry="8"
                fill="#ffffff"
            />
            <circle
                cx={23 + look}
                cy="31"
                r="3.6"
                fill={INK}
            />
            <circle
                cx={43 + look}
                cy="31"
                r="3.6"
                fill={INK}
            />
            <circle
                cx={24.4 + look}
                cy="29.4"
                r="1.2"
                fill="#ffffff"
            />
            <circle
                cx={44.4 + look}
                cy="29.4"
                r="1.2"
                fill="#ffffff"
            />
        </g>
    );
};
Eyes.propTypes = {mood: PropTypes.oneOf(MOODS)};

const Brows = ({mood}) => {
    if (mood === 'worried' || mood === 'low') {
        return (
            <g
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeWidth="2.6"
            >
                <path d="M15 21 L27 18" />
                <path d="M49 21 L37 18" />
            </g>
        );
    }
    if (mood === 'great') {
        return (
            <g
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeWidth="2.6"
            >
                <path d="M16 19 Q22 15 28 19" />
                <path d="M36 19 Q42 15 48 19" />
            </g>
        );
    }
    return null;
};
Brows.propTypes = {mood: PropTypes.oneOf(MOODS)};

const Mouth = ({mood}) => {
    switch (mood) {
    case 'great':
        return (
            <g>
                <path
                    d="M21 41 Q32 54 43 41 Z"
                    fill={INK}
                />
                <path
                    d="M27 47 Q32 51 37 47 Q32 45 27 47 Z"
                    fill="#ff7aa8"
                />
            </g>
        );
    case 'good':
        return (
            <path
                d="M23 43 Q32 50 41 43"
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeWidth="3"
            />
        );
    case 'worried':
        return (
            <path
                d="M23 46 Q27.5 42 32 46 T41 46"
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeWidth="3"
            />
        );
    case 'low':
        return (
            <path
                d="M24 48 Q32 41 40 48"
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeWidth="3"
            />
        );
    case 'ouch':
        return (
            <ellipse
                cx="32"
                cy="46"
                rx="4.5"
                ry="5.5"
                fill={INK}
            />
        );
    default:
        return (
            <path
                d="M25 46 L39 46"
                fill="none"
                stroke={INK}
                strokeLinecap="round"
                strokeWidth="3"
            />
        );
    }
};
Mouth.propTypes = {mood: PropTypes.oneOf(MOODS)};

const Extras = ({mood}) => {
    if (mood === 'great' || mood === 'good') {
        return (
            <g fill="#ff8fb8">
                <ellipse
                    cx="13"
                    cy="40"
                    rx="4"
                    ry="2.6"
                    opacity="0.75"
                />
                <ellipse
                    cx="51"
                    cy="40"
                    rx="4"
                    ry="2.6"
                    opacity="0.75"
                />
            </g>
        );
    }
    if (mood === 'low') {
        return (
            <g>
                <path
                    d="M52 16 Q56 23 52 26 Q48 23 52 16 Z"
                    fill="#22d3ee"
                />
                <g transform="rotate(-24 14 42)">
                    <rect
                        x="6"
                        y="39"
                        width="16"
                        height="6"
                        rx="3"
                        fill="#ffd8a8"
                    />
                    <rect
                        x="12"
                        y="39"
                        width="4"
                        height="6"
                        fill="#f2b880"
                    />
                </g>
            </g>
        );
    }
    if (mood === 'out') {
        return (
            <g fill="#ffc53d">
                <path d="M12 10 l1.6 3.4 3.6 0.4 -2.7 2.4 0.8 3.6 -3.3 -1.9 -3.3 1.9 0.8 -3.6 -2.7 -2.4 3.6 -0.4 Z" />
                <path d="M52 8 l1.3 2.7 2.9 0.3 -2.2 1.9 0.6 2.9 -2.6 -1.5 -2.6 1.5 0.6 -2.9 -2.2 -1.9 2.9 -0.3 Z" />
            </g>
        );
    }
    return null;
};
Extras.propTypes = {mood: PropTypes.oneOf(MOODS)};

const HudFace = ({mood, className}) => {
    const safe = MOODS.indexOf(mood) === -1 ? 'good' : mood;
    return (
        <svg
            className={className}
            viewBox="0 0 64 64"
            aria-hidden="true"
            focusable="false"
            data-mood={safe}
        >
            <defs>
                <radialGradient
                    id="sqHudFaceFill"
                    cx="0.38"
                    cy="0.3"
                    r="0.8"
                >
                    <stop
                        offset="0"
                        stopColor="#c4a6ff"
                    />
                    <stop
                        offset="0.55"
                        stopColor="#9966ff"
                    />
                    <stop
                        offset="1"
                        stopColor="#6d4ae0"
                    />
                </radialGradient>
            </defs>
            <path
                d="M32 6 C36 2 42 3 41 8"
                fill="none"
                stroke="#3f2890"
                strokeLinecap="round"
                strokeWidth="3"
            />
            <path
                d="M32 9 C48 9 58 18 58 34 C58 50 47 59 32 59 C17 59 6 50 6 34 C6 18 16 9 32 9 Z"
                fill="url(#sqHudFaceFill)"
                stroke="#3f2890"
                strokeWidth="3"
            />
            <Brows mood={safe} />
            <Eyes mood={safe} />
            <Mouth mood={safe} />
            <Extras mood={safe} />
        </svg>
    );
};

HudFace.propTypes = {
    className: PropTypes.string,
    mood: PropTypes.string
};

export {MOODS};
export default HudFace;
