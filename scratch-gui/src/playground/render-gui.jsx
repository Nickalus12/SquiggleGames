import React from 'react';
import GUI from '../containers/gui.jsx';

const RenderGUI = props => (
    <GUI
        cloudHost=""
        canUseCloud={false}
        hasCloudPermission={false}
        canSave={false}
        basePath={process.env.ROOT}
        canEditTitle
        enableCommunity
        {...props}
    />
);

export default RenderGUI;
