import React from 'react';
import styles from './invalid-embed.css';
import {APP_NAME} from '../../lib/brand';

const InvalidEmbed = () => (
    <div className={styles.container}>
        <h1>{`This game plays on ${APP_NAME}`}</h1>
        <p>
            {'Open it on '}
            <a
                href="https://squigglegames.app/"
                target="_blank"
                rel="noreferrer"
            >
                {'squigglegames.app'}
            </a>
            {' to play it and see how it was made.'}
        </p>
        <p>
            {'Seeing this by mistake? Tell us at '}
            <a
                href="https://squigglegames.app/#help"
                target="_blank"
                rel="noreferrer"
            >
                {'squigglegames.app/#help'}
            </a>
            {'.'}
        </p>
    </div>
);

export default InvalidEmbed;
