import React from 'react';
import {shallow} from 'enzyme';
import TargetHighlight from '../../../src/containers/target-highlight.jsx';

const Highlight = TargetHighlight.WrappedComponent;

describe('TargetHighlight', () => {
    const makeVm = getBounds => ({
        runtime: {
            getTargetById: id => (id === 'sprite1' ? {id, drawableID: 7} : null)
        },
        renderer: {
            getNativeSize: () => [480, 360],
            getBounds
        }
    });

    const render = vm => shallow(
        <Highlight
            className="highlight"
            highlightedTargetId="sprite1"
            highlightedTargetTime={1}
            stageHeight={360}
            stageWidth={480}
            vm={vm}
        />
    );

    test('outlines the hovered sprite', () => {
        const wrapper = render(makeVm(() => ({left: -10, right: 10, top: 10, bottom: -10})));
        expect(wrapper.find('div.highlight').exists()).toBe(true);
    });

    test('renders nothing when the sprite has no drawable on the stage', () => {
        const wrapper = render(makeVm(() => {
            throw new TypeError('can\'t access property "needsConvexHullPoints", t is undefined');
        }));
        expect(wrapper.isEmptyRender()).toBe(true);
    });
});
